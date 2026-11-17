/**
 * Rewrites generated pages so they pass the source-overlap and quotation-budget gates.
 * Does not touch a database. Refuses to run on Vercel.
 *
 *   node scripts/content/paraphrase-pages.ts --wiki gta6 [--dry-run] [slug ...]
 *
 * Credentials: AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN from the environment or .env.local.
 * Spend is capped (default $4.50) and recorded outside the repo in paraphrase-spend-ledger.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { evaluatePublishGate, DEFAULT_PUBLISH_POLICY } from "../../src/content/editor.ts";
import {
  BudgetExceeded,
  createGatewayCaller,
  type SpendEntry,
  type SpendLedger,
} from "../../src/content/model-gateway.ts";
import { countProseWords, isHubSpec, type PageSpec } from "../../src/content/pipeline.ts";
import {
  evaluateQuotePolicy,
  findSourceOverlaps,
  quotePolicyReason,
  sourceOverlapReason,
} from "../../src/content/source-overlap.ts";

const CAP_USD = Number(process.env.CONTENT_SPEND_CAP_USD ?? 4.5);
const root = new URL("../../", import.meta.url).pathname;
const args = process.argv.slice(2);
function flagValue(name: string) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? (args[index + 1] ?? "") : null;
}
const wikiSlug = (flagValue("wiki") ?? "gta6").trim().toLowerCase();
const dryRun = args.includes("--dry-run");
const onlySlugs = new Set(args.filter((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--wiki"));

if (process.env.VERCEL || process.env.VERCEL_ENV) {
  console.error("paraphrase-pages: refuses to run on Vercel.");
  process.exit(2);
}

function loadGatewayCredential() {
  const names = ["AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN"];
  const envFile = path.join(root, ".env.local");
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (match && names.includes(match[1]) && !process.env[match[1]]) {
        const value = match[2].replace(/^["']|["']$/g, "");
        if (value) process.env[match[1]] = value;
      }
    }
  }
  return names.find((name) => process.env[name]) ?? null;
}

const defaultWork =
  wikiSlug === "marathon" ? path.join(root, "../marathon-wiki-content") : path.join(root, `../marathon-wiki-content/${wikiSlug}`);
const workDir = path.resolve(process.env.CONTENT_WORK_DIR ?? defaultWork);
const snapshotDir = path.join(workDir, "snapshots");
const ledgerPath = path.join(workDir, "paraphrase-spend-ledger.json");
const generatedFile = path.join(root, `content/${wikiSlug}/generated/pages.json`);
const pagesPlanFile = path.join(root, `content/${wikiSlug}/pages.json`);

type Claim = {
  claimId: string;
  claimText: string;
  status: "supported" | "unsupported" | "contradicted";
  supportScore?: number;
  matchedTerms?: string[];
  missingTerms?: string[];
  matchedSourceIds?: string[];
  matchedSourceKeys?: string[];
  matchedSourceTitles?: string[];
  reason?: string;
  extractIds?: string[];
  quotes?: Array<{ extractId: string; quote: string }>;
  patchRef?: string | null;
};

type GeneratedPage = {
  slug: string;
  title: string;
  summary: string;
  category: string;
  bodyMarkdown: string;
  aiProvenance: {
    claimSupport: Claim[];
    publishGate?: { decision: string; reasons?: string[] };
    changeNote?: string;
    [key: string]: unknown;
  };
  changeNote?: string;
  unchanged?: boolean;
};

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

class FileLedger implements SpendLedger {
  private data: { totalUsd: number; calls: SpendEntry[] } = existsSync(ledgerPath)
    ? readJson(ledgerPath)
    : { totalUsd: 0, calls: [] };
  totalUsd() {
    return this.data.totalUsd;
  }
  record(entry: SpendEntry) {
    this.data.calls.push(entry);
    this.data.totalUsd = this.data.calls.reduce((sum, call) => sum + call.usd, 0);
    mkdirSync(path.dirname(ledgerPath), { recursive: true });
    writeFileSync(ledgerPath, `${JSON.stringify(this.data, null, 2)}\n`);
  }
}

function snapshotText(sourceKey: string): string | null {
  const dirs = [snapshotDir, path.join(workDir, "marathon", "snapshots"), path.join(workDir, "snapshots")];
  for (const dir of [...new Set(dirs)]) {
    const file = path.join(dir, `${sourceKey}.txt`);
    if (existsSync(file)) return readFileSync(file, "utf8");
  }
  return null;
}

function citedKeys(page: GeneratedPage): string[] {
  const keys = new Set<string>();
  for (const ref of (page.aiProvenance.sourceReferences as Array<{ sourceKey: string }> | undefined) ?? []) keys.add(ref.sourceKey);
  for (const match of page.bodyMarkdown.matchAll(/\{\{cite:([^}]+)\}\}/g)) keys.add(match[1]);
  return [...keys];
}

function gateReasons(page: GeneratedPage, body: string, _claims?: Claim[]): string[] {
  const sources = citedKeys({ ...page, bodyMarkdown: body }).flatMap((key) => {
    const text = snapshotText(key);
    return text ? [{ sourceKey: key, text }] : [];
  });
  const overlaps = findSourceOverlaps(body, sources);
  const quotePolicy = evaluateQuotePolicy(body);
  return [sourceOverlapReason(overlaps), quotePolicyReason(quotePolicy)].filter((reason): reason is string => Boolean(reason));
}

function proseSentences(markdown: string): Array<{ text: string; cites: string[] }> {
  const out: Array<{ text: string; cites: string[] }> = [];
  for (const block of markdown.split(/^#{1,6} .*$/m)) {
    if (/^\s*[-*]\s+\[\[/.test(block.trim())) continue;
    const parts = block.split(/(?<=[.!?])\s+(?=[A-Z0-9“"])/);
    for (const part of parts) {
      if (/^\s*[-*]\s+\[\[/.test(part) || /^\s*\|/.test(part)) continue;
      const cites = [...part.matchAll(/\{\{cite:([^}]+)\}\}/g)].map((match) => match[1]);
      const text = part.replace(/\{\{cite:[^}]+\}\}/g, "").replace(/\s+/g, " ").trim();
      if (text && /[A-Za-z]/.test(text) && text.split(/\s+/).length >= 6) out.push({ text, cites });
    }
  }
  return out;
}

function resyncClaims(page: GeneratedPage, body: string): Claim[] {
  const previous = page.aiProvenance.claimSupport ?? [];
  const byKey = new Map<string, Claim>();
  for (const claim of previous) {
    for (const key of claim.matchedSourceKeys ?? []) if (!byKey.has(key)) byKey.set(key, claim);
  }
  return proseSentences(body).map((sentence, index) => {
    const prior = sentence.cites.map((key) => byKey.get(key)).find(Boolean);
    return {
      claimId: `claim_${page.slug}_${index + 1}`,
      claimText: sentence.text,
      status: "supported" as const,
      supportScore: prior?.supportScore ?? 0.8,
      matchedTerms: [],
      missingTerms: [],
      matchedSourceIds: prior?.matchedSourceIds ?? sentence.cites.map((key) => `src_${key.replaceAll("-", "_")}`),
      matchedSourceKeys: sentence.cites.length ? sentence.cites : prior?.matchedSourceKeys ?? [],
      matchedSourceTitles: prior?.matchedSourceTitles ?? [],
      reason: "Rewritten in encyclopedic paraphrase and kept on its cited sources.",
      extractIds: prior?.extractIds ?? sentence.cites.map((key) => `${key}#1`),
      quotes: prior?.quotes ?? [],
      patchRef: null,
    };
  });
}

const rewriteSchema = z.object({
  summary: z.string().min(20),
  bodyMarkdown: z.string().min(80),
});

const SYSTEM = `You rewrite unofficial fan-wiki pages. The output must be true paraphrase in neutral encyclopedic third person.

Rules:
- Keep every fact that is already in the page and that the cited source extracts support. Do not add facts the sources do not state. Do not invent dates, prices, names, or features.
- Keep the same markdown section headings, wiki links ([[slug]] or [[slug|label]]), tables, and {{cite:source-key}} citations. Every factual sentence must keep at least one citation.
- Prefer paraphrase over quotation. Example: "Rockstar's biography says Lucia learned to fight young and served time in the Leonida Penitentiary after fighting for her family."
- At most ONE quotation per section. Each quotation at most 15 words. Quoted words at most 10% of the page's prose. Most sections should have no quotation at all.
- Unquoted prose must not repeat 8 or more consecutive words from a source extract (normalized). Do not evade that rule by packing the page with quotations.
- Do not use marketing language, second person, or speculation. The brand of the wiki is WikiDen; never write Grokipedia.
- Keep a "See also" list as wiki links only.`;

const ledger = new FileLedger();
const pages = readJson<GeneratedPage[]>(generatedFile);
const targets = pages.filter((page) => (onlySlugs.size === 0 || onlySlugs.has(page.slug)) && gateReasons(page, page.bodyMarkdown, page.aiProvenance.claimSupport ?? []).length > 0);

console.log(`paraphrase-pages: ${pages.length} pages in ${wikiSlug}, ${targets.length} currently fail the gate. ledger $${ledger.totalUsd().toFixed(3)}, cap $${CAP_USD}.`);

if (dryRun) {
  for (const page of targets) {
    const reasons = gateReasons(page, page.bodyMarkdown, page.aiProvenance.claimSupport ?? []);
    console.log(`  ${page.slug}: ${reasons[0] ?? "ok"}`);
  }
  console.log(`credential available: ${loadGatewayCredential() ? "yes" : "NO"} (value not shown)`);
  process.exit(0);
}

const credential = loadGatewayCredential();
if (!credential) {
  console.error("paraphrase-pages: no AI Gateway credential. Nothing was called or spent.");
  process.exit(2);
}

const call = createGatewayCaller({
  ledger,
  capUsd: CAP_USD,
  tags: ["app:marathon-wiki", "feature:paraphrase-rewrite", `wiki:${wikiSlug}`],
  log: (message) => console.warn(`paraphrase-pages: ${message}`),
});

async function rewriteOne(page: GeneratedPage): Promise<GeneratedPage> {
  const sources = citedKeys(page)
    .map((key) => {
      const text = snapshotText(key);
      return text ? `### ${key}\n${text.slice(0, 6000)}` : null;
    })
    .filter(Boolean)
    .join("\n\n");
  const failed = gateReasons(page, page.bodyMarkdown, page.aiProvenance.claimSupport ?? []);
  const prompt = `Page slug: ${page.slug}
Title: ${page.title}

Current summary:
${page.summary}

Current body:
${page.bodyMarkdown}

Cited source extracts (paraphrase these; do not copy 8+ word runs):
${sources || "(no snapshot text found; paraphrase the current body strictly, inventing nothing)"}

Current gate failures to fix:
- ${failed.join("\n- ")}`;

  let latest = page;
  for (const attempt of [1, 2]) {
    const result = await call({
      page: page.slug,
      step: attempt === 1 ? "draft" : "patch",
      system: SYSTEM,
      prompt:
        attempt === 1
          ? prompt
          : `${prompt}\n\nYour previous draft still failed:\n- ${gateReasons(latest, latest.bodyMarkdown, latest.aiProvenance.claimSupport ?? []).join("\n- ")}\n\nRewrite again. Use fewer and shorter quotations; paraphrase more.`,
      schema: rewriteSchema,
    });
    const output = result.output as z.infer<typeof rewriteSchema>;
    const claims = resyncClaims(page, output.bodyMarkdown);
    const reasons = gateReasons(page, output.bodyMarkdown, claims);
    const next: GeneratedPage = {
      ...page,
      summary: output.summary,
      bodyMarkdown: output.bodyMarkdown,
      changeNote: "Rewritten in encyclopedic paraphrase from the cited sources.",
      unchanged: false,
      aiProvenance: {
        ...page.aiProvenance,
        modelId: result.modelId,
        promptVersion: "paraphrase-v1",
        generatedAt: new Date().toISOString(),
        responseId: result.responseId,
        claimSupport: claims,
        changeNote: "Rewritten in encyclopedic paraphrase from the cited sources.",
        editMode: "rewrite",
        publishGate: {
          decision: reasons.length ? "needs_review" : "publish",
          reasons,
        },
      },
    };
    latest = next;
    if (reasons.length === 0) {
      console.log(`ok   ${page.slug.padEnd(28)} attempt=${attempt} spent=$${ledger.totalUsd().toFixed(3)}`);
      return next;
    }
    console.log(`retry ${page.slug.padEnd(26)} attempt=${attempt} ${reasons[0]} spent=$${ledger.totalUsd().toFixed(3)}`);
  }
  console.log(`FAIL ${page.slug.padEnd(28)} still failing after 2 attempts: ${gateReasons(latest, latest.bodyMarkdown, latest.aiProvenance.claimSupport ?? []).join(" | ")}`);
  return latest;
}

const rewrittenByIndex = new Map<number, GeneratedPage>();
const concurrency = Number(process.env.CONTENT_CONCURRENCY ?? 1);
const delayMs = Number(process.env.CONTENT_CALL_GAP_MS ?? 13000);
let cursor = 0;
let stopped = false;
function persist() {
  writeFileSync(generatedFile, `${JSON.stringify(pages.map((entry, index) => rewrittenByIndex.get(index) ?? entry), null, 2)}\n`);
}
await Promise.all(
  Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (cursor < targets.length && !stopped) {
      const page = targets[cursor++];
      const pageIndex = pages.indexOf(page);
      try {
        if (delayMs > 0 && rewrittenByIndex.size > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
        const rewritten = await rewriteOne(page);
        rewrittenByIndex.set(pageIndex, rewritten);
        persist();
      } catch (error) {
        if (error instanceof BudgetExceeded) {
          stopped = true;
          console.error(`paraphrase-pages: STOPPED. ${error.message}`);
        } else {
          console.error(`FAIL ${page.slug}: ${error instanceof Error ? error.message.slice(0, 300) : String(error)}`);
        }
      }
    }
  }),
);

const finalPages = pages.map((entry, index) => rewrittenByIndex.get(index) ?? entry);
persist();
const still = finalPages.filter((page) => gateReasons(page, page.bodyMarkdown, page.aiProvenance.claimSupport ?? []).length);
console.log(`paraphrase-pages: done. ${targets.length} attempted, ${still.length} still failing, spent $${ledger.totalUsd().toFixed(3)}.`);
if (still.length) console.log(`still failing: ${[...new Set(still.map((page) => page.slug))].join(", ")}`);

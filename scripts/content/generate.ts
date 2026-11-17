/**
 * Generates the real Marathon wiki pages LOCALLY on the box and writes them to committed files
 * that the preview seed loads. It never touches a database and refuses to run on Vercel.
 *
 *   node scripts/content/generate.ts --dry-run          # build every prompt, estimate cost, no AI calls
 *   node scripts/content/generate.ts [--wiki marathon] [slug ...]  # generate (all planned pages, or the given slugs)
 *   node scripts/content/generate.ts --write-only       # rebuild the committed files from runs/ (no model calls)
 *   (--resume regenerates every cached page written with an older prompt version; it can spend.)
 *
 * Inputs:  content/<wiki>/{sources,pages,wiki}.json (default wiki: marathon), rendered snapshots outside the repo
 *          (../marathon-wiki-content[/wiki]/snapshots, from scripts/content/snapshot.mjs --wiki).
 * Outputs: content/<wiki>/generated/pages.json            (bodies + aiProvenance)
 *          content/<wiki>/generated/sources.manifest.json (url, fetch date, sha256, cited quotes ONLY)
 *          Pass --wiki gta6 for the Grand Theft Auto VI tenant.
 * Credentials: AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN from the environment or .env.local. Nothing
 *          else is read from .env.local, and no secret is ever printed.
 * Spend:   every call's token usage is priced and appended to a ledger outside the repo; the run
 *          stops before any call that could take the running total past the cap (default $15).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { buildCorpus, composePage, type ComposedPage, type Snapshot } from "../../src/content/editor.ts";
import {
  BudgetExceeded,
  FALLBACK_MODEL,
  MODEL_PRICES as PRICES,
  PRIMARY_MODEL,
  createGatewayCaller,
  type SpendEntry,
  type SpendLedger,
} from "../../src/content/model-gateway.ts";
import { CONTENT_PROMPT_VERSION, DRAFT_SYSTEM, buildDraftPrompt, datePatchText, draftSystemFor, selectExtracts, type PageSpec, type SourceRecord, type WikiDraftContext } from "../../src/content/pipeline.ts";

const CAP_USD = Number(process.env.CONTENT_SPEND_CAP_USD ?? 15);

const root = new URL("../../", import.meta.url).pathname;
const args = process.argv.slice(2);
function flagValue(name: string) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? (args[index + 1] ?? "") : null;
}
const wikiSlug = (flagValue("wiki") ?? "marathon").trim().toLowerCase();
if (!/^[a-z0-9-]+$/.test(wikiSlug)) {
  console.error("generate: --wiki must be a lowercase slug.");
  process.exit(1);
}
const defaultWork = wikiSlug === "marathon" ? path.join(root, "../marathon-wiki-content") : path.join(root, `../marathon-wiki-content/${wikiSlug}`);
const workDir = path.resolve(process.env.CONTENT_WORK_DIR ?? defaultWork);
const snapshotDir = path.join(workDir, "snapshots");
const runsDir = path.join(workDir, "runs");
const ledgerPath = path.join(workDir, "spend-ledger.json");
const outDir = path.join(root, `content/${wikiSlug}/generated`);

if (process.env.VERCEL || process.env.VERCEL_ENV) {
  console.error("generate: refusing to run on Vercel. Content is generated locally and committed.");
  process.exit(1);
}

const dryRun = args.includes("--dry-run");
const writeOnly = args.includes("--write-only"); // rebuild the committed files from cached runs, no model calls
const resume = args.includes("--resume") || writeOnly; // keep cached pages written with the current prompt version
const onlySlugs = new Set(args.filter((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--wiki"));

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

/** Only the two gateway credential names are taken from .env.local. Values are never logged. */
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

const contentDir = path.join(root, "content", wikiSlug);
if (!existsSync(path.join(contentDir, "pages.json")) || !existsSync(path.join(contentDir, "sources.json"))) {
  console.error(`generate: missing content/${wikiSlug}/pages.json or sources.json.`);
  process.exit(1);
}
const sourcesList = readJson<SourceRecord[]>(path.join(contentDir, "sources.json"));
const sources = new Map(sourcesList.map((source) => [source.sourceKey, source]));
const pages = readJson<PageSpec[]>(path.join(contentDir, "pages.json"));
const wikiContext: WikiDraftContext = existsSync(path.join(contentDir, "wiki.json"))
  ? readJson<WikiDraftContext>(path.join(contentDir, "wiki.json"))
  : { subject: "Marathon, Bungie's 2026 extraction shooter", officialPublisher: "Bungie" };
const draftSystem = draftSystemFor(wikiContext);
const titles = new Map(pages.map((page) => [page.slug, page.title]));
const snapshotIndexFile = path.join(snapshotDir, "index.json");
const snapshotIndex = existsSync(snapshotIndexFile)
  ? readJson<Record<string, { url: string; fetchedAt: string; sha256: string | null; ok: boolean; httpStatus: number }>>(snapshotIndexFile)
  : {};
if (!existsSync(snapshotIndexFile)) {
  console.warn(`generate: no snapshot index at ${snapshotDir}/index.json; run scripts/content/snapshot.mjs --wiki ${wikiSlug} first.`);
}

const snapshots: Snapshot[] = sourcesList.flatMap((source) => {
  const entry = snapshotIndex[source.sourceKey];
  const file = path.join(snapshotDir, `${source.sourceKey}.txt`);
  if (!entry?.ok || !existsSync(file)) {
    console.warn(`generate: no usable snapshot for ${source.sourceKey}; it will not be offered to the model.`);
    return [];
  }
  return [{ sourceKey: source.sourceKey, text: readFileSync(file, "utf8"), sha256: entry.sha256, fetchedAt: entry.fetchedAt }];
});
const corpus = buildCorpus(sourcesList, snapshots);
const { extractsBySource } = corpus;

/** Spend ledger kept outside the repo, so the cap holds across runs. */
class FileLedger implements SpendLedger {
  private data: { totalUsd: number; calls: SpendEntry[] } = existsSync(ledgerPath) ? readJson(ledgerPath) : { totalUsd: 0, calls: [] };
  totalUsd() {
    return this.data.totalUsd;
  }
  record(entry: SpendEntry) {
    this.data.calls.push(entry);
    this.data.totalUsd += entry.usd;
    writeFileSync(ledgerPath, JSON.stringify(this.data, null, 2));
  }
}
const ledger = new FileLedger();

type PageResult = Omit<ComposedPage, "gate">;

/** Cached pages predate the patch-dating rule; apply it deterministically so no model call is needed. */
function withPatchDates(result: PageResult): PageResult {
  let bodyMarkdown = result.bodyMarkdown;
  const claimSupport = result.aiProvenance.claimSupport.map((claim) => {
    if (claim.status !== "supported") return claim;
    const dated = datePatchText(claim.claimText, claim.matchedSourceKeys, sources);
    if (!dated || !bodyMarkdown.includes(claim.claimText)) return claim;
    bodyMarkdown = bodyMarkdown.replace(claim.claimText, dated.text);
    return { ...claim, claimText: dated.text, patchRef: dated.patchRef };
  });
  return { ...result, bodyMarkdown, aiProvenance: { ...result.aiProvenance, claimSupport } };
}

function writeOutputs(rawResults: PageResult[]) {
  mkdirSync(outDir, { recursive: true });
  const results = rawResults.map(withPatchDates);
  // Earlier published revisions of a page (runs/<slug>.history.json, oldest first; written by
  // export-from-db.ts) are emitted before its current version so the preview shows real history.
  const history = (slug: string) => {
    const file = path.join(runsDir, `${slug}.history.json`);
    return existsSync(file) ? readJson<PageResult[]>(file).map(withPatchDates) : [];
  };
  const ordered = pages.flatMap((spec) => {
    const current = results.filter((result) => result.slug === spec.slug);
    return current.length ? [...history(spec.slug), ...current] : [];
  });
  writeFileSync(
    path.join(outDir, "pages.json"),
    `${JSON.stringify(
      ordered.map(({ citedExtractIds: _cited, citedExtracts: _extracts, rejected: _rejected, ...page }) => page),
      null,
      2,
    )}\n`,
  );

  // The repo is public: commit provenance and only the passages a published claim cites.
  const cited = new Map<string, Set<string>>();
  // Only the verbatim quotes each published claim relies on, not the surrounding passages.
  const quotesById = new Map<string, Set<string>>();
  for (const result of ordered) {
    for (const claim of result.aiProvenance.claimSupport) {
      for (const quote of claim.quotes) quotesById.set(quote.extractId, (quotesById.get(quote.extractId) ?? new Set()).add(quote.quote));
    }
  }
  for (const result of ordered) {
    for (const id of result.citedExtractIds) {
      const key = id.split("#")[0];
      cited.set(key, (cited.get(key) ?? new Set()).add(id));
    }
  }
  const manifest = sourcesList.map((source) => {
    const entry = snapshotIndex[source.sourceKey];
    return {
      sourceKey: source.sourceKey,
      url: source.url,
      authorityTier: source.authorityTier,
      fetchedAt: entry?.fetchedAt ?? null,
      httpStatus: entry?.httpStatus ?? null,
      contentSha256: entry?.sha256 ?? null,
      citedExtracts: [...(cited.get(source.sourceKey) ?? [])].sort().map((id) => ({ id, quotes: [...(quotesById.get(id) ?? [])] })),
    };
  });
  writeFileSync(path.join(outDir, "sources.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

const targets = pages.filter((spec) => onlySlugs.size === 0 || onlySlugs.has(spec.slug));
const today = new Date().toLocaleDateString("en-US", { timeZone: "America/Chicago", year: "numeric", month: "long", day: "numeric" });

if (dryRun) {
  let inputChars = 0;
  for (const spec of targets) {
    const extracts = selectExtracts(spec, extractsBySource);
    const prompt = buildDraftPrompt(spec, extracts, sources, today);
    inputChars += prompt.length + draftSystem.length;
    console.log(`${spec.slug.padEnd(24)} extracts=${String(extracts.length).padStart(2)} sources=${new Set(extracts.map((e) => e.sourceKey)).size} promptChars=${prompt.length}`);
  }
  const draftIn = inputChars / 4;
  const est = (model: string) => {
    const p = PRICES[model];
    // draft in + check in (~0.8x of draft) ; outputs ~6k draft + ~3k check tokens per page incl. reasoning
    return (draftIn * 1.8) * p.input + targets.length * 9_000 * p.output;
  };
  console.log(`dry run: ${targets.length} pages, ~${Math.round(draftIn).toLocaleString()} draft input tokens. Estimated: gpt-5-mini $${est(PRIMARY_MODEL).toFixed(2)}, gpt-5-nano $${est(FALLBACK_MODEL).toFixed(2)}. Ledger so far $${ledger.totalUsd().toFixed(2)}.`);
  console.log(`credential available: ${loadGatewayCredential() ? "yes" : "NO"} (value not shown)`);
  process.exit(0);
}

const credential = loadGatewayCredential();
if (!credential && !writeOnly) {
  console.error("generate: no AI Gateway credential. Set AI_GATEWAY_API_KEY (or VERCEL_OIDC_TOKEN) in .env.local. Nothing was called or spent.");
  process.exit(2);
}

mkdirSync(runsDir, { recursive: true });
const call = createGatewayCaller({ ledger, capUsd: CAP_USD, tags: ["app:marathon-wiki", "feature:real-content-generation", `wiki:${wikiSlug}`], log: (message) => console.warn(`generate: ${message}`) });
const CONCURRENCY = Number(process.env.CONTENT_CONCURRENCY ?? 4);
let stopped = false;

async function runOne(spec: PageSpec): Promise<PageResult | null> {
  const cache = path.join(runsDir, `${spec.slug}.json`);
  const cached = existsSync(cache) ? readJson<PageResult>(cache) : null;
  if (resume && cached?.aiProvenance.promptVersion === CONTENT_PROMPT_VERSION) return cached;
  if (!targets.includes(spec) || stopped || writeOnly) return cached;
  try {
    const { gate: _gate, ...result } = await composePage({ spec, corpus, titles, today, call, draftSystem });
    writeFileSync(cache, JSON.stringify(result, null, 2));
    const counts = result.aiProvenance.claimSupport.reduce<Record<string, number>>((acc, claim) => ({ ...acc, [claim.status]: (acc[claim.status] ?? 0) + 1 }), {});
    console.log(`ok   ${spec.slug.padEnd(24)} ${JSON.stringify(counts)} rejected=${result.rejected.length} gate=${result.aiProvenance.publishGate.decision} model=${result.aiProvenance.modelId} spent=$${ledger.totalUsd().toFixed(3)}`);
    return result;
  } catch (error) {
    if (error instanceof BudgetExceeded) {
      stopped = true;
      console.error(`generate: STOPPED. ${error.message}`);
    } else {
      console.error(`FAIL ${spec.slug}: ${error instanceof Error ? error.message.slice(0, 300) : String(error)}`);
    }
    return cached;
  }
}

// A small worker pool; results keep the page-plan order.
const byIndex: Array<PageResult | null> = new Array(pages.length).fill(null);
let next = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < pages.length) {
      const index = next++;
      byIndex[index] = await runOne(pages[index]);
    }
  }),
);
const results = byIndex.filter((result): result is PageResult => result !== null);

writeOutputs(results);
console.log(`generate: wrote ${results.length} pages. Total spend so far $${ledger.totalUsd().toFixed(3)} (cap $${CAP_USD}).`);

/**
 * Generates the real Marathon wiki pages LOCALLY on the box and writes them to committed files
 * that the preview seed loads. It never touches a database and refuses to run on Vercel.
 *
 *   node scripts/content/generate.ts --dry-run          # build every prompt, estimate cost, no AI calls
 *   node scripts/content/generate.ts [slug ...]         # generate (all 40 pages, or the given slugs)
 *
 * Inputs:  content/marathon/{sources,pages}.json, rendered snapshots outside the repo
 *          (../marathon-wiki-content/snapshots, from scripts/content/snapshot.mjs).
 * Outputs: content/marathon/generated/pages.json            (bodies + aiProvenance)
 *          content/marathon/generated/sources.manifest.json (url, fetch date, sha256, cited extracts ONLY)
 * Credentials: AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN from the environment or .env.local. Nothing
 *          else is read from .env.local, and no secret is ever printed.
 * Spend:   every call's token usage is priced and appended to a ledger outside the repo; the run
 *          stops before any call that could take the running total past the cap (default $15).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { generateText, Output } from "ai";

import {
  CHECK_SYSTEM,
  DRAFT_SYSTEM,
  assembleMarkdown,
  buildCheckPrompt,
  buildDraftPrompt,
  buildProvenance,
  chunkSnapshot,
  claimCheckSchema,
  draftSchema,
  parseWeaponTable,
  quoteOccursIn,
  resolveClaims,
  selectExtracts,
  validateDraft,
  type Extract,
  type PageSpec,
  type ResolvedClaim,
  type SourceRecord,
} from "../../src/content/pipeline.ts";

const PRIMARY_MODEL = "openai/gpt-5-mini";
const FALLBACK_MODEL = "openai/gpt-5-nano";
// USD per token, Vercel AI Gateway /v1/models list prices (fetched 2026-11-14).
const PRICES: Record<string, { input: number; output: number }> = {
  "openai/gpt-5-mini": { input: 0.25e-6, output: 2e-6 },
  "openai/gpt-5-nano": { input: 0.05e-6, output: 0.4e-6 },
};
const MAX_CALL_USD = 0.25; // headroom assumed for any single call when checking the cap
const CAP_USD = Number(process.env.CONTENT_SPEND_CAP_USD ?? 15);

const root = new URL("../../", import.meta.url).pathname;
const workDir = path.resolve(process.env.CONTENT_WORK_DIR ?? path.join(root, "../marathon-wiki-content"));
const snapshotDir = path.join(workDir, "snapshots");
const runsDir = path.join(workDir, "runs");
const ledgerPath = path.join(workDir, "spend-ledger.json");
const outDir = path.join(root, "content/marathon/generated");

if (process.env.VERCEL || process.env.VERCEL_ENV) {
  console.error("generate: refusing to run on Vercel. Content is generated locally and committed.");
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const onlySlugs = new Set(args.filter((arg) => !arg.startsWith("--")));

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

const sourcesList = readJson<SourceRecord[]>(path.join(root, "content/marathon/sources.json"));
const sources = new Map(sourcesList.map((source) => [source.sourceKey, source]));
const pages = readJson<PageSpec[]>(path.join(root, "content/marathon/pages.json"));
const titles = new Map(pages.map((page) => [page.slug, page.title]));
const snapshotIndex = readJson<Record<string, { url: string; fetchedAt: string; sha256: string | null; ok: boolean; httpStatus: number }>>(
  path.join(snapshotDir, "index.json"),
);

const extractsBySource = new Map<string, Extract[]>();
for (const source of sourcesList) {
  const entry = snapshotIndex[source.sourceKey];
  const file = path.join(snapshotDir, `${source.sourceKey}.txt`);
  if (!entry?.ok || !existsSync(file)) {
    console.warn(`generate: no usable snapshot for ${source.sourceKey}; it will not be offered to the model.`);
    continue;
  }
  extractsBySource.set(source.sourceKey, chunkSnapshot(source.sourceKey, readFileSync(file, "utf8")));
}
const extractsById = new Map([...extractsBySource.values()].flat().map((extract) => [extract.id, extract]));

type Ledger = { totalUsd: number; calls: Array<{ at: string; page: string; step: string; model: string; inputTokens: number; outputTokens: number; usd: number }> };
const ledger: Ledger = existsSync(ledgerPath) ? readJson<Ledger>(ledgerPath) : { totalUsd: 0, calls: [] };

function record(page: string, step: string, model: string, usage: { inputTokens?: number; outputTokens?: number } | undefined) {
  const price = PRICES[model] ?? PRICES[PRIMARY_MODEL];
  const inputTokens = usage?.inputTokens ?? 0;
  const outputTokens = usage?.outputTokens ?? 0;
  const usd = inputTokens * price.input + outputTokens * price.output;
  ledger.calls.push({ at: new Date().toISOString(), page, step, model, inputTokens, outputTokens, usd });
  ledger.totalUsd += usd;
  writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
}

class BudgetExceeded extends Error {}

async function callModel<T>(page: string, step: string, system: string, prompt: string, schema: import("zod").ZodType<T>) {
  if (ledger.totalUsd + MAX_CALL_USD > CAP_USD) {
    throw new BudgetExceeded(`Spend cap: $${ledger.totalUsd.toFixed(2)} spent, next call could pass $${CAP_USD}.`);
  }
  let lastError: unknown;
  for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    try {
      const result = await generateText({
        model,
        system,
        prompt,
        output: Output.object({ schema }),
        providerOptions: {
          openai: { reasoningEffort: "low" },
          gateway: { tags: ["app:marathon-wiki", "feature:real-content-generation"] },
        },
      });
      record(page, step, model, result.usage);
      const modelId = (result.response as { modelId?: string } | undefined)?.modelId ?? model;
      const responseId = (result.response as { id?: string } | undefined)?.id ?? null;
      return { output: schema.parse(result.output), modelId: modelId.includes("/") ? modelId : `openai/${modelId}`, requestedModel: model, responseId };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`generate: ${page} ${step} failed on ${model}: ${message.slice(0, 200)}`);
      if (/401|403|unauthori[sz]ed|forbidden|api key|credential/i.test(message)) break; // fallback cannot help
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function weaponsTable(): { heading: string; intro: ResolvedClaim | null; columns: string[]; rows: string[][]; extract: Extract } | null {
  const text = existsSync(path.join(snapshotDir, "gamesradar-weapons.txt")) ? readFileSync(path.join(snapshotDir, "gamesradar-weapons.txt"), "utf8") : "";
  const rows = parseWeaponTable(text);
  if (rows.length === 0) return null;
  const quote = "Marathon will feature 28 weapons at launch";
  const bungie = extractsBySource.get("bungie-introducing-seasons")?.find((extract) => quoteOccursIn("28 weapons, plus mods, implants, cores", extract.text));
  const press = { id: "gamesradar-weapons#table", sourceKey: "gamesradar-weapons", text: [quote, ...rows.map((row) => `${row.weaponClass}: ${row.name} (${row.ammo})`)].join("\n") };
  if (!quoteOccursIn(quote, text)) return null;
  const quotes = [{ extractId: press.id, quote }];
  if (bungie) quotes.unshift({ extractId: bungie.id, quote: "28 weapons, plus mods, implants, cores" });
  extractsById.set(press.id, press);
  return {
    heading: "Launch weapons",
    intro: {
      claimId: "claim_weapons_table",
      claimText: `Marathon launched with ${rows.length} weapons, listed below by class and ammo type as published by GamesRadar+ on February 26, 2026.`,
      status: "supported",
      sourceKeys: bungie ? ["bungie-introducing-seasons", "gamesradar-weapons"] : ["gamesradar-weapons"],
      extractIds: quotes.map((entry) => entry.extractId),
      quotes,
      reason: "Verified against quoted passages from official and reputable editorial sources.",
      patchRef: null,
      heading: "Launch weapons",
      paragraph: 0,
    },
    columns: ["Weapon", "Class", "Ammo"],
    rows: rows.map((row) => [row.name, row.weaponClass, row.ammo]),
    extract: press,
  };
}

type PageResult = {
  slug: string;
  title: string;
  summary: string;
  category: string;
  bodyMarkdown: string;
  aiProvenance: ReturnType<typeof buildProvenance>;
  rejected: Array<{ text: string; reason: string }>;
  citedExtractIds: string[];
};

async function generatePage(spec: PageSpec, today: string): Promise<PageResult> {
  const extracts = selectExtracts(spec, extractsBySource);
  if (extracts.length === 0) throw new Error(`No relevant extracts for ${spec.slug}.`);
  const known = new Set(extracts.map((extract) => extract.id));

  const draftCall = await callModel(spec.slug, "draft", DRAFT_SYSTEM, buildDraftPrompt(spec, extracts, sources, today), draftSchema);
  const draft = validateDraft(draftCall.output, known);

  let index = 0;
  const checkable = draft.sections.flatMap((section) =>
    section.paragraphs.flatMap((paragraph) => paragraph.map((sentence) => ({ claimId: `claim_${spec.slug}_${(index += 1)}`, text: sentence.text, extractIds: sentence.extractIds }))),
  );
  const checkCall = checkable.length
    ? await callModel(spec.slug, "claim-check", CHECK_SYSTEM, buildCheckPrompt(checkable, extractsById), claimCheckSchema)
    : { output: { checks: [] }, modelId: draftCall.modelId };

  const { claims, dropped } = resolveClaims(draft, checkCall.output.checks, extractsById, sources, spec.slug);
  const table = spec.table === "weapons" ? weaponsTable() : null;
  const allClaims = table?.intro ? [...claims, table.intro] : claims;

  const bodyMarkdown = assembleMarkdown({
    claims,
    sectionOrder: draft.sections.map((section) => section.heading),
    table,
    hubLinks: spec.hubChildren.map((slug) => ({ slug, title: titles.get(slug) ?? slug })),
    related: spec.related.filter((slug) => !spec.hubChildren.includes(slug)).map((slug) => ({ slug, title: titles.get(slug) ?? slug })),
  });

  return {
    slug: spec.slug,
    title: spec.title,
    summary: draft.summary,
    category: spec.category,
    bodyMarkdown,
    aiProvenance: buildProvenance({
      claims: allClaims,
      sources,
      modelId: draftCall.modelId,
      checkModelId: checkCall.modelId,
      responseId: draftCall.responseId,
      generatedAt: new Date().toISOString(),
      extractCount: extracts.length,
    }),
    rejected: [...draft.rejected, ...dropped],
    citedExtractIds: [...new Set(allClaims.flatMap((claim) => claim.quotes.map((quote) => quote.extractId)))],
  };
}

function writeOutputs(results: PageResult[]) {
  mkdirSync(outDir, { recursive: true });
  const ordered = pages.flatMap((spec) => results.filter((result) => result.slug === spec.slug));
  writeFileSync(
    path.join(outDir, "pages.json"),
    `${JSON.stringify(
      ordered.map(({ citedExtractIds: _cited, rejected: _rejected, ...page }) => page),
      null,
      2,
    )}\n`,
  );

  // The repo is public: commit provenance and only the passages a published claim cites.
  const cited = new Map<string, Set<string>>();
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
      citedExtracts: [...(cited.get(source.sourceKey) ?? [])].sort().map((id) => ({ id, text: extractsById.get(id)?.text ?? "" })),
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
    inputChars += prompt.length + DRAFT_SYSTEM.length;
    console.log(`${spec.slug.padEnd(24)} extracts=${String(extracts.length).padStart(2)} sources=${new Set(extracts.map((e) => e.sourceKey)).size} promptChars=${prompt.length}`);
  }
  const draftIn = inputChars / 4;
  const est = (model: string) => {
    const p = PRICES[model];
    // draft in + check in (~0.8x of draft) ; outputs ~6k draft + ~3k check tokens per page incl. reasoning
    return (draftIn * 1.8) * p.input + targets.length * 9_000 * p.output;
  };
  console.log(`dry run: ${targets.length} pages, ~${Math.round(draftIn).toLocaleString()} draft input tokens. Estimated: gpt-5-mini $${est(PRIMARY_MODEL).toFixed(2)}, gpt-5-nano $${est(FALLBACK_MODEL).toFixed(2)}. Ledger so far $${ledger.totalUsd.toFixed(2)}.`);
  console.log(`credential available: ${loadGatewayCredential() ? "yes" : "NO"} (value not shown)`);
  process.exit(0);
}

const credential = loadGatewayCredential();
if (!credential) {
  console.error("generate: no AI Gateway credential. Set AI_GATEWAY_API_KEY (or VERCEL_OIDC_TOKEN) in .env.local. Nothing was called or spent.");
  process.exit(2);
}

mkdirSync(runsDir, { recursive: true });
const results: PageResult[] = [];
for (const spec of pages) {
  const cache = path.join(runsDir, `${spec.slug}.json`);
  if (!targets.includes(spec)) {
    if (existsSync(cache)) results.push(readJson<PageResult>(cache));
    continue;
  }
  try {
    const result = await generatePage(spec, today);
    writeFileSync(cache, JSON.stringify(result, null, 2));
    results.push(result);
    const counts = result.aiProvenance.claimSupport.reduce<Record<string, number>>((acc, claim) => ({ ...acc, [claim.status]: (acc[claim.status] ?? 0) + 1 }), {});
    console.log(`ok   ${spec.slug.padEnd(24)} ${JSON.stringify(counts)} rejected=${result.rejected.length} model=${result.aiProvenance.modelId} spent=$${ledger.totalUsd.toFixed(3)}`);
  } catch (error) {
    if (error instanceof BudgetExceeded) {
      console.error(`generate: STOPPED. ${error.message}`);
      break;
    }
    console.error(`FAIL ${spec.slug}: ${error instanceof Error ? error.message.slice(0, 300) : String(error)}`);
    if (existsSync(cache)) results.push(readJson<PageResult>(cache));
  }
}

writeOutputs(results);
console.log(`generate: wrote ${results.length} pages. Total spend so far $${ledger.totalUsd.toFixed(3)} (cap $${CAP_USD}).`);

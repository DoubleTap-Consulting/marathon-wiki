/**
 * Report unquoted 8+ word runs that match a cited source snapshot.
 *
 *   node scripts/content/check-source-overlap.ts [--wiki gta6] [--wiki marathon]
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { evaluateQuotePolicy, findSourceOverlaps, quotePolicyReason, sourceOverlapReason, type QuotePolicyResult, type SourceOverlap } from "../../src/content/source-overlap.ts";
import { evaluatePublishGate, DEFAULT_PUBLISH_POLICY } from "../../src/content/editor.ts";
import { countProseWords } from "../../src/content/pipeline.ts";

const root = new URL("../../", import.meta.url).pathname;
const args = process.argv.slice(2);
const wikiFlags: string[] = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--wiki" && args[i + 1]) wikiFlags.push(args[++i]);
}
const wikis = wikiFlags.length ? wikiFlags : ["gta6", "marathon"];

type GeneratedPage = {
  slug: string;
  bodyMarkdown: string;
  aiProvenance: {
    claimSupport?: Array<{ status: "supported" | "unsupported" | "contradicted" }>;
    sourceReferences?: Array<{ sourceKey: string }>;
    publishGate?: { decision: string };
  };
};

function snapshotDirs(wiki: string): string[] {
  if (wiki === "gta6") return [path.join("/workspace/marathon-wiki-content/gta6/snapshots")];
  return [
    path.join("/workspace/marathon-wiki-content/marathon/snapshots"),
    path.join("/workspace/marathon-wiki-content/snapshots"),
  ];
}

function loadSnapshot(dirs: string[], sourceKey: string): string | null {
  for (const dir of dirs) {
    const file = path.join(dir, `${sourceKey}.txt`);
    if (existsSync(file)) return readFileSync(file, "utf8");
  }
  return null;
}

function citedKeys(page: GeneratedPage): string[] {
  const keys = new Set<string>();
  for (const ref of page.aiProvenance.sourceReferences ?? []) keys.add(ref.sourceKey);
  for (const match of page.bodyMarkdown.matchAll(/\{\{cite:([^}]+)\}\}/g)) keys.add(match[1]);
  return [...keys];
}

type PageHit = { slug: string; overlaps: SourceOverlap[]; quotePolicy: QuotePolicyResult; decision: string; reason: string | null; missingSnapshots: string[] };

function checkWiki(wiki: string): PageHit[] {
  const file = path.join(root, "content", wiki, "generated", "pages.json");
  if (!existsSync(file)) {
    console.log(`check-source-overlap: no content/${wiki}/generated/pages.json`);
    return [];
  }
  const pages = JSON.parse(readFileSync(file, "utf8")) as GeneratedPage[];
  const dirs = snapshotDirs(wiki);
  const hits: PageHit[] = [];
  for (const page of pages) {
    const sources = [];
    const missingSnapshots: string[] = [];
    for (const key of citedKeys(page)) {
      const text = loadSnapshot(dirs, key);
      if (text) sources.push({ sourceKey: key, text });
      else missingSnapshots.push(key);
    }
    const overlaps = findSourceOverlaps(page.bodyMarkdown, sources);
    const quotePolicy = evaluateQuotePolicy(page.bodyMarkdown);
    const claims = page.aiProvenance.claimSupport ?? [];
    const gate = evaluatePublishGate(claims, DEFAULT_PUBLISH_POLICY, {
      hub: false,
      words: countProseWords(page.bodyMarkdown),
      sourceOverlaps: overlaps,
      quotePolicy,
    });
    const quoteReason = quotePolicyReason(quotePolicy);
    hits.push({
      slug: page.slug,
      overlaps,
      quotePolicy,
      decision: overlaps.length || quotePolicy.reasons.length ? "needs_review" : gate.decision,
      reason: [sourceOverlapReason(overlaps), quoteReason].filter(Boolean).join("; ") || null,
      missingSnapshots,
    });
  }
  return hits;
}

let failed = 0;
for (const wiki of wikis) {
  const results = checkWiki(wiki);
  const flagged = results.filter((row) => row.overlaps.length || row.quotePolicy.reasons.length);
  const overlapCount = results.filter((row) => row.overlaps.length).length;
  const quoteCount = results.filter((row) => row.quotePolicy.reasons.length).length;
  console.log(`\n== ${wiki}: ${results.length} pages, ${flagged.length} failing the source-fidelity gate (${overlapCount} unquoted 8+ word overlaps, ${quoteCount} quotation-budget) ==`);
  for (const row of flagged) {
    failed += 1;
    const bits = [
      row.overlaps.length ? `${row.overlaps.length} overlap run${row.overlaps.length === 1 ? "" : "s"}` : "",
      row.quotePolicy.reasons.length ? "quotation budget" : "",
    ].filter(Boolean);
    console.log(`  FAIL ${row.slug} (${bits.join(", ")})`);
    for (const hit of row.overlaps) {
      console.log(`    [${hit.sourceKey ?? "?"}, ${hit.wordCount} words] ${hit.phrase}`);
    }
    for (const reason of row.quotePolicy.reasons) {
      console.log(`    [quote] ${reason}`);
    }
  }
  if (!flagged.length) console.log("  none");
}
process.exitCode = failed ? 1 : 0;

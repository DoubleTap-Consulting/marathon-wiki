/**
 * Read-only comparison of committed content files against production's public
 * pages on wikiden.gg. Opens no database connection and reads no env secrets.
 *
 *   node scripts/content/dry-run-prod-public.ts [--base https://wikiden.gg]
 *
 * Marathon: search-index.json (title, summary, headings) plus each page's
 * public /history HTML (current revision number). Bodies are not published as
 * markdown, so body equality is not claimed.
 *
 * GTA 6: production hides the tenant, so public .json and HTML paths 404;
 * prod currently serves 0 GTA pages and all generated pages would be new.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { approvedConfirmationPhrase } from "../../src/content/load-approved-revisions.ts";
import { countUpdatedAndNew } from "../../src/content/apply-approved-revisions.ts";

const root = new URL("../../", import.meta.url).pathname;
const args = process.argv.slice(2);
const flag = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? (args[index + 1] ?? "") : null;
};
const base = (flag("base") || "https://wikiden.gg").replace(/\/$/, "");

type SearchEntry = { slug: string; title: string; summary: string; headings?: Array<{ id: string; text: string }> };
type Approved = { slug: string; title: string; summary: string; bodyMarkdown: string };

const SEARCH_SUMMARY_LENGTH = 140;

/** Same shortening as src/wiki/search-index.ts, so a full file summary is comparable to the public index. */
function shortenSummary(text: string) {
  if (text.length <= SEARCH_SUMMARY_LENGTH) return text;
  const cut = text.slice(0, SEARCH_SUMMARY_LENGTH);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), SEARCH_SUMMARY_LENGTH - 20)).trimEnd()}…`;
}

function summariesMatch(live: string, proposed: string) {
  return live === proposed || live === shortenSummary(proposed);
}

async function fetchText(url: string): Promise<{ status: number; contentType: string; robots: string; body: string }> {
  const response = await fetch(url, { redirect: "manual", headers: { "user-agent": "WikiDenProdDryRun/1.0" } });
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    robots: response.headers.get("x-robots-tag") ?? "",
    body: await response.text(),
  };
}

function headingIds(entry: SearchEntry | undefined): string[] {
  return (entry?.headings ?? []).map((h) => h.id);
}

function currentRevisionFromHistory(html: string): number | null {
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  if (/This is the first version of the page/i.test(text)) return 1;
  const match = text.match(/\br\s*(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

export async function dryRunApprovedAgainstPublic(input: {
  base: string;
  tenantSlug: string;
  revisions: Approved[];
  fileSha256: string;
}): Promise<string[]> {
  const lines: string[] = [];
  const indexUrl = `${input.base}/${input.tenantSlug}/search-index.json`;
  const index = await fetchText(indexUrl);
  lines.push(`GET ${indexUrl} -> ${index.status} ${index.contentType.split(";")[0]}`);
  if (index.status !== 200) {
    lines.push("refused: could not load the public search index; no further Marathon comparison.");
    return lines;
  }
  const entries = JSON.parse(index.body) as SearchEntry[];
  const bySlug = new Map(entries.map((e) => [e.slug, e]));
  lines.push(`public search index: ${entries.length} pages.`);
  lines.push(`approved file: ${input.revisions.length} revisions, sha256 ${input.fileSha256.slice(0, 12)}.`);

  let summaryChanged = 0;
  let titleChanged = 0;
  let headingsChanged = 0;
  let missing = 0;
  const rows: string[] = [];
  for (const page of input.revisions) {
    const live = bySlug.get(page.slug);
    const history = await fetchText(`${input.base}/${input.tenantSlug}/${page.slug}/history`);
    const rev = history.status === 200 ? currentRevisionFromHistory(history.body) : null;
    if (!live) {
      missing += 1;
      rows.push(`  ${page.slug}: not on the public index (history HTTP ${history.status}${rev ? `, current r${rev}` : ""}). would insert the page row and its first published revision (new page).`);
      continue;
    }
    const sumSame = summariesMatch(live.summary, page.summary);
    const titleSame = live.title === page.title;
    const headSame = headingIds(live).join(",") === (page.bodyMarkdown.match(/^#{2,3} .+$/gm) || []).map((h) => h.replace(/^#+\s+/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")).join(",");
    // headings compare is approximate (slugified markdown h2/h3 vs index ids); report it but don't over-claim
    if (!sumSame) summaryChanged += 1;
    if (!titleSame) titleChanged += 1;
    if (!headSame) headingsChanged += 1;
    const bits = [
      `current r${rev ?? "?"}`,
      sumSame ? "summary unchanged" : "SUMMARY CHANGES",
      titleSame ? "title unchanged" : "title changes",
    ];
    if (!sumSame) bits.push(`from ${JSON.stringify(live.summary)} to ${JSON.stringify(page.summary)}`);
    rows.push(`  ${page.slug}: ${bits.join("; ")}; would supersede r${rev ?? "?"} with a new published revision.`);
  }
  const { updatedCount, newCount } = countUpdatedAndNew(bySlug.keys(), input.revisions.map((page) => page.slug));
  lines.push(`would update ${updatedCount} existing public page(s) and create ${newCount} new page(s).`);
  lines.push(`summary changes: ${summaryChanged}; title changes: ${titleChanged}; pages missing from the public index: ${missing}.`);
  lines.push("body markdown is not served on a public JSON endpoint; only titles, summaries, and headings from search-index.json, plus revision numbers from /history, were compared.");
  lines.push(...rows);
  const phrase = approvedConfirmationPhrase({
    updatedCount,
    newCount,
    fileSha256: input.fileSha256,
    target: "production",
    tenantSlug: input.tenantSlug,
  });
  lines.push(`confirm phrase if this file is later applied to production: ${phrase}`);
  return lines;
}

export async function dryRunGtaAgainstPublic(input: { base: string; pageCount: number; fileSha256: string }): Promise<string[]> {
  const lines: string[] = [];
  const probes = [`${input.base}/gta6`, `${input.base}/gta6/overview.json`, `${input.base}/gta6/search-index.json`];
  let any200 = false;
  for (const url of probes) {
    const res = await fetchText(url);
    lines.push(`GET ${url} -> HTTP ${res.status} content-type=${res.contentType.split(";")[0] || "(none)"} x-robots-tag=${res.robots || "(none)"}`);
    if (res.status === 200) any200 = true;
  }
  if (any200) {
    lines.push("unexpected: at least one /gta6 path returned 200; not treating GTA 6 as absent on production.");
  } else {
    lines.push(`production currently serves 0 GTA 6 pages (the tenant is hidden). A one-time load would upsert the gta6 game, tenant, and categories (idempotent, same transaction) and introduce all ${input.pageCount} generated pages as new (sha256 ${input.fileSha256.slice(0, 12)}).`);
    lines.push(`confirm phrase if this file is later applied to production: load ${input.pageCount} pages ${input.fileSha256.slice(0, 12)} into production gta6`);
  }
  return lines;
}

function isMain() {
  const entry = process.argv[1];
  return Boolean(entry) && fileURLToPath(import.meta.url) === path.resolve(entry);
}

async function main() {
  const approvedPath = path.join(root, "content/marathon/generated/approved-paraphrase-revisions.json");
  const gtaPath = path.join(root, "content/gta6/generated/pages.json");
  const approvedBytes = readFileSync(approvedPath);
  const gtaBytes = readFileSync(gtaPath);
  const approved = JSON.parse(approvedBytes.toString("utf8")) as Approved[];
  const gtaPages = JSON.parse(gtaBytes.toString("utf8")) as Array<{ slug: string }>;
  const approvedSha = createHash("sha256").update(approvedBytes).digest("hex");
  const gtaSha = createHash("sha256").update(gtaBytes).digest("hex");

  console.log(`== public dry run against ${base} (no database, no secrets) ==`);
  console.log("");
  console.log("-- (a) approved Marathon revisions --");
  for (const line of await dryRunApprovedAgainstPublic({ base, tenantSlug: "marathon", revisions: approved, fileSha256: approvedSha })) {
    console.log(line);
  }
  console.log("");
  console.log("-- (b) GTA 6 generated pages --");
  for (const line of await dryRunGtaAgainstPublic({ base, pageCount: gtaPages.length, fileSha256: gtaSha })) {
    console.log(line);
  }

}

if (isMain()) {
  await main();
}

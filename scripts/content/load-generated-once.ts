/**
 * ONE-TIME load of content/marathon/generated/pages.json into one wiki's database.
 * Code only for production: Mike runs it once, by hand, after the merge and migration.
 *
 *   node scripts/content/load-generated-once.ts [--tenant marathon] [--env-file .env.local] [--dry-run] [--confirm "<phrase>"]
 *
 * Off by default. It refuses unless:
 *   - it is not running on Vercel;
 *   - a production target also has WIKI_ALLOW_PROD_CONTENT_LOAD=1 (any other target must pass db-guard);
 *   - --confirm repeats the exact phrase printed by --dry-run (page count, file hash, target, wiki);
 *   - no content_load_records row exists for this wiki yet. The row is inserted in the same
 *     transaction as the pages, so a failed load leaves no record and a finished one blocks reruns.
 * Pages whose publish gate said needs_review go to Review as pending AI suggestions.
 * Only DATABASE_URL / DATABASE_URL_UNPOOLED are read from the env file; no value or host is printed.
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { userInfo } from "node:os";

import { Pool } from "@neondatabase/serverless";

import { checkNonProductionTarget, pointsAtProduction, previewTargetUrl } from "../db-guard.mjs";
import { decideGeneratedLoad } from "../../src/content/load-once.ts";
import { loadGeneratedPages, type GeneratedPage } from "./generated-load.ts";

const root = new URL("../../", import.meta.url).pathname;
const args = process.argv.slice(2);
const flag = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? (args[index + 1] ?? "") : null;
};
const dryRun = args.includes("--dry-run");
const tenantSlug = flag("tenant") || "marathon";

const envFile = path.resolve(root, flag("env-file") ?? ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (match && ["DATABASE_URL", "DATABASE_URL_UNPOOLED"].includes(match[1]) && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const fileBytes = readFileSync(path.join(root, "content/marathon/generated/pages.json"));
const pages = JSON.parse(fileBytes.toString("utf8")) as GeneratedPage[];
const fileSha256 = createHash("sha256").update(fileBytes).digest("hex");
const manifest = JSON.parse(readFileSync(path.join(root, "content/marathon/generated/sources.manifest.json"), "utf8")) as Array<{ sourceKey: string; fetchedAt: string | null }>;
const fetchedAt = new Map(manifest.flatMap((entry) => (entry.fetchedAt ? [[entry.sourceKey, entry.fetchedAt] as [string, string]] : [])));
const reviewCount = pages.filter((page) => page.aiProvenance.publishGate?.decision === "needs_review").length;

const decision = decideGeneratedLoad({
  env: process.env,
  guard: checkNonProductionTarget(process.env),
  pointsAtProduction: pointsAtProduction(process.env),
  confirm: dryRun ? null : flag("confirm"),
  fileSha256,
  pageCount: pages.length,
  tenantSlug,
});

const say = (message: string) => console.log(`load-generated-once: ${message}`);
say(`file has ${pages.length} entries (${pages.length - reviewCount} to publish, ${reviewCount} to Review), sha256 ${fileSha256.slice(0, 12)}.`);

if (!decision.ok && !(dryRun && decision.phrase)) {
  say(`refused: ${decision.reason}.${decision.phrase ? ` To proceed, pass --confirm "${decision.phrase}".` : ""}`);
  process.exit(1);
}

const pool = new Pool({ connectionString: previewTargetUrl(process.env) as string });
const client = await pool.connect();
try {
  const tenant = await client.query("select id from tenants where slug = $1", [tenantSlug]);
  if (tenant.rows.length === 0) throw new Error(`no wiki with slug '${tenantSlug}' in this database`);
  const loadKey = `generated-pages:${tenantSlug}`;
  const prior = await client.query(`select to_char(loaded_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as loaded_at, file_sha256, loaded_by from content_load_records where load_key = $1`, [loadKey]);
  if (prior.rows.length) {
    const row = prior.rows[0];
    say(`refused: already loaded into '${tenantSlug}' at ${row.loaded_at} by ${row.loaded_by} (file ${String(row.file_sha256).slice(0, 12)}). This load runs once per wiki; later changes go through the AI editor queue.`);
    process.exitCode = 1;
  } else if (dryRun) {
    say(`dry run: allowed once. Re-run with --confirm "${decision.phrase}".`);
  } else if (decision.ok) {
    await client.query("begin");
    const inserted = await client.query(
      `insert into content_load_records (id, load_key, tenant_id, file_sha256, page_count, target, loaded_by)
       values ($1, $2, $3, $4, $5, $6, $7) on conflict (load_key) do nothing returning id`,
      [`load_${randomUUID()}`, loadKey, tenant.rows[0].id, fileSha256, pages.length, decision.target, `${userInfo().username}@load-generated-once`],
    );
    if (inserted.rows.length === 0) {
      await client.query("rollback");
      say("refused: another run recorded this load first.");
      process.exitCode = 1;
    } else {
      const result = await loadGeneratedPages(client, { tenantId: tenant.rows[0].id, pages, fetchedAt, actor: "content-load-once" });
      await client.query("update content_load_records set published_count = $2, review_count = $3 where id = $1", [inserted.rows[0].id, result.published.length, result.review.length]);
      await client.query("commit");
      say(`loaded into ${decision.target} '${tenantSlug}': ${result.published.length} published, ${result.review.length} filed for Review${result.review.length ? ` (${result.review.join(", ")})` : ""}. Recorded; a second run will refuse.`);
    }
  }
} catch (error) {
  await client.query("rollback").catch(() => {});
  say(`failed, rolled back: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}

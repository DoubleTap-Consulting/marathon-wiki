/**
 * Apply a reviewed set of paraphrased page revisions to one wiki database.
 *
 *   node scripts/content/load-approved-revisions.ts [--tenant marathon] [--file path] [--env-file .env.local] [--dry-run] [--public-base https://wikiden.gg] [--confirm "<phrase>"]
 *
 * The default file is content/<tenant>/generated/approved-paraphrase-revisions.json.
 * Off by default. It refuses unless:
 *   - it is not running on Vercel;
 *   - a production target also has WIKI_ALLOW_PROD_CONTENT_LOAD=1 (any other target must pass db-guard);
 *   - --confirm repeats the exact phrase printed by --dry-run (updated + new counts, file hash, target, wiki);
 *   - no content_load_records row exists yet for this file's load_key.
 *
 * For each slug in the file it inserts a new published revision. If no page row
 * exists, it also inserts the page (so a reviewed page like armory can be created).
 * It never prints a connection string or hostname; it prints the Neon endpoint id only.
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { userInfo } from "node:os";

import { Pool } from "@neondatabase/serverless";

import { checkNonProductionTarget, endpointIdOf, pointsAtProduction, previewTargetUrl } from "../db-guard.mjs";
import { decideApprovedRevisionLoad } from "../../src/content/load-approved-revisions.ts";
import { applyApprovedRevisions, countUpdatedAndNew, type ApprovedRevision } from "../../src/content/apply-approved-revisions.ts";
import { dryRunApprovedAgainstPublic } from "./dry-run-prod-public.ts";

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

const defaultFile = path.join(root, "content", tenantSlug, "generated", "approved-paraphrase-revisions.json");
const revisionsFile = path.resolve(flag("file") ?? defaultFile);
if (!existsSync(revisionsFile)) {
  console.error(`load-approved-revisions: missing ${revisionsFile}`);
  process.exit(1);
}
const fileBytes = readFileSync(revisionsFile);
const revisions = JSON.parse(fileBytes.toString("utf8")) as ApprovedRevision[];
const fileSha256 = createHash("sha256").update(fileBytes).digest("hex");

const endpoint = endpointIdOf(previewTargetUrl(process.env) ?? "");
const say = (message: string) => console.log(`load-approved-revisions: ${message}`);
say(`file has ${revisions.length} approved revisions, sha256 ${fileSha256.slice(0, 12)}.`);
say(`neon endpoint id: ${endpoint ?? "(none)"}${pointsAtProduction(process.env) ? " (PRODUCTION — refused unless the override flag and confirm phrase are set)" : " (not production)"}`);

function decide(updatedCount: number, newCount: number) {
  return decideApprovedRevisionLoad({
    env: process.env,
    guard: checkNonProductionTarget(process.env),
    pointsAtProduction: pointsAtProduction(process.env),
    confirm: dryRun ? null : flag("confirm"),
    fileSha256,
    updatedCount,
    newCount,
    tenantSlug,
  });
}

function refuse(decision: ReturnType<typeof decide>) {
  if (!decision.ok && !(dryRun && decision.phrase)) {
    say(`refused: ${decision.reason}.${decision.phrase ? ` To proceed, pass --confirm "${decision.phrase}".` : ""}`);
    process.exit(1);
  }
}

const publicBase = flag("public-base");
if (publicBase) {
  if (!dryRun) {
    say("refused: --public-base is read-only. Pass --dry-run as well. No database was opened.");
    process.exit(1);
  }
  const lines = await dryRunApprovedAgainstPublic({
    base: publicBase.replace(/\/$/, ""),
    tenantSlug,
    revisions,
    fileSha256,
  });
  for (const line of lines) say(line);
  process.exit(0);
}

const pool = new Pool({ connectionString: previewTargetUrl(process.env) as string });
const client = await pool.connect();
try {
  const tenant = await client.query("select id from tenants where slug = $1", [tenantSlug]);
  if (tenant.rows.length === 0) throw new Error(`no wiki with slug '${tenantSlug}' in this database`);
  const existing = await client.query(`select slug from wiki_pages where tenant_id = $1 and slug = any($2::text[])`, [
    tenant.rows[0].id,
    revisions.map((page) => page.slug),
  ]);
  const { updatedCount, newCount } = countUpdatedAndNew(
    existing.rows.map((row: { slug: string }) => row.slug),
    revisions.map((page) => page.slug),
  );
  const decision = decide(updatedCount, newCount);
  refuse(decision);
  const loadKey = decision.ok ? decision.loadKey : `approved-paraphrase-revisions:${tenantSlug}:${fileSha256.slice(0, 12)}`;
  const prior = await client.query(
    `select to_char(loaded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as loaded_at, file_sha256, loaded_by from content_load_records where load_key = $1`,
    [loadKey],
  );
  if (prior.rows.length) {
    const row = prior.rows[0];
    say(`refused: already applied this approved file to '${tenantSlug}' at ${row.loaded_at} by ${row.loaded_by} (file ${String(row.file_sha256).slice(0, 12)}).`);
    process.exitCode = 1;
  } else if (dryRun) {
    say(
      `dry run: would update ${updatedCount} existing page(s) and create ${newCount} new page(s) with a published revision. Re-run with --confirm "${decision.phrase}".`,
    );
  } else if (decision.ok) {
    await client.query("begin");
    const inserted = await client.query(
      `insert into content_load_records (id, load_key, tenant_id, file_sha256, page_count, target, loaded_by)
       values ($1, $2, $3, $4, $5, $6, $7) on conflict (load_key) do nothing returning id`,
      [`load_${randomUUID()}`, loadKey, tenant.rows[0].id, fileSha256, revisions.length, decision.target, `${userInfo().username}@load-approved-revisions`],
    );
    if (inserted.rows.length === 0) {
      await client.query("rollback");
      say("refused: another run recorded this load first.");
      process.exitCode = 1;
    } else {
      const applied = await applyApprovedRevisions(client, {
        tenantId: tenant.rows[0].id,
        revisions,
        fileSha256,
        actor: "content-load-approved-revisions",
      });
      await client.query("update content_load_records set published_count = $2, review_count = $3 where id = $1", [
        inserted.rows[0].id,
        applied.updated.length + applied.created.length,
        0,
      ]);
      await client.query("commit");
      say(
        `applied to ${decision.target} '${tenantSlug}' (endpoint ${endpoint}): ${applied.updated.length} updated, ${applied.created.length} created. Recorded; applying this same file again will refuse.`,
      );
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

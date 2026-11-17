/**
 * Publish a new revision that copies an earlier revision of an existing page.
 * Used to roll back an approved-revision load without deleting history.
 *
 *   node scripts/content/restore-revision.ts --tenant marathon --slug ranked --revision 2 --dry-run
 *   node scripts/content/restore-revision.ts --tenant marathon --slug ranked --revision 2 --env-file .env.local --confirm "<phrase>"
 *
 * Same production guards as the approved-revision loader. Never prints a connection string.
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { userInfo } from "node:os";

import { Pool } from "@neondatabase/serverless";

import { checkNonProductionTarget, endpointIdOf, pointsAtProduction, previewTargetUrl } from "../db-guard.mjs";
import { PROD_LOAD_FLAG, type LoadTarget } from "../../src/content/load-approved-revisions.ts";

const root = new URL("../../", import.meta.url).pathname;
const args = process.argv.slice(2);
const flag = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? (args[index + 1] ?? "") : null;
};
const dryRun = args.includes("--dry-run");
const tenantSlug = flag("tenant") || "marathon";
const slug = flag("slug");
const revision = Number(flag("revision"));

const envFile = path.resolve(root, flag("env-file") ?? ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (match && ["DATABASE_URL", "DATABASE_URL_UNPOOLED"].includes(match[1]) && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

function fail(message: string): never {
  console.error(`restore-revision: ${message}`);
  process.exit(1);
}

if (process.env.VERCEL || process.env.VERCEL_ENV) fail("refusing to run on Vercel; run it by hand from an operator machine.");
if (!slug) fail("pass --slug.");
if (!Number.isInteger(revision) || revision < 1) fail("pass --revision with a positive integer.");

const onProd = pointsAtProduction(process.env);
const guard = checkNonProductionTarget(process.env);
let target: LoadTarget;
if (onProd) {
  if (process.env[PROD_LOAD_FLAG] !== "1") fail(`the target is the production database; set ${PROD_LOAD_FLAG}=1 for this run.`);
  target = "production";
} else if (guard.ok) {
  target = "non-production";
} else {
  fail(`database guard: ${guard.reason}`);
}

const phrase = `restore ${slug} revision ${revision} into ${target} ${tenantSlug}`;
const endpoint = endpointIdOf(previewTargetUrl(process.env) ?? "");
const say = (message: string) => console.log(`restore-revision: ${message}`);
say(`neon endpoint id: ${endpoint ?? "(none)"}${onProd ? " (PRODUCTION)" : " (not production)"}`);

if (!dryRun && flag("confirm") !== phrase) {
  say(`refused: ${flag("confirm") ? "the confirmation does not match" : "missing --confirm"}. To proceed, pass --confirm "${phrase}".`);
  process.exit(1);
}

const pool = new Pool({ connectionString: previewTargetUrl(process.env) as string });
const client = await pool.connect();
try {
  const tenant = await client.query("select id from tenants where slug = $1", [tenantSlug]);
  if (tenant.rows.length === 0) throw new Error(`no wiki with slug '${tenantSlug}' in this database`);
  const page = await client.query("select id, latest_revision_number from wiki_pages where tenant_id = $1 and slug = $2", [tenant.rows[0].id, slug]);
  if (page.rows.length === 0) throw new Error(`no page '${slug}'`);
  const prior = await client.query(
    "select id, revision_number, title, summary, body_markdown from wiki_page_revisions where tenant_id = $1 and page_id = $2 and revision_number = $3",
    [tenant.rows[0].id, page.rows[0].id, revision],
  );
  if (prior.rows.length === 0) throw new Error(`no revision ${revision} for '${slug}'`);
  const nextNumber = Number(page.rows[0].latest_revision_number) + 1;
  say(`${slug}: would copy ${prior.rows[0].id} (r${revision}) as new r${nextNumber} (current is r${page.rows[0].latest_revision_number}).`);
  if (dryRun) {
    say(`dry run: no write. Re-run with --confirm "${phrase}".`);
  } else {
    const now = new Date().toISOString();
    const changeNote = `Restored r${revision} (${prior.rows[0].id}).`;
    const newId = `restore_rev_${randomUUID()}`;
    await client.query("begin");
    await client.query(
      `insert into wiki_page_revisions (id, tenant_id, page_id, revision_number, title, summary, body_markdown, change_note, created_by, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [newId, tenant.rows[0].id, page.rows[0].id, nextNumber, prior.rows[0].title, prior.rows[0].summary, prior.rows[0].body_markdown, changeNote, `${userInfo().username}@restore-revision`, now],
    );
    await client.query(
      `update wiki_pages set title = $3, summary = $4, body_markdown = $5, latest_revision_number = $6, status = 'published', updated_by = $8, updated_at = $7
       where tenant_id = $1 and id = $2`,
      [tenant.rows[0].id, page.rows[0].id, prior.rows[0].title, prior.rows[0].summary, prior.rows[0].body_markdown, nextNumber, now, `${userInfo().username}@restore-revision`],
    );
    await client.query("commit");
    say(`published ${newId} as r${nextNumber} on ${target} '${tenantSlug}' (endpoint ${endpoint}).`);
  }
} catch (error) {
  await client.query("rollback").catch(() => {});
  say(`failed, rolled back: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}

/**
 * Apply a reviewed set of paraphrased page revisions to one wiki database.
 *
 *   node scripts/content/load-approved-revisions.ts [--tenant marathon] [--file path] [--env-file .env.local] [--dry-run] [--public-base https://wikiden.gg] [--confirm "<phrase>"]
 *
 * The default file is content/<tenant>/generated/approved-paraphrase-revisions.json.
 * Off by default. It refuses unless:
 *   - it is not running on Vercel;
 *   - a production target also has WIKI_ALLOW_PROD_CONTENT_LOAD=1 (any other target must pass db-guard);
 *   - --confirm repeats the exact phrase printed by --dry-run (revision count, file hash, target, wiki);
 *   - no content_load_records row exists yet for this file's load_key.
 *
 * This loader only updates existing pages (it inserts a new published revision and
 * points the page row at it). It never prints a connection string or hostname;
 * it prints the Neon endpoint id only.
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { userInfo } from "node:os";

import { Pool } from "@neondatabase/serverless";

import { checkNonProductionTarget, endpointIdOf, pointsAtProduction, previewTargetUrl } from "../db-guard.mjs";
import { decideApprovedRevisionLoad } from "../../src/content/load-approved-revisions.ts";
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

type ApprovedRevision = {
  slug: string;
  title: string;
  summary: string;
  category?: string;
  bodyMarkdown: string;
  changeNote?: string;
  aiProvenance?: Record<string, unknown>;
};

const defaultFile = path.join(root, "content", tenantSlug, "generated", "approved-paraphrase-revisions.json");
const revisionsFile = path.resolve(flag("file") ?? defaultFile);
if (!existsSync(revisionsFile)) {
  console.error(`load-approved-revisions: missing ${revisionsFile}`);
  process.exit(1);
}
const fileBytes = readFileSync(revisionsFile);
const revisions = JSON.parse(fileBytes.toString("utf8")) as ApprovedRevision[];
const fileSha256 = createHash("sha256").update(fileBytes).digest("hex");

const decision = decideApprovedRevisionLoad({
  env: process.env,
  guard: checkNonProductionTarget(process.env),
  pointsAtProduction: pointsAtProduction(process.env),
  confirm: dryRun ? null : flag("confirm"),
  fileSha256,
  revisionCount: revisions.length,
  tenantSlug,
});

const endpoint = endpointIdOf(previewTargetUrl(process.env) ?? "");
const say = (message: string) => console.log(`load-approved-revisions: ${message}`);
say(`file has ${revisions.length} approved revisions, sha256 ${fileSha256.slice(0, 12)}.`);
say(`neon endpoint id: ${endpoint ?? "(none)"}${pointsAtProduction(process.env) ? " (PRODUCTION — refused unless the override flag and confirm phrase are set)" : " (not production)"}`);

if (!decision.ok && !(dryRun && decision.phrase)) {
  say(`refused: ${decision.reason}.${decision.phrase ? ` To proceed, pass --confirm "${decision.phrase}".` : ""}`);
  process.exit(1);
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
    const existing = await client.query(
      `select slug from wiki_pages where tenant_id = $1 and slug = any($2::text[])`,
      [tenant.rows[0].id, revisions.map((page) => page.slug)],
    );
    const found = new Set(existing.rows.map((row: { slug: string }) => row.slug));
    const missing = revisions.map((page) => page.slug).filter((slug) => !found.has(slug));
    say(`dry run: would insert a new published revision for ${found.size} existing page(s)${missing.length ? `; missing (skipped): ${missing.join(", ")}` : ""}. Re-run with --confirm "${decision.phrase}".`);
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
      let published = 0;
      const missing: string[] = [];
      const actor = "content-load-approved-revisions";
      const now = new Date().toISOString();
      for (const page of revisions) {
        const existing = await client.query("select id from wiki_pages where tenant_id = $1 and slug = $2", [tenant.rows[0].id, page.slug]);
        if (existing.rows.length === 0) {
          missing.push(page.slug);
          continue;
        }
        const pageId = existing.rows[0].id;
        const max = await client.query("select coalesce(max(revision_number), 0)::int as max from wiki_page_revisions where tenant_id = $1 and page_id = $2", [
          tenant.rows[0].id,
          pageId,
        ]);
        const revisionNumber: number = max.rows[0].max + 1;
        const revisionId = `para_rev_${tenant.rows[0].id}_${page.slug}_${fileSha256.slice(0, 8)}`;
        const changeNote = page.changeNote ?? "Updated from cited official sources.";
        const provenance = {
          ...(page.aiProvenance ?? {}),
          origin: "approved-paraphrase-revisions",
          changeNote,
          generatedAt: (page.aiProvenance as { generatedAt?: string } | undefined)?.generatedAt ?? now,
        };
        await client.query(
          `insert into wiki_page_revisions (id, tenant_id, page_id, revision_number, title, summary, body_markdown, change_note, ai_provenance, created_by, created_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [revisionId, tenant.rows[0].id, pageId, revisionNumber, page.title, page.summary, page.bodyMarkdown, changeNote, JSON.stringify(provenance), actor, now],
        );
        await client.query(
          `update wiki_pages set title = $3, summary = $4, body_markdown = $5, latest_revision_number = $6, status = 'published', updated_by = $8, updated_at = $7
           where tenant_id = $1 and id = $2`,
          [tenant.rows[0].id, pageId, page.title, page.summary, page.bodyMarkdown, revisionNumber, now, actor],
        );
        if (page.category) {
          await client.query(
            `insert into wiki_page_categories (tenant_id, page_id, category_id)
             select $1, $2, id from wiki_categories where tenant_id = $1 and slug = $3
             on conflict do nothing`,
            [tenant.rows[0].id, pageId, page.category],
          );
        }
        published += 1;
      }
      await client.query("update content_load_records set published_count = $2, review_count = $3 where id = $1", [inserted.rows[0].id, published, missing.length]);
      await client.query("commit");
      say(`applied to ${decision.target} '${tenantSlug}' (endpoint ${endpoint}): ${published} published revisions${missing.length ? `; missing pages skipped: ${missing.join(", ")}` : ""}. Recorded; applying this same file again will refuse.`);
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

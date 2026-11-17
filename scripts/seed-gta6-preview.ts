/**
 * PREVIEW / DEVELOPMENT DATABASES ONLY.
 *
 * Applies prisma/seeds/gta6.sql and loads content/gta6/generated/pages.json into the
 * gta6 tenant. Re-runs delete and recreate only this tenant's `gen_` rows. Does not
 * touch other wikis, production, or content_load_records (the one-time prod loader).
 *
 *   ALLOW_SAMPLE_SEED=1 node scripts/seed-gta6-preview.ts [--env-file .env.local]
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { Pool } from "@neondatabase/serverless";

import { checkNonProductionTarget, previewTargetUrl } from "./db-guard.mjs";
import { loadGeneratedPages, type GeneratedPage } from "./content/generated-load.ts";

const root = new URL("../", import.meta.url).pathname;
const args = process.argv.slice(2);
const envFlag = args.indexOf("--env-file");
const envFile = path.resolve(root, envFlag >= 0 ? (args[envFlag + 1] ?? ".env.local") : ".env.local");

if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (match && ["DATABASE_URL", "DATABASE_URL_UNPOOLED"].includes(match[1]) && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

function fail(message: string): never {
  console.error(`seed-gta6-preview: refusing to run. ${message}`);
  process.exit(1);
}

if (process.env.ALLOW_SAMPLE_SEED !== "1") fail("Set ALLOW_SAMPLE_SEED=1.");
if (process.env.VERCEL_ENV === "production") fail("VERCEL_ENV is production.");

const guard = checkNonProductionTarget();
if (!guard.ok) fail(`Database guard: ${guard.reason}.`);

const generatedFile = path.join(root, "content/gta6/generated/pages.json");
const manifestFile = path.join(root, "content/gta6/generated/sources.manifest.json");
if (!existsSync(generatedFile) || !existsSync(manifestFile)) fail("Missing content/gta6/generated/pages.json or sources.manifest.json.");

const pages = JSON.parse(readFileSync(generatedFile, "utf8")) as GeneratedPage[];
const fetchedAt = new Map(
  (JSON.parse(readFileSync(manifestFile, "utf8")) as Array<{ sourceKey: string; fetchedAt: string | null }>).flatMap((entry) =>
    entry.fetchedAt ? [[entry.sourceKey, entry.fetchedAt] as [string, string]] : [],
  ),
);

const pool = new Pool({ connectionString: previewTargetUrl() as string });
const client = await pool.connect();
try {
  await client.query("begin");
  await client.query(readFileSync(path.join(root, "prisma/seeds/gta6.sql"), "utf8"));
  const tenant = await client.query("select id from tenants where slug = $1", ["gta6"]);
  if (tenant.rows.length === 0) throw new Error("gta6 tenant was not created");
  const tenantId: string = tenant.rows[0].id;
  await client.query("delete from wiki_sources where tenant_id = $1 and id like 'gen\\_%'", [tenantId]);
  await client.query("delete from wiki_page_revisions where tenant_id = $1 and id like 'gen\\_%'", [tenantId]);
  await client.query("delete from wiki_suggestions where tenant_id = $1 and id like 'gen\\_%'", [tenantId]);
  await client.query("delete from wiki_page_categories where tenant_id = $1 and page_id like 'gen\\_page\\_%'", [tenantId]);
  await client.query("delete from wiki_page_tags where tenant_id = $1 and page_id like 'gen\\_page\\_%'", [tenantId]);
  await client.query("delete from wiki_pages where tenant_id = $1 and id like 'gen\\_page\\_%'", [tenantId]);
  const loaded = await loadGeneratedPages(client, { tenantId, pages, fetchedAt, actor: "content-pipeline" });
  await client.query("commit");
  console.log(
    `seed-gta6-preview: loaded ${pages.length} generated gta6 pages (${new Set(loaded.published).size} published, ${loaded.review.length} to Review${loaded.review.length ? `: ${loaded.review.join(", ")}` : ""}).`,
  );
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error(`seed-gta6-preview: failed, rolled back: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}

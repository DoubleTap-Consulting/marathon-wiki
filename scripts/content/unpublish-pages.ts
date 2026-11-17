/**
 * Unpublish (or republish) existing wiki pages without deleting rows or revisions.
 *
 *   node scripts/content/unpublish-pages.ts --tenant marathon --slugs armory --dry-run
 *   node scripts/content/unpublish-pages.ts --tenant marathon --slugs armory --confirm "unpublish marathon armory from production"
 *   node scripts/content/unpublish-pages.ts --tenant marathon --slugs armory --republish --confirm "republish marathon armory into production"
 *
 * --slugs is a comma- or space-separated list. The confirm phrase names the tenant,
 * the sorted slugs, and the target. Same production guards as the content loaders.
 * It never prints a connection string or hostname; it prints the Neon endpoint id only.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { userInfo } from "node:os";

import { Pool } from "@neondatabase/serverless";

import { checkNonProductionTarget, endpointIdOf, pointsAtProduction, previewTargetUrl } from "../db-guard.mjs";
import {
  applyUnpublishPages,
  decideUnpublishPages,
  normalizeUnpublishSlugs,
} from "../../src/content/unpublish-pages.ts";

const root = new URL("../../", import.meta.url).pathname;
const args = process.argv.slice(2);
const flag = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? (args[index + 1] ?? "") : null;
};
const dryRun = args.includes("--dry-run");
const action = args.includes("--republish") ? "republish" : "unpublish";
const tenantSlug = flag("tenant") || "";
const slugs = normalizeUnpublishSlugs(flag("slugs") ?? "");

const envFile = path.resolve(root, flag("env-file") ?? ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (match && ["DATABASE_URL", "DATABASE_URL_UNPOOLED"].includes(match[1]) && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

const decision = decideUnpublishPages({
  env: process.env,
  guard: checkNonProductionTarget(process.env),
  pointsAtProduction: pointsAtProduction(process.env),
  confirm: dryRun ? null : flag("confirm"),
  tenantSlug,
  slugs,
  action,
});

const endpoint = endpointIdOf(previewTargetUrl(process.env) ?? "");
const say = (message: string) => console.log(`unpublish-pages: ${message}`);
say(`action ${action}; tenant ${tenantSlug || "(missing)"}; slugs ${slugs.length ? slugs.join(",") : "(none)"}.`);
say(`neon endpoint id: ${endpoint ?? "(none)"}${pointsAtProduction(process.env) ? " (PRODUCTION — refused unless the override flag and confirm phrase are set)" : " (not production)"}`);

if (!decision.ok && !(dryRun && decision.phrase)) {
  say(`refused: ${decision.reason}.${decision.phrase ? ` To proceed, pass --confirm "${decision.phrase}".` : ""}`);
  process.exit(1);
}

const pool = new Pool({ connectionString: previewTargetUrl(process.env) as string });
const client = await pool.connect();
try {
  const tenant = await client.query("select id from tenants where slug = $1", [tenantSlug]);
  if (tenant.rows.length === 0) throw new Error(`no wiki with slug '${tenantSlug}' in this database`);
  if (dryRun) {
    const existing = await client.query(
      `select slug, status from wiki_pages where tenant_id = $1 and slug = any($2::text[])`,
      [tenant.rows[0].id, slugs],
    );
    const bySlug = new Map(existing.rows.map((row: { slug: string; status: string }) => [row.slug, row.status]));
    const missing = slugs.filter((slug) => !bySlug.has(slug));
    if (missing.length) throw new Error(`no page row for: ${missing.join(", ")}`);
    const wanted = action === "republish" ? "published" : "archived";
    const already = slugs.filter((slug) => bySlug.get(slug) === wanted);
    const would = slugs.filter((slug) => bySlug.get(slug) !== wanted);
    say(
      `dry run: would ${action} ${would.length} page(s)${already.length ? `; already ${wanted}: ${already.join(", ")}` : ""}${would.length ? `: ${would.join(", ")}` : ""}. Re-run with --confirm "${decision.phrase}".`,
    );
  } else if (decision.ok) {
    await client.query("begin");
    const result = await applyUnpublishPages(client, {
      tenantId: tenant.rows[0].id,
      slugs: decision.slugs,
      action: decision.action,
      actor: `${userInfo().username}@unpublish-pages`,
    });
    await client.query("commit");
    say(
      `${action} on ${decision.target} '${tenantSlug}' (endpoint ${endpoint}): ${result.changed.length} changed${result.already.length ? `, ${result.already.length} already in the requested state` : ""}${result.changed.length ? ` (${result.changed.join(", ")})` : ""}. Rows and revisions were kept.`,
    );
  }
} catch (error) {
  await client.query("rollback").catch(() => {});
  say(`failed, rolled back: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}

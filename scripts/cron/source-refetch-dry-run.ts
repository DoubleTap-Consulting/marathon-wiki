/**
 * Read-only plan of the daily source-refetch cron. Does not connect to a
 * database and does not fetch or write source text.
 *
 *   node scripts/cron/source-refetch-dry-run.ts
 */
import { cronContentPlan } from "@/src/content/cron-tenants";
import { formatSourceRefetchCronLog, type SourceRefetchCronSummary } from "@/src/content/source-refetch-cron";

const tenants = [
  { id: "dry-marathon", slug: "marathon" },
  { id: "dry-gta6", slug: "gta6" },
];

const preview = cronContentPlan(tenants, { VERCEL_ENV: "preview" });
const production = cronContentPlan(tenants, { VERCEL_ENV: "production" });
const productionEnabled = cronContentPlan(tenants, { VERCEL_ENV: "production", GTA6_ENABLED: "1" });

const previewSummary: SourceRefetchCronSummary = {
  cron: "source-refetch",
  status: "ok",
  tenants: preview.map((tenant) => ({
    slug: tenant.slug,
    sources: tenant.sourceCount,
    changed: 0,
    unchanged: tenant.sourceCount,
    baseline: 0,
    new: 0,
    manual: 0,
    failed: 0,
    queued: 0,
    feedNewPosts: tenant.bungieNewsFeed ? 0 : null,
    feedOk: tenant.bungieNewsFeed ? true : null,
  })),
  changedSources: 0,
  queuedItems: 0,
  spend: 0,
};

console.log("preview/local plan (GTA 6 enabled, same as a Vercel preview):");
console.log(JSON.stringify(preview, null, 2));
console.log("production plan without GTA6_ENABLED:");
console.log(JSON.stringify(production, null, 2));
console.log("production plan with GTA6_ENABLED=1:");
console.log(JSON.stringify(productionEnabled, null, 2));
console.log("example summary line (counts only, no keys or page content):");
console.log(formatSourceRefetchCronLog(previewSummary));

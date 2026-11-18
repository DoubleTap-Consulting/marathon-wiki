import type { Kysely } from "kysely";

import { CONTENT_TENANT_SLUG } from "@/src/content/editor-store";
import { cronContentPacksFor, type CronTenant } from "@/src/content/cron-tenants";
import { classifyCronError, type CronErrorClass } from "@/src/content/cron-error";
import { checkBungieNewsFeed, refetchSources } from "@/src/content/source-refetch";
import type { DB } from "@/src/db/types";

export type SourceRefetchCronSummary = {
  cron: "source-refetch";
  status: "ok" | "error";
  tenants: Array<{
    slug: string;
    sources: number;
    changed: number;
    unchanged: number;
    baseline: number;
    new: number;
    manual: number;
    failed: number;
    queued: number;
    feedNewPosts: number | null;
    feedOk: boolean | null;
  }>;
  changedSources: number;
  queuedItems: number;
  spend: number;
  error?: CronErrorClass;
};

const OUTCOMES = ["changed", "unchanged", "baseline", "new", "manual", "failed"] as const;

function countOutcome(
  results: Array<{ outcome: string }>,
  outcome: (typeof OUTCOMES)[number],
) {
  return results.filter((result) => result.outcome === outcome).length;
}

function buildSummary(
  tenants: SourceRefetchCronSummary["tenants"],
  error?: CronErrorClass,
): SourceRefetchCronSummary {
  const failed = tenants.some((tenant) => tenant.failed > 0 || tenant.feedOk === false);
  return {
    cron: "source-refetch",
    status: error || failed ? "error" : "ok",
    tenants,
    changedSources: tenants.reduce((sum, tenant) => sum + tenant.changed, 0),
    queuedItems: tenants.reduce((sum, tenant) => sum + tenant.queued, 0),
    spend: 0,
    ...(error ? { error } : {}),
  };
}

/** Safe for stdout: counts only — no source keys, URLs, source text, page slugs, or raw exception messages. The error field is a class, never the message. */
export function formatSourceRefetchCronLog(summary: SourceRefetchCronSummary) {
  return JSON.stringify(summary);
}

export async function listActiveCronTenants(db: Kysely<DB>): Promise<CronTenant[]> {
  return db.selectFrom("tenants").select(["id", "slug"]).where("status", "=", "active").execute();
}

export async function runSourceRefetchCron(input: {
  db: Kysely<DB>;
  env?: Record<string, string | undefined>;
  now?: Date;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
  refetch?: typeof refetchSources;
  checkFeed?: typeof checkBungieNewsFeed;
  tenants?: CronTenant[];
}): Promise<{ ok: boolean; summary: SourceRefetchCronSummary }> {
  const env = input.env ?? process.env;
  const log = input.log ?? ((line: string) => console.log(line));
  const refetch = input.refetch ?? refetchSources;
  const checkFeed = input.checkFeed ?? checkBungieNewsFeed;
  const tenants = cronContentPacksFor(input.tenants ?? (await listActiveCronTenants(input.db)), env);

  if (tenants.length === 0) {
    const summary = buildSummary([], "no_enabled_tenants");
    log(formatSourceRefetchCronLog(summary));
    return { ok: false, summary };
  }

  const rows: SourceRefetchCronSummary["tenants"] = [];
  try {
    for (const tenant of tenants) {
      const refetchResult = await refetch(
        {
          tenantId: tenant.id,
          sources: tenant.sources,
          specs: tenant.specs,
          fetchImpl: input.fetchImpl,
          now: input.now,
        },
        input.db,
      );
      const feed =
        tenant.slug === CONTENT_TENANT_SLUG
          ? await checkFeed({ tenantId: tenant.id, sources: tenant.sources, fetchImpl: input.fetchImpl, now: input.now }, input.db)
          : null;
      rows.push({
        slug: tenant.slug,
        sources: tenant.sources.length,
        changed: countOutcome(refetchResult.results, "changed"),
        unchanged: countOutcome(refetchResult.results, "unchanged"),
        baseline: countOutcome(refetchResult.results, "baseline"),
        new: countOutcome(refetchResult.results, "new"),
        manual: countOutcome(refetchResult.results, "manual"),
        failed: countOutcome(refetchResult.results, "failed"),
        queued: refetchResult.queued.length,
        feedNewPosts: feed ? (feed.ok ? feed.newPosts.length : 0) : null,
        feedOk: feed ? feed.ok : null,
      });
    }
    const summary = buildSummary(rows);
    log(formatSourceRefetchCronLog(summary));
    return { ok: summary.status === "ok", summary };
  } catch (error) {
    const summary = buildSummary(rows, classifyCronError(error));
    log(formatSourceRefetchCronLog(summary));
    return { ok: false, summary };
  }
}

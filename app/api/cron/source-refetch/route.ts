import { NextResponse } from "next/server";

import { isAiRefreshCronRequestAuthorized, unauthorizedCronResponse } from "@/src/ai/wiki-refresh-cron";
import { CONTENT_TENANT_SLUG } from "@/src/content/editor-store";
import { checkBungieNewsFeed, refetchSources } from "@/src/content/source-refetch";
import { getDb } from "@/src/db/client";

/**
 * Daily source re-fetch (08:00 UTC, an hour before the editor cron drains the queue). Production
 * only, and off until WIKI_SOURCE_REFETCH_CRON=1. Makes no AI calls: it stores changed snapshots
 * and queues the pages that cite them.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAiRefreshCronRequestAuthorized(request, process.env, "sourceRefetch")) {
    return unauthorizedCronResponse();
  }
  const db = getDb();
  const tenant = await db.selectFrom("tenants").select(["id"]).where("slug", "=", CONTENT_TENANT_SLUG).executeTakeFirst();
  if (!tenant) {
    return NextResponse.json({ ok: false, error: `No tenant "${CONTENT_TENANT_SLUG}".` }, { status: 404 });
  }
  const refetch = await refetchSources({ tenantId: tenant.id }, db);
  const feed = await checkBungieNewsFeed({ tenantId: tenant.id }, db);
  const count = (outcome: string) => refetch.results.filter((result) => result.outcome === outcome).length;
  return NextResponse.json({
    ok: count("failed") === 0 && feed.ok,
    sources: { changed: count("changed"), unchanged: count("unchanged"), baseline: count("baseline"), new: count("new"), manual: count("manual"), failed: count("failed") },
    results: refetch.results,
    queued: refetch.queued.map((item) => ({ id: item.id, targetSlug: item.targetSlug, dedupeKey: item.dedupeKey })),
    newOfficialPosts: feed.ok ? feed.newPosts : null,
    feedError: feed.ok ? null : feed.error,
  });
}

import { NextResponse } from "next/server";

import { isAiRefreshCronRequestAuthorized, unauthorizedCronResponse } from "@/src/ai/wiki-refresh-cron";
import { runSourceRefetchCron } from "@/src/content/source-refetch-cron";
import { getDb } from "@/src/db/client";

/**
 * Daily source re-fetch (08:00 UTC, an hour before the editor cron drains the queue). Production
 * only, and off until WIKI_SOURCE_REFETCH_CRON=1. Makes no AI calls: it stores changed snapshots
 * and queues the pages that cite them. Loops enabled tenants (Marathon first, then GTA 6).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAiRefreshCronRequestAuthorized(request, process.env, "sourceRefetch")) {
    return unauthorizedCronResponse();
  }
  const { ok, summary } = await runSourceRefetchCron({ db: getDb() });
  return NextResponse.json({ ok, summary }, { status: ok ? 200 : 500 });
}

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import {
  isAiRefreshCronRequestAuthorized,
  readCronJson,
  unauthorizedCronResponse,
} from "@/src/ai/wiki-refresh-cron";
import { processDueAiRefreshQueueItems } from "@/src/ai/wiki-refresh-queue";
import { revalidateWikiPage } from "@/src/wiki/cache";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleProcessRefreshCron(request);
}

export async function POST(request: Request) {
  return handleProcessRefreshCron(request, await readCronJson(request));
}

async function handleProcessRefreshCron(request: Request, body?: unknown) {
  if (!isAiRefreshCronRequestAuthorized(request)) {
    return unauthorizedCronResponse();
  }

  const url = new URL(request.url);
  const payload = normalizePayload(body);
  const result = await processDueAiRefreshQueueItems({
    limit: readPositiveNumber(payload.limit) ?? readPositiveNumber(url.searchParams.get("limit")),
  });

  await Promise.all(
    result.processed.map(async (entry) => {
      await revalidateWikiPage(entry.tenantSlug, entry.pageSlug);
      revalidatePath(`/${entry.tenantSlug}`);
      revalidatePath(`/${entry.tenantSlug}/pages`);
      revalidatePath(`/${entry.tenantSlug}/${entry.pageSlug}`);
    }),
  );

  return NextResponse.json({
    ok: true,
    processedCount: result.processed.length,
    failedCount: result.failed.length,
    processed: result.processed.map((entry) => ({
      id: entry.item.id,
      pageSlug: entry.pageSlug,
      attempts: entry.item.attempts,
      status: entry.item.status,
    })),
    failed: result.failed.map((entry) => ({
      id: entry.item.id,
      targetSlug: entry.item.targetSlug,
      attempts: entry.item.attempts,
      status: entry.item.status,
      error: entry.error,
    })),
  });
}

function normalizePayload(value: unknown) {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function readPositiveNumber(value: unknown) {
  const number =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;

  return Number.isFinite(number) && number > 0 ? number : undefined;
}

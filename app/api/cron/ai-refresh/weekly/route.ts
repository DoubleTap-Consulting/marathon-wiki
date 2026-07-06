import { NextResponse } from "next/server";

import {
  isAiRefreshCronRequestAuthorized,
  readCronJson,
  unauthorizedCronResponse,
} from "@/src/ai/wiki-refresh-cron";
import { enqueueWeeklyAiRefreshes } from "@/src/ai/wiki-refresh-queue";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleWeeklyRefreshCron(request);
}

export async function POST(request: Request) {
  return handleWeeklyRefreshCron(request, await readCronJson(request));
}

async function handleWeeklyRefreshCron(request: Request, body?: unknown) {
  if (!isAiRefreshCronRequestAuthorized(request)) {
    return unauthorizedCronResponse();
  }

  const url = new URL(request.url);
  const payload = normalizePayload(body);
  const result = await enqueueWeeklyAiRefreshes({
    tenantId: readString(payload.tenantId) ?? readString(url.searchParams.get("tenantId")),
    limit: readPositiveNumber(payload.limit) ?? readPositiveNumber(url.searchParams.get("limit")),
    staleAfterDays:
      readPositiveNumber(payload.staleAfterDays) ??
      readPositiveNumber(url.searchParams.get("staleAfterDays")),
  });

  return NextResponse.json({
    ok: true,
    eligibleCount: result.eligibleCount,
    enqueuedCount: result.enqueued.length,
    items: result.enqueued.map((item) => ({
      id: item.id,
      targetSlug: item.targetSlug,
      scheduledFor: item.scheduledFor,
      status: item.status,
      dedupeKey: item.dedupeKey,
    })),
  });
}

function normalizePayload(value: unknown) {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readPositiveNumber(value: unknown) {
  const number =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;

  return Number.isFinite(number) && number > 0 ? number : undefined;
}

import { NextResponse } from "next/server";

import {
  isAiRefreshCronRequestAuthorized,
  readCronJson,
  unauthorizedCronResponse,
} from "@/src/ai/wiki-refresh-cron";
import {
  enqueueUpcomingEventRefreshes,
  parseEventRefreshTargets,
  type UpcomingGameEvent,
} from "@/src/ai/wiki-refresh-queue";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleEventRefreshCron(request);
}

export async function POST(request: Request) {
  return handleEventRefreshCron(request, await readCronJson(request));
}

async function handleEventRefreshCron(request: Request, body?: unknown) {
  if (!isAiRefreshCronRequestAuthorized(request)) {
    return unauthorizedCronResponse();
  }

  const url = new URL(request.url);
  const payload = normalizePayload(body);
  const eventPayload = Array.isArray(payload.events)
    ? (payload.events as UpcomingGameEvent[])
    : null;
  const result = await enqueueUpcomingEventRefreshes(
    {
      tenantId:
        readString(payload.tenantId) ?? readString(url.searchParams.get("tenantId")),
      windowDays:
        readPositiveNumber(payload.windowDays) ??
        readPositiveNumber(url.searchParams.get("windowDays")),
      defaultTargets: parseEventRefreshTargets(
        readString(payload.defaultTargets) ??
          readString(url.searchParams.get("defaultTargets")) ??
          process.env.WIKI_EVENT_REFRESH_TARGETS,
      ),
    },
    eventPayload
      ? {
          discoverUpcomingEvents: async () => eventPayload,
        }
      : undefined,
  );

  return NextResponse.json({
    ok: true,
    discoveredCount: result.discoveredCount,
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

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import {
  enqueueUpcomingEventRefreshes,
  enqueueWeeklyAiRefreshes,
  parseEventRefreshTargets,
  processDueAiRefreshQueueItems,
  type UpcomingGameEvent,
} from "@/src/ai/wiki-refresh-queue";
import {
  isAiRefreshCronRequestAuthorized,
  readCronJson,
  unauthorizedCronResponse,
} from "@/src/ai/wiki-refresh-cron";
import { runWikiSourceDiscovery } from "@/src/sources/wiki-source-discovery";
import {
  runCuratedWikiSourceIngestion,
  type CuratedSourceIngestionResult,
} from "@/src/sources/wiki-source-ingestion";
import { revalidateWikiPage } from "@/src/wiki/cache";

const WEEKLY_SCHEDULE = "0 8 * * 1";
const EVENT_SCHEDULE = "0 9 * * *";
const DEFAULT_WEEKLY_LIMIT = 3;
const DEFAULT_PROCESS_LIMIT = 1;
const DEFAULT_EVENT_WINDOW_DAYS = 7;
const DEFAULT_SOURCE_DISCOVERY_LIMIT = 3;

type ScheduledUpdateMode = "weekly" | "events" | "maintenance";

type ScheduledSourceDiscoveryInput = {
  tenantId?: string;
  tenantSlug?: string;
  topicSlug: string;
  query?: string | null;
  limit?: number | null;
  candidates?: Array<Record<string, unknown>>;
};

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleWikiUpdateCron(request);
}

export async function POST(request: Request) {
  return handleWikiUpdateCron(request, await readCronJson(request));
}

async function handleWikiUpdateCron(request: Request, body?: unknown) {
  if (!isAiRefreshCronRequestAuthorized(request)) {
    return unauthorizedCronResponse();
  }

  const url = new URL(request.url);
  const payload = normalizePayload(body);
  const schedule = request.headers.get("x-vercel-cron-schedule");
  const mode =
    readMode(payload.mode) ??
    readMode(url.searchParams.get("mode")) ??
    inferModeFromSchedule(schedule) ??
    "weekly";
  const now = readDate(payload.now) ?? readDate(url.searchParams.get("now"));
  const tenantId =
    readString(payload.tenantId) ?? readString(url.searchParams.get("tenantId"));
  const tenantSlug =
    readString(payload.tenantSlug) ??
    readString(url.searchParams.get("tenantSlug"));
  const topicSlug =
    readString(payload.topicSlug) ??
    readString(url.searchParams.get("topicSlug"));
  const sourceIngestionEnabled =
    readBoolean(payload.sourceIngestion) ??
    readBoolean(url.searchParams.get("sourceIngestion")) ??
    mode !== "events";
  const sourceIngestion = sourceIngestionEnabled
    ? await runCuratedWikiSourceIngestion({
        tenantId,
        tenantSlug,
        topicSlug,
        sourceIds:
          readStringList(payload.sourceIds) ??
          readCommaList(url.searchParams.get("sourceIds")),
      })
    : null;
  const sourceDiscoveries = await runScheduledSourceDiscoveries(
    readSourceDiscoveryInputs(payload, url, {
      tenantId,
      tenantSlug,
      topicSlug,
    }),
  );
  const weeklyLimit =
    readNonNegativeInteger(payload.weeklyLimit) ??
    readNonNegativeInteger(url.searchParams.get("weeklyLimit")) ??
    readNonNegativeInteger(process.env.WIKI_WEEKLY_REFRESH_LIMIT) ??
    DEFAULT_WEEKLY_LIMIT;
  const staleAfterDays =
    readNonNegativeNumber(payload.staleAfterDays) ??
    readNonNegativeNumber(url.searchParams.get("staleAfterDays")) ??
    readNonNegativeNumber(process.env.WIKI_REFRESH_STALE_AFTER_DAYS);
  const weekly =
    mode === "weekly" || mode === "maintenance"
      ? await enqueueWeeklyAiRefreshes({
          tenantId,
          now,
          staleAfterDays,
          limit: weeklyLimit,
        })
      : null;
  const eventWindowDays =
    readPositiveNumber(payload.windowDays) ??
    readPositiveNumber(url.searchParams.get("windowDays")) ??
    DEFAULT_EVENT_WINDOW_DAYS;
  const events =
    mode === "events" || mode === "maintenance"
      ? await enqueueUpcomingEventRefreshes(
          {
            tenantId,
            now,
            windowDays: eventWindowDays,
            defaultTargets: parseEventRefreshTargets(
              readString(payload.defaultTargets) ??
                readString(url.searchParams.get("defaultTargets")) ??
                process.env.WIKI_EVENT_REFRESH_TARGETS,
            ),
          },
          readEventPayload(payload)
            ? {
                discoverUpcomingEvents: async () => readEventPayload(payload) ?? [],
              }
            : undefined,
        )
      : null;
  const processLimit =
    readNonNegativeInteger(payload.processLimit) ??
    readNonNegativeInteger(url.searchParams.get("processLimit")) ??
    readNonNegativeInteger(process.env.WIKI_PROCESS_REFRESH_LIMIT) ??
    DEFAULT_PROCESS_LIMIT;
  const processing = await processDueAiRefreshQueueItems({
    now,
    limit: processLimit,
  });
  const revalidated = await revalidateProcessedPages(processing.processed);

  return NextResponse.json({
    ok:
      sourceDiscoveries.every((entry) => entry.failedCount === 0) &&
      (sourceIngestion?.failed.length ?? 0) === 0 &&
      processing.failed.length === 0,
    mode,
    schedule,
    now: now?.toISOString() ?? null,
    limits: {
      weeklyLimit,
      processLimit,
      sourceDiscoveryLimit: DEFAULT_SOURCE_DISCOVERY_LIMIT,
      eventWindowDays,
    },
    costGuardrails: {
      weeklyDefaultLimit: DEFAULT_WEEKLY_LIMIT,
      processDefaultLimit: DEFAULT_PROCESS_LIMIT,
      eventWindowDays: DEFAULT_EVENT_WINDOW_DAYS,
      sourceDiscoveryDefaultLimit: DEFAULT_SOURCE_DISCOVERY_LIMIT,
      dedupeKeys: "weekly and event queue items use stable dedupe keys",
      freshPages: "weekly queueing skips pages newer than staleAfterDays",
    },
    sourceIngestion: sourceIngestion
      ? summarizeSourceIngestion(sourceIngestion)
      : null,
    sourceDiscovery: sourceDiscoveries,
    weekly: weekly
      ? {
          eligibleCount: weekly.eligibleCount,
          enqueuedCount: weekly.enqueued.length,
          items: weekly.enqueued.map(summaryQueueItem),
        }
      : null,
    events: events
      ? {
          discoveredCount: events.discoveredCount,
          enqueuedCount: events.enqueued.length,
          items: events.enqueued.map(summaryQueueItem),
        }
      : null,
    process: {
      processedCount: processing.processed.length,
      failedCount: processing.failed.length,
      processed: processing.processed.map((entry) => ({
        id: entry.item.id,
        pageSlug: entry.pageSlug,
        attempts: entry.item.attempts,
        status: entry.item.status,
      })),
      failed: processing.failed.map((entry) => ({
        id: entry.item.id,
        targetSlug: entry.item.targetSlug,
        attempts: entry.item.attempts,
        status: entry.item.status,
        error: entry.error,
      })),
    },
    revalidated,
  });
}

async function runScheduledSourceDiscoveries(
  inputs: ScheduledSourceDiscoveryInput[],
) {
  const results = [];

  for (const input of inputs) {
    const result = await runWikiSourceDiscovery({
      ...input,
      limit: input.limit ?? DEFAULT_SOURCE_DISCOVERY_LIMIT,
    });

    results.push({
      topicSlug: input.topicSlug,
      providerUsed: result.providerUsed,
      query: result.query,
      candidatesDiscovered: result.candidatesDiscovered,
      candidatesAttempted: result.candidatesAttempted,
      upsertedCount: result.upserted.length,
      failedCount: result.failed.length,
      upserted: result.upserted.map((source) => ({
        id: source.id,
        sourceKey: source.sourceKey,
        title: source.title,
        topicSlugs: source.topicSlugs,
        authorityTier: source.authorityTier,
        authorityScore: source.authorityScore,
        fetchedContext: source.fetchedContext,
      })),
      failed: result.failed,
    });
  }

  return results;
}

async function revalidateProcessedPages(
  processed: Array<{ tenantSlug: string; pageSlug: string }>,
) {
  await Promise.all(
    processed.map(async (entry) => {
      await revalidateWikiPage(entry.tenantSlug, entry.pageSlug);
      revalidatePath(`/${entry.tenantSlug}`);
      revalidatePath(`/${entry.tenantSlug}/pages`);
      revalidatePath(`/${entry.tenantSlug}/${entry.pageSlug}`);
    }),
  );

  return processed.map((entry) => ({
    tenantSlug: entry.tenantSlug,
    pageSlug: entry.pageSlug,
  }));
}

function readSourceDiscoveryInputs(
  payload: Record<string, unknown>,
  url: URL,
  defaults: {
    tenantId?: string;
    tenantSlug?: string;
    topicSlug?: string;
  },
): ScheduledSourceDiscoveryInput[] {
  const explicit = [
    ...readSourceDiscoveryList(payload.sourceDiscoveries, defaults),
    ...readSourceDiscoveryList(payload.sourceDiscovery, defaults),
  ];

  if (explicit.length > 0) {
    return explicit;
  }

  const queryTopic = readString(url.searchParams.get("sourceTopicSlug"));

  if (queryTopic) {
    return [
      {
        tenantId: defaults.tenantId,
        tenantSlug: defaults.tenantSlug,
        topicSlug: queryTopic,
        query: readString(url.searchParams.get("sourceQuery")),
        limit: readPositiveInteger(url.searchParams.get("sourceLimit")),
      },
    ];
  }

  const configuredTopics = readCommaList(
    process.env.WIKI_SCHEDULED_SOURCE_DISCOVERY_TOPICS,
  );
  const configuredTenantSlug = readString(
    process.env.WIKI_SCHEDULED_SOURCE_DISCOVERY_TENANT_SLUG,
  );

  if (
    configuredTopics.length > 0 &&
    !defaults.tenantId &&
    !defaults.tenantSlug &&
    !configuredTenantSlug
  ) {
    return [];
  }

  return configuredTopics.map((topicSlug) => ({
    tenantId: defaults.tenantId,
    tenantSlug: defaults.tenantSlug ?? configuredTenantSlug,
    topicSlug,
    limit: readPositiveInteger(process.env.WIKI_SOURCE_DISCOVERY_LIMIT),
  }));
}

function readSourceDiscoveryList(
  value: unknown,
  defaults: {
    tenantId?: string;
    tenantSlug?: string;
    topicSlug?: string;
  },
) {
  const entries = Array.isArray(value) ? value : value ? [value] : [];

  return entries
    .map((entry) => readSourceDiscoveryInput(entry, defaults))
    .filter((entry): entry is ScheduledSourceDiscoveryInput => Boolean(entry));
}

function readSourceDiscoveryInput(
  value: unknown,
  defaults: {
    tenantId?: string;
    tenantSlug?: string;
    topicSlug?: string;
  },
): ScheduledSourceDiscoveryInput | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const input = value as Record<string, unknown>;
  const topicSlug = readString(input.topicSlug) ?? defaults.topicSlug;

  if (!topicSlug) {
    return null;
  }

  return {
    tenantId: readString(input.tenantId) ?? defaults.tenantId,
    tenantSlug: readString(input.tenantSlug) ?? defaults.tenantSlug,
    topicSlug,
    query: readString(input.query),
    limit: readPositiveInteger(input.limit),
    candidates: readCandidateSources(input.candidates),
  };
}

function readEventPayload(payload: Record<string, unknown>) {
  return Array.isArray(payload.events)
    ? (payload.events as UpcomingGameEvent[])
    : null;
}

function summarizeSourceIngestion(result: CuratedSourceIngestionResult) {
  return {
    tenantsProcessed: result.tenantsProcessed,
    sourcesAttempted: result.sourcesAttempted,
    upsertedCount: result.upserted.length,
    failedCount: result.failed.length,
    upserted: result.upserted.map((source) => ({
      id: source.id,
      sourceKey: source.sourceKey,
      title: source.title,
      topicSlugs: source.topicSlugs,
      authorityTier: source.authorityTier,
      authorityScore: source.authorityScore,
      usedFallbackContext: source.usedFallbackContext,
    })),
    failed: result.failed,
  };
}

function summaryQueueItem(item: {
  id: string;
  targetSlug: string;
  scheduledFor: Date;
  status: string;
  dedupeKey: string;
}) {
  return {
    id: item.id,
    targetSlug: item.targetSlug,
    scheduledFor: item.scheduledFor,
    status: item.status,
    dedupeKey: item.dedupeKey,
  };
}

function inferModeFromSchedule(
  schedule: string | null,
): ScheduledUpdateMode | null {
  if (schedule === WEEKLY_SCHEDULE) {
    return "weekly";
  }

  if (schedule === EVENT_SCHEDULE) {
    return "events";
  }

  return null;
}

function readMode(value: unknown): ScheduledUpdateMode | null {
  if (value === "weekly" || value === "events" || value === "maintenance") {
    return value;
  }

  return null;
}

function normalizePayload(value: unknown) {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);

  return values.length > 0 ? values : undefined;
}

function readCommaList(value: string | undefined | null) {
  if (!value?.trim()) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readCandidateSources(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const candidates = value.filter(
    (entry): entry is Record<string, unknown> =>
      typeof entry === "object" && entry !== null,
  );

  return candidates.length > 0 ? candidates : undefined;
}

function readBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  if (value === "true" || value === "1") {
    return true;
  }

  if (value === "false" || value === "0") {
    return false;
  }

  return undefined;
}

function readDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

function readPositiveInteger(value: unknown) {
  const number = readPositiveNumber(value);

  return number ? Math.floor(number) : undefined;
}

function readNonNegativeInteger(value: unknown) {
  const number = readNonNegativeNumber(value);

  return number === undefined ? undefined : Math.floor(number);
}

function readPositiveNumber(value: unknown) {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function readNonNegativeNumber(value: unknown) {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

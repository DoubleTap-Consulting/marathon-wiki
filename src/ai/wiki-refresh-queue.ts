import { randomUUID } from "node:crypto";

import type { Kysely, Transaction } from "kysely";
import { sql } from "kysely";

import {
  generateAiCanonicalWikiPageRevision,
  type AiCanonicalPageGenerator,
} from "./wiki-canonical";
import type { GatewayGenerateText } from "./gateway";
import type { WikiActor } from "@/src/auth/wiki-auth";
import { getDb } from "@/src/db/client";
import type { DB } from "@/src/db/types";
import type { WikiTenant } from "@/src/db/wiki";
import { normalizeWikiSlug } from "@/src/wiki/tenant-routing";

type WikiDatabase = Kysely<DB> | Transaction<DB>;

export const AI_REFRESH_QUEUE_STATUS = {
  queued: "queued",
  processing: "processing",
  succeeded: "succeeded",
  failed: "failed",
} as const;

export type AiRefreshQueueStatus =
  (typeof AI_REFRESH_QUEUE_STATUS)[keyof typeof AI_REFRESH_QUEUE_STATUS];

export type AiRefreshQueueItem = {
  id: string;
  tenantId: string;
  pageId: string | null;
  targetSlug: string;
  pageTitle: string;
  reason: string;
  source: string;
  status: AiRefreshQueueStatus;
  scheduledFor: Date;
  attempts: number;
  dedupeKey: string;
  lastError: string | null;
  errorMetadata: unknown | null;
  metadata: unknown | null;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AiRefreshTarget = {
  targetSlug: string;
  pageTitle: string;
  pageId?: string | null;
};

export type UpcomingGameEvent = {
  title: string;
  eventDate: Date | string;
  eventKey?: string | null;
  url?: string | null;
  summary?: string | null;
  targets?: AiRefreshTarget[];
};

export type UpcomingGameEventProvider = (input: {
  tenant: WikiTenant;
  now: Date;
  windowEnd: Date;
}) => Promise<UpcomingGameEvent[]>;

const QUEUE_COLUMNS = [
  "id",
  "tenant_id as tenantId",
  "page_id as pageId",
  "target_slug as targetSlug",
  "page_title as pageTitle",
  "reason",
  "source",
  "status",
  "scheduled_for as scheduledFor",
  "attempts",
  "dedupe_key as dedupeKey",
  "last_error as lastError",
  "error_metadata as errorMetadata",
  "metadata",
  "processed_at as processedAt",
  "created_at as createdAt",
  "updated_at as updatedAt",
] as const;

const SYSTEM_REFRESH_ACTOR: WikiActor = {
  id: "ai-refresh-queue",
  email: "ai-refresh-queue@example.local",
  name: "AI Refresh Queue",
  provider: "system",
};

const MS_PER_DAY = 24 * 60 * 60 * 1_000;

export async function enqueueAiRefreshQueueItem(
  input: {
    tenantId: string;
    pageId?: string | null;
    targetSlug: string;
    pageTitle: string;
    reason: string;
    source: string;
    scheduledFor: Date;
    dedupeKey?: string;
    metadata?: unknown;
  },
  db: Kysely<DB> = getDb(),
): Promise<AiRefreshQueueItem> {
  const targetSlug = normalizeWikiSlug(input.targetSlug);
  const pageTitle = input.pageTitle.trim();

  if (!targetSlug) {
    throw new Error("Refresh queue target slug is required.");
  }

  if (pageTitle.length < 3) {
    throw new Error("Refresh queue page title must be at least 3 characters.");
  }

  const dedupeKey =
    input.dedupeKey ??
    buildRefreshQueueDedupeKey({
      tenantId: input.tenantId,
      targetSlug,
      reason: input.reason,
      source: input.source,
      scheduledFor: input.scheduledFor,
    });

  const inserted = await db
    .insertInto("ai_refresh_queue_items")
    .values({
      id: createQueueId(),
      tenant_id: input.tenantId,
      page_id: input.pageId ?? null,
      target_slug: targetSlug,
      page_title: pageTitle,
      reason: input.reason,
      source: input.source,
      status: AI_REFRESH_QUEUE_STATUS.queued,
      scheduled_for: input.scheduledFor,
      attempts: 0,
      dedupe_key: dedupeKey,
      last_error: null,
      error_metadata: null,
      metadata: input.metadata ?? null,
      processed_at: null,
    })
    .onConflict((oc) => oc.column("dedupe_key").doNothing())
    .returning(QUEUE_COLUMNS)
    .executeTakeFirst();

  if (inserted) {
    return normalizeQueueItem(inserted);
  }

  const existing = await getAiRefreshQueueItemByDedupeKey(dedupeKey, db);

  if (!existing) {
    throw new Error("Refresh queue dedupe lookup failed.");
  }

  return existing;
}

export async function getAiRefreshQueueItemByDedupeKey(
  dedupeKey: string,
  db: WikiDatabase = getDb(),
): Promise<AiRefreshQueueItem | null> {
  const row = await db
    .selectFrom("ai_refresh_queue_items")
    .select(QUEUE_COLUMNS)
    .where("dedupe_key", "=", dedupeKey)
    .executeTakeFirst();

  return row ? normalizeQueueItem(row) : null;
}

export async function enqueueWeeklyAiRefreshes(
  input: {
    tenantId?: string;
    now?: Date;
    staleAfterDays?: number;
    limit?: number;
  } = {},
  options: { db?: Kysely<DB> } = {},
): Promise<{
  eligibleCount: number;
  enqueued: AiRefreshQueueItem[];
}> {
  const db = options.db ?? getDb();
  const now = input.now ?? new Date();
  const staleAfterDays = input.staleAfterDays ?? 7;
  const limit = input.limit ?? 10;
  const staleBefore = new Date(now.getTime() - staleAfterDays * MS_PER_DAY);
  let query = db
    .selectFrom("wiki_pages as page")
    .innerJoin("wiki_page_revisions as revision", (join) =>
      join
        .onRef("revision.tenant_id", "=", "page.tenant_id")
        .onRef("revision.page_id", "=", "page.id")
        .onRef("revision.revision_number", "=", "page.latest_revision_number"),
    )
    .select([
      "page.id as pageId",
      "page.tenant_id as tenantId",
      "page.slug as targetSlug",
      "page.title as pageTitle",
      "page.latest_revision_number as latestRevisionNumber",
      "revision.created_at as latestAiRevisionAt",
    ])
    .where("page.status", "=", "published")
    .where("revision.ai_provenance", "is not", null)
    .where("revision.created_at", "<=", staleBefore)
    .orderBy("revision.created_at", "asc")
    .orderBy("page.slug", "asc")
    .limit(limit);

  if (input.tenantId) {
    query = query.where("page.tenant_id", "=", input.tenantId);
  }

  const eligiblePages = await query.execute();
  const weekKey = getUtcWeekKey(now);
  const enqueued: AiRefreshQueueItem[] = [];

  for (const page of eligiblePages) {
    enqueued.push(
      await enqueueAiRefreshQueueItem(
        {
          tenantId: page.tenantId,
          pageId: page.pageId,
          targetSlug: page.targetSlug,
          pageTitle: page.pageTitle,
          reason: "weekly_refresh",
          source: "weekly_cron",
          scheduledFor: now,
          dedupeKey: `weekly:${page.tenantId}:${page.targetSlug}:${weekKey}`,
          metadata: {
            latestRevisionNumber: page.latestRevisionNumber,
            latestAiRevisionAt: page.latestAiRevisionAt.toISOString(),
            staleAfterDays,
          },
        },
        db,
      ),
    );
  }

  return {
    eligibleCount: eligiblePages.length,
    enqueued,
  };
}

export async function enqueueUpcomingEventRefreshes(
  input: {
    tenantId?: string;
    now?: Date;
    windowDays?: number;
    defaultTargets?: AiRefreshTarget[];
  } = {},
  options: {
    db?: Kysely<DB>;
    discoverUpcomingEvents?: UpcomingGameEventProvider;
  } = {},
): Promise<{
  discoveredCount: number;
  enqueued: AiRefreshQueueItem[];
}> {
  const db = options.db ?? getDb();
  const now = input.now ?? new Date();
  const windowEnd = new Date(now.getTime() + (input.windowDays ?? 7) * MS_PER_DAY);
  const discoverUpcomingEvents =
    options.discoverUpcomingEvents ?? createConfiguredUpcomingEventProvider();
  const tenants = await listActiveTenantsForRefresh(input.tenantId, db);
  const enqueued: AiRefreshQueueItem[] = [];
  let discoveredCount = 0;

  for (const tenant of tenants) {
    const events = await discoverUpcomingEvents({
      tenant,
      now,
      windowEnd,
    });
    discoveredCount += events.length;

    for (const event of events) {
      const eventDate = normalizeEventDate(event.eventDate);

      if (!eventDate || eventDate < now || eventDate > windowEnd) {
        continue;
      }

      const targets = normalizeRefreshTargets(
        event.targets?.length ? event.targets : input.defaultTargets,
      );

      for (const target of targets) {
        const eventKey = normalizeWikiSlug(event.eventKey || event.title);
        const eventDateKey = formatUtcDate(eventDate);
        const dedupeKey = [
          "event",
          tenant.id,
          target.targetSlug,
          eventDateKey,
          eventKey,
        ].join(":");

        enqueued.push(
          await enqueueAiRefreshQueueItem(
            {
              tenantId: tenant.id,
              pageId: target.pageId ?? null,
              targetSlug: target.targetSlug,
              pageTitle: target.pageTitle,
              reason: "upcoming_game_event",
              source: "event_discovery",
              scheduledFor: eventDate,
              dedupeKey,
              metadata: {
                eventTitle: event.title,
                eventDate: eventDate.toISOString(),
                eventKey,
                eventUrl: event.url ?? null,
                eventSummary: event.summary ?? null,
              },
            },
            db,
          ),
        );
      }
    }
  }

  return {
    discoveredCount,
    enqueued,
  };
}

export async function processDueAiRefreshQueueItems(
  input: {
    now?: Date;
    limit?: number;
  } = {},
  options: {
    db?: Kysely<DB>;
    actor?: WikiActor;
    generateCanonicalPage?: AiCanonicalPageGenerator;
    generate?: GatewayGenerateText;
    env?: Partial<NodeJS.ProcessEnv>;
  } = {},
): Promise<{
  processed: Array<{
    item: AiRefreshQueueItem;
    tenantSlug: string;
    pageSlug: string;
  }>;
  failed: Array<{ item: AiRefreshQueueItem; error: string }>;
}> {
  const db = options.db ?? getDb();
  const now = input.now ?? new Date();
  const dueItems = await claimDueAiRefreshQueueItems(
    {
      now,
      limit: input.limit ?? 5,
    },
    db,
  );
  const actor = options.actor ?? SYSTEM_REFRESH_ACTOR;
  const processed: Array<{
    item: AiRefreshQueueItem;
    tenantSlug: string;
    pageSlug: string;
  }> = [];
  const failed: Array<{ item: AiRefreshQueueItem; error: string }> = [];

  for (const item of dueItems) {
    try {
      const tenant = await getWikiTenantById(item.tenantId, db);

      if (!tenant) {
        throw new Error(`Tenant ${item.tenantId} no longer exists.`);
      }

      const result = await generateAiCanonicalWikiPageRevision(
        {
          tenant,
          actor,
          pageTitle: item.pageTitle,
          targetSlug: item.targetSlug,
          refreshReason: item.reason,
        },
        {
          db,
          generateCanonicalPage: options.generateCanonicalPage,
          generate: options.generate,
          env: options.env,
        },
      );
      const updatedItem = await markAiRefreshQueueItemSucceeded(
        item.id,
        {
          processedAt: new Date(),
          pageId: result.page.id,
          pageSlug: result.page.slug,
          latestRevisionNumber: result.page.latestRevisionNumber,
        },
        db,
      );

      processed.push({
        item: updatedItem,
        tenantSlug: tenant.slug,
        pageSlug: result.page.slug,
      });
    } catch (error) {
      const message = getErrorMessage(error);
      const updatedItem = await markAiRefreshQueueItemFailed(
        item.id,
        message,
        {
          name: error instanceof Error ? error.name : "Error",
          message,
          failedAt: new Date().toISOString(),
        },
        db,
      );

      failed.push({
        item: updatedItem,
        error: message,
      });
    }
  }

  return {
    processed,
    failed,
  };
}

export function createConfiguredUpcomingEventProvider(
  env: Partial<NodeJS.ProcessEnv> = process.env,
  fetchImpl: typeof fetch | undefined = globalThis.fetch,
): UpcomingGameEventProvider {
  const endpoint = env.WIKI_EVENT_DISCOVERY_ENDPOINT?.trim();

  if (!endpoint || !fetchImpl) {
    return async () => [];
  }

  return async ({ tenant, now, windowEnd }) => {
    const url = new URL(endpoint);
    url.searchParams.set("game", tenant.gameTitle);
    url.searchParams.set("from", now.toISOString());
    url.searchParams.set("to", windowEnd.toISOString());
    url.searchParams.set(
      "query",
      `${tenant.gameTitle} Bungie patch event next 7 days`,
    );

    const headers: Record<string, string> = {
      accept: "application/json",
    };
    const token = env.WIKI_EVENT_DISCOVERY_TOKEN?.trim();

    if (token) {
      headers.authorization = `Bearer ${token}`;
    }

    const response = await fetchImpl(url, {
      cache: "no-store",
      headers,
    });

    if (!response.ok) {
      throw new Error(
        `Event discovery failed with HTTP ${response.status} for ${tenant.gameTitle}.`,
      );
    }

    return normalizeUpcomingEventPayload(await response.json());
  };
}

export function parseEventRefreshTargets(value: string | undefined) {
  if (!value?.trim()) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => {
      const [slug, title] = entry.split(":");

      return {
        targetSlug: normalizeWikiSlug(slug ?? ""),
        pageTitle: (title ?? slug ?? "").trim(),
      };
    })
    .filter((target) => target.targetSlug && target.pageTitle.length >= 3);
}

async function claimDueAiRefreshQueueItems(
  input: { now: Date; limit: number },
  db: Kysely<DB>,
) {
  return db.transaction().execute(async (trx) => {
    const dueItems = await trx
      .selectFrom("ai_refresh_queue_items")
      .select(QUEUE_COLUMNS)
      .where("status", "=", AI_REFRESH_QUEUE_STATUS.queued)
      .where("scheduled_for", "<=", input.now)
      .orderBy("scheduled_for", "asc")
      .orderBy("created_at", "asc")
      .limit(input.limit)
      .execute();
    const claimed: AiRefreshQueueItem[] = [];

    for (const item of dueItems) {
      const updated = await trx
        .updateTable("ai_refresh_queue_items")
        .set({
          status: AI_REFRESH_QUEUE_STATUS.processing,
          attempts: sql<number>`attempts + 1`,
          updated_at: new Date(),
        })
        .where("id", "=", item.id)
        .where("status", "=", AI_REFRESH_QUEUE_STATUS.queued)
        .returning(QUEUE_COLUMNS)
        .executeTakeFirst();

      if (updated) {
        claimed.push(normalizeQueueItem(updated));
      }
    }

    return claimed;
  });
}

async function markAiRefreshQueueItemSucceeded(
  id: string,
  metadata: {
    processedAt: Date;
    pageId: string;
    pageSlug: string;
    latestRevisionNumber: number;
  },
  db: Kysely<DB>,
) {
  const updated = await db
    .updateTable("ai_refresh_queue_items")
    .set({
      page_id: metadata.pageId,
      status: AI_REFRESH_QUEUE_STATUS.succeeded,
      last_error: null,
      error_metadata: null,
      processed_at: metadata.processedAt,
      updated_at: new Date(),
      metadata: sql<unknown>`coalesce(metadata, '{}'::jsonb) || ${JSON.stringify(
        {
          processedPageSlug: metadata.pageSlug,
          processedRevisionNumber: metadata.latestRevisionNumber,
        },
      )}::jsonb`,
    })
    .where("id", "=", id)
    .returning(QUEUE_COLUMNS)
    .executeTakeFirstOrThrow();

  return normalizeQueueItem(updated);
}

async function markAiRefreshQueueItemFailed(
  id: string,
  message: string,
  errorMetadata: unknown,
  db: Kysely<DB>,
) {
  const updated = await db
    .updateTable("ai_refresh_queue_items")
    .set({
      status: AI_REFRESH_QUEUE_STATUS.failed,
      last_error: truncateErrorMessage(message),
      error_metadata: errorMetadata,
      processed_at: null,
      updated_at: new Date(),
    })
    .where("id", "=", id)
    .returning(QUEUE_COLUMNS)
    .executeTakeFirstOrThrow();

  return normalizeQueueItem(updated);
}

async function getWikiTenantById(
  tenantId: string,
  db: WikiDatabase,
): Promise<WikiTenant | null> {
  const tenant = await db
    .selectFrom("tenants")
    .innerJoin("games", "games.id", "tenants.game_id")
    .select([
      "tenants.id as id",
      "tenants.slug as slug",
      "tenants.name as name",
      "games.slug as gameSlug",
      "games.title as gameTitle",
    ])
    .where("tenants.id", "=", tenantId)
    .where("tenants.status", "=", "active")
    .executeTakeFirst();

  return tenant ?? null;
}

async function listActiveTenantsForRefresh(
  tenantId: string | undefined,
  db: WikiDatabase,
): Promise<WikiTenant[]> {
  let query = db
    .selectFrom("tenants")
    .innerJoin("games", "games.id", "tenants.game_id")
    .select([
      "tenants.id as id",
      "tenants.slug as slug",
      "tenants.name as name",
      "games.slug as gameSlug",
      "games.title as gameTitle",
    ])
    .where("tenants.status", "=", "active")
    .orderBy("tenants.slug", "asc");

  if (tenantId) {
    query = query.where("tenants.id", "=", tenantId);
  }

  return query.execute();
}

function buildRefreshQueueDedupeKey(input: {
  tenantId: string;
  targetSlug: string;
  reason: string;
  source: string;
  scheduledFor: Date;
}) {
  return [
    input.source,
    input.reason,
    input.tenantId,
    input.targetSlug,
    formatUtcDate(input.scheduledFor),
  ].join(":");
}

function normalizeRefreshTargets(targets: AiRefreshTarget[] | undefined) {
  if (!targets) {
    return [];
  }

  return targets
    .map((target) => ({
      pageId: target.pageId ?? null,
      targetSlug: normalizeWikiSlug(target.targetSlug),
      pageTitle: target.pageTitle.trim(),
    }))
    .filter((target) => target.targetSlug && target.pageTitle.length >= 3);
}

function normalizeUpcomingEventPayload(payload: unknown): UpcomingGameEvent[] {
  const events = Array.isArray(payload)
    ? payload
    : typeof payload === "object" &&
        payload !== null &&
        "events" in payload &&
        Array.isArray(payload.events)
      ? payload.events
      : [];

  return events
    .map((event) => normalizeUpcomingEvent(event))
    .filter((event): event is UpcomingGameEvent => Boolean(event));
}

function normalizeUpcomingEvent(event: unknown): UpcomingGameEvent | null {
  if (typeof event !== "object" || event === null) {
    return null;
  }

  const rawEvent = event as Record<string, unknown>;
  const title = typeof rawEvent.title === "string" ? rawEvent.title.trim() : "";
  const rawEventDate = rawEvent.eventDate ?? rawEvent.date;

  if (!title || (!isDate(rawEventDate) && typeof rawEventDate !== "string")) {
    return null;
  }

  return {
    title,
    eventDate: rawEventDate,
    eventKey: typeof rawEvent.eventKey === "string" ? rawEvent.eventKey : null,
    url: typeof rawEvent.url === "string" ? rawEvent.url : null,
    summary: typeof rawEvent.summary === "string" ? rawEvent.summary : null,
    targets: Array.isArray(rawEvent.targets)
      ? rawEvent.targets
          .map((target) => normalizeRefreshTarget(target))
          .filter((target): target is AiRefreshTarget => Boolean(target))
      : undefined,
  };
}

function normalizeRefreshTarget(target: unknown): AiRefreshTarget | null {
  if (typeof target !== "object" || target === null) {
    return null;
  }

  const rawTarget = target as Record<string, unknown>;
  const targetSlug =
    typeof rawTarget.targetSlug === "string"
      ? rawTarget.targetSlug
      : typeof rawTarget.slug === "string"
        ? rawTarget.slug
        : "";
  const pageTitle =
    typeof rawTarget.pageTitle === "string"
      ? rawTarget.pageTitle
      : typeof rawTarget.title === "string"
        ? rawTarget.title
        : "";

  return {
    targetSlug,
    pageTitle,
    pageId: typeof rawTarget.pageId === "string" ? rawTarget.pageId : null,
  };
}

function normalizeEventDate(value: Date | string) {
  const date = isDate(value) ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function isDate(value: unknown): value is Date {
  return value instanceof Date;
}

function normalizeQueueItem(
  row: Omit<AiRefreshQueueItem, "status"> & { status: string },
): AiRefreshQueueItem {
  return {
    ...row,
    status: normalizeQueueStatus(row.status),
  };
}

function normalizeQueueStatus(status: string): AiRefreshQueueStatus {
  if (
    status === AI_REFRESH_QUEUE_STATUS.processing ||
    status === AI_REFRESH_QUEUE_STATUS.succeeded ||
    status === AI_REFRESH_QUEUE_STATUS.failed
  ) {
    return status;
  }

  return AI_REFRESH_QUEUE_STATUS.queued;
}

function createQueueId() {
  return `refresh_${randomUUID()}`;
}

function getUtcWeekKey(date: Date) {
  const weekStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const utcDay = weekStart.getUTCDay();
  const daysSinceMonday = (utcDay + 6) % 7;
  weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceMonday);

  return formatUtcDate(weekStart);
}

function formatUtcDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function truncateErrorMessage(message: string) {
  return message.length > 2_000 ? `${message.slice(0, 2_000)}...` : message;
}

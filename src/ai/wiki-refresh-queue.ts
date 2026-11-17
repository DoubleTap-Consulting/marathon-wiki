import { randomUUID } from "node:crypto";

import type { Kysely, Transaction } from "kysely";
import { sql } from "kysely";

import { runEditor } from "@/src/content/editor-store";
import type { PublishPolicy, StructuredCall } from "@/src/content/editor";
import { BudgetExceeded, MemoryLedger, createGatewayCaller, hasGatewayCredential } from "@/src/content/model-gateway";
import type { WikiActor } from "@/src/auth/wiki-auth";
import { getDb } from "@/src/db/client";
import type { DB } from "@/src/db/types";
import type { WikiTenant } from "@/src/db/wiki";
import { isTenantPubliclyEnabled, normalizeWikiSlug } from "@/src/wiki/tenant-routing";

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

/** Per-run AI spend cap when WIKI_AI_RUN_CAP_USD is unset. A daily run of 3 pages costs about $0.05. */
export const DEFAULT_RUN_CAP_USD = 0.25;

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

export type ProcessedRefresh = {
  item: AiRefreshQueueItem;
  tenantSlug: string;
  pageSlug: string;
  outcome: "published" | "needs_review" | "unchanged";
  suggestionId?: string;
};

/**
 * The AI editor's worker. It claims due items atomically, so concurrent runs never double-process.
 * Each item is regenerated through the shared content pipeline and then published or filed for
 * review by the publish gate. A per-run spend cap stops the run and returns unprocessed items to
 * the queue. Without a model credential, nothing is claimed.
 */
export async function processDueAiRefreshQueueItems(
  input: {
    now?: Date;
    limit?: number;
    /** Only process this wiki's items (the manual trigger and tests use this). */
    tenantId?: string;
  } = {},
  options: {
    db?: Kysely<DB>;
    actor?: WikiActor;
    call?: StructuredCall;
    policy?: PublishPolicy;
    env?: Partial<NodeJS.ProcessEnv>;
  } = {},
): Promise<{
  processed: ProcessedRefresh[];
  failed: Array<{ item: AiRefreshQueueItem; error: string }>;
  skipped: string | null;
  spendUsd: number;
}> {
  const db = options.db ?? getDb();
  const env = options.env ?? process.env;
  const now = input.now ?? new Date();
  const actor = options.actor ?? SYSTEM_REFRESH_ACTOR;
  const processed: ProcessedRefresh[] = [];
  const failed: Array<{ item: AiRefreshQueueItem; error: string }> = [];

  if (!options.call && !hasGatewayCredential(env)) {
    return { processed, failed, skipped: "no AI Gateway credential; no items were claimed", spendUsd: 0 };
  }
  const ledger = new MemoryLedger();
  const call =
    options.call ??
    createGatewayCaller({
      ledger,
      capUsd: Number(env.WIKI_AI_RUN_CAP_USD ?? DEFAULT_RUN_CAP_USD),
      minIntervalMs: Number(env.WIKI_AI_MIN_CALL_INTERVAL_MS ?? 1_000),
    });
  const spendUsd = () => {
    const attached = (call as { ledger?: MemoryLedger }).ledger;
    return (attached ?? ledger).totalUsd();
  };

  const dueItems = await claimDueAiRefreshQueueItems(
    {
      now,
      limit: Math.min(input.limit ?? 5, 20),
      tenantId: input.tenantId,
    },
    db,
  );

  for (const [index, item] of dueItems.entries()) {
    try {
      const tenant = await getWikiTenantById(item.tenantId, db);

      if (!tenant) {
        throw new Error(`Tenant ${item.tenantId} no longer exists.`);
      }

      if (!isTenantPubliclyEnabled(tenant.slug, env)) {
        await releaseAiRefreshQueueItem(item.id, db);
        continue;
      }

      const metadata = (item.metadata ?? {}) as { sourceKey?: string; editorNote?: string };
      const outcome = await runEditor(
        {
          tenant,
          targetSlug: item.targetSlug,
          pageTitle: item.pageTitle,
          refreshReason: item.reason,
          call,
          actorId: actor.id,
          changedSources: metadata.sourceKey ? [metadata.sourceKey] : undefined,
          instructions: metadata.editorNote ? [metadata.editorNote] : undefined,
          policy: options.policy,
          now,
        },
        db,
      );

      const updatedItem = await markAiRefreshQueueItemSucceeded(
        item.id,
        {
          processedAt: new Date(),
          pageId: outcome.kind === "published" ? outcome.page.id : item.pageId,
          pageSlug: outcome.kind === "published" ? outcome.page.slug : item.targetSlug,
          latestRevisionNumber: outcome.kind === "published" ? outcome.page.latestRevisionNumber : null,
          outcome: outcome.kind,
          suggestionId: outcome.kind === "needs_review" ? outcome.suggestionId : undefined,
          gateReasons: outcome.kind === "needs_review" ? outcome.reasons : undefined,
          changeNote: outcome.changeNote,
          rejected: outcome.rejected,
        },
        db,
      );
      processed.push({
        item: updatedItem,
        tenantSlug: tenant.slug,
        pageSlug: outcome.kind === "published" ? outcome.page.slug : item.targetSlug,
        outcome: outcome.kind,
        ...(outcome.kind === "needs_review" ? { suggestionId: outcome.suggestionId } : {}),
      });
    } catch (error) {
      if (error instanceof BudgetExceeded) {
        // Stop spending and return the claimed items, untouched, to the queue.
        for (const pending of dueItems.slice(index)) await releaseAiRefreshQueueItem(pending.id, db);
        return { processed, failed, skipped: error.message, spendUsd: spendUsd() };
      }
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
    skipped: null,
    spendUsd: spendUsd(),
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
  input: { now: Date; limit: number; tenantId?: string },
  db: Kysely<DB>,
) {
  return db.transaction().execute(async (trx) => {
    let query = trx.selectFrom("ai_refresh_queue_items").select(QUEUE_COLUMNS);
    if (input.tenantId) query = query.where("tenant_id", "=", input.tenantId);
    const dueItems = await query
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
    pageId: string | null;
    pageSlug: string;
    latestRevisionNumber: number | null;
    outcome: "published" | "needs_review" | "unchanged";
    suggestionId?: string;
    gateReasons?: string[];
    changeNote?: string;
    rejected?: Array<{ text: string; reason: string }>;
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
          outcome: metadata.outcome,
          suggestionId: metadata.suggestionId ?? null,
          gateReasons: metadata.gateReasons ?? [],
          changeNote: metadata.changeNote ?? null,
          rejected: metadata.rejected ?? [],
        },
      )}::jsonb`,
    })
    .where("id", "=", id)
    .returning(QUEUE_COLUMNS)
    .executeTakeFirstOrThrow();

  return normalizeQueueItem(updated);
}

async function releaseAiRefreshQueueItem(id: string, db: Kysely<DB>) {
  await db
    .updateTable("ai_refresh_queue_items")
    .set({ status: AI_REFRESH_QUEUE_STATUS.queued, attempts: sql<number>`greatest(attempts - 1, 0)`, updated_at: new Date() })
    .where("id", "=", id)
    .where("status", "=", AI_REFRESH_QUEUE_STATUS.processing)
    .execute();
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

  return (await query.execute()).filter((tenant) => isTenantPubliclyEnabled(tenant.slug));
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

function formatUtcDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function truncateErrorMessage(message: string) {
  return message.length > 2_000 ? `${message.slice(0, 2_000)}...` : message;
}

import { afterAll, beforeAll, describe, expect, it } from "vitest";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI can provide DATABASE_URL directly.
}

import { AI_GATEWAY_CANONICAL_PROMPT_VERSION } from "./gateway";
import {
  AI_REFRESH_QUEUE_STATUS,
  enqueueAiRefreshQueueItem,
  enqueueUpcomingEventRefreshes,
  enqueueWeeklyAiRefreshes,
  processDueAiRefreshQueueItems,
} from "./wiki-refresh-queue";
import { getDb } from "@/src/db/client";
import {
  getPublishedWikiPageBySlug,
  saveWikiPageWithRevision,
  type WikiPageRevisionAiProvenance,
  type WikiTenant,
} from "@/src/db/wiki";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for AI refresh queue tests.");
}

describe.sequential("AI refresh queue", () => {
  let db: ReturnType<typeof getDb>;
  const runId = `ai_refresh_queue_test_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}`;
  const gameId = `${runId}_game`;
  const tenantId = `${runId}_tenant`;
  const tenantSlug = runId.replaceAll("_", "-");
  const tenant: WikiTenant = {
    id: tenantId,
    slug: tenantSlug,
    name: "AI Refresh Queue Test Wiki",
    gameSlug: `${tenantSlug}-game`,
    gameTitle: "Marathon",
  };
  const now = new Date("2026-07-05T12:00:00.000Z");

  beforeAll(async () => {
    db = getDb();

    await db
      .insertInto("games")
      .values({
        id: gameId,
        slug: tenant.gameSlug,
        title: tenant.gameTitle,
        franchise: "Marathon",
        developer: null,
        publisher: null,
        release_date: null,
        metadata: null,
      })
      .execute();

    await db
      .insertInto("tenants")
      .values({
        id: tenantId,
        game_id: gameId,
        slug: tenantSlug,
        name: tenant.name,
        status: "active",
        primary_locale: "en",
      })
      .execute();
  });

  afterAll(async () => {
    await db.deleteFrom("tenants").where("id", "=", tenantId).execute();
    await db.deleteFrom("games").where("id", "=", gameId).execute();
    await db.destroy();
  });

  it("dedupes queue items by stable dedupe key", async () => {
    const dedupeKey = `${runId}:dedupe:weekly`;
    const first = await enqueueAiRefreshQueueItem(
      {
        tenantId,
        targetSlug: "dedupe-topic",
        pageTitle: "Dedupe Topic",
        reason: "weekly_refresh",
        source: "weekly_cron",
        scheduledFor: now,
        dedupeKey,
      },
      db,
    );
    const second = await enqueueAiRefreshQueueItem(
      {
        tenantId,
        targetSlug: "dedupe-topic",
        pageTitle: "Dedupe Topic",
        reason: "weekly_refresh",
        source: "weekly_cron",
        scheduledFor: now,
        dedupeKey,
      },
      db,
    );
    const count = await db
      .selectFrom("ai_refresh_queue_items")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("dedupe_key", "=", dedupeKey)
      .executeTakeFirstOrThrow();

    expect(second.id).toBe(first.id);
    expect(Number(count.count)).toBe(1);
  });

  it("schedules stale AI-authored pages weekly without scheduling fresh or human pages", async () => {
    const stalePage = await saveWikiPageWithRevision(
      {
        tenantId,
        slug: "stale-ai-page",
        title: "Stale AI Page",
        summary: "Old AI-authored page",
        bodyMarkdown: "## Old\n\nThis AI page is stale.",
        status: "published",
        actorId: "seed-ai",
        aiProvenance: buildAiProvenance("weekly_seed", "seed_ai"),
      },
      db,
    );
    const freshPage = await saveWikiPageWithRevision(
      {
        tenantId,
        slug: "fresh-ai-page",
        title: "Fresh AI Page",
        summary: "Fresh AI-authored page",
        bodyMarkdown: "## Fresh\n\nThis AI page is recent.",
        status: "published",
        actorId: "seed-ai",
        aiProvenance: buildAiProvenance("weekly_seed", "seed_ai"),
      },
      db,
    );
    await saveWikiPageWithRevision(
      {
        tenantId,
        slug: "human-page",
        title: "Human Page",
        summary: "Human-authored page",
        bodyMarkdown: "## Human\n\nThis page is not AI-authored.",
        status: "published",
        actorId: "seed-human",
      },
      db,
    );
    const oldRevisionDate = new Date("2026-06-20T12:00:00.000Z");

    await db
      .updateTable("wiki_page_revisions")
      .set({ created_at: oldRevisionDate })
      .where("tenant_id", "=", tenantId)
      .where("page_id", "=", stalePage.id)
      .execute();
    await db
      .updateTable("wiki_page_revisions")
      .set({ created_at: now })
      .where("tenant_id", "=", tenantId)
      .where("page_id", "=", freshPage.id)
      .execute();

    const firstRun = await enqueueWeeklyAiRefreshes(
      {
        tenantId,
        now,
        staleAfterDays: 7,
        limit: 10,
      },
      { db },
    );
    const secondRun = await enqueueWeeklyAiRefreshes(
      {
        tenantId,
        now,
        staleAfterDays: 7,
        limit: 10,
      },
      { db },
    );
    const weeklyRows = await db
      .selectFrom("ai_refresh_queue_items")
      .select(["target_slug", "reason", "source", "status"])
      .where("tenant_id", "=", tenantId)
      .where("source", "=", "weekly_cron")
      .where("target_slug", "in", [
        "stale-ai-page",
        "fresh-ai-page",
        "human-page",
      ])
      .orderBy("target_slug", "asc")
      .execute();

    expect(firstRun.eligibleCount).toBe(1);
    expect(firstRun.enqueued).toEqual([
      expect.objectContaining({
        pageId: stalePage.id,
        targetSlug: "stale-ai-page",
        reason: "weekly_refresh",
        source: "weekly_cron",
        status: AI_REFRESH_QUEUE_STATUS.queued,
      }),
    ]);
    expect(secondRun.enqueued[0]?.id).toBe(firstRun.enqueued[0]?.id);
    expect(weeklyRows).toEqual([
      {
        target_slug: "stale-ai-page",
        reason: "weekly_refresh",
        source: "weekly_cron",
        status: "queued",
      },
    ]);
  });

  it("schedules upcoming event refreshes on event dates and dedupes repeat discoveries", async () => {
    const eventDate = new Date("2026-07-08T15:00:00.000Z");
    const discoverUpcomingEvents = async () => [
      {
        title: "Marathon Patch Day",
        eventDate,
        eventKey: "marathon-patch-day",
        summary: "Patch day should refresh affected weapon pages.",
        targets: [
          {
            targetSlug: "overrun-ar",
            pageTitle: "Overrun AR",
          },
        ],
      },
      {
        title: "Out of window event",
        eventDate: new Date("2026-08-01T15:00:00.000Z"),
        targets: [
          {
            targetSlug: "late-event",
            pageTitle: "Late Event",
          },
        ],
      },
    ];

    const firstRun = await enqueueUpcomingEventRefreshes(
      {
        tenantId,
        now: new Date("2026-07-05T00:00:00.000Z"),
        windowDays: 7,
      },
      {
        db,
        discoverUpcomingEvents,
      },
    );
    const secondRun = await enqueueUpcomingEventRefreshes(
      {
        tenantId,
        now: new Date("2026-07-05T00:00:00.000Z"),
        windowDays: 7,
      },
      {
        db,
        discoverUpcomingEvents,
      },
    );

    expect(firstRun.discoveredCount).toBe(2);
    expect(firstRun.enqueued).toEqual([
      expect.objectContaining({
        targetSlug: "overrun-ar",
        reason: "upcoming_game_event",
        source: "event_discovery",
        scheduledFor: eventDate,
        status: AI_REFRESH_QUEUE_STATUS.queued,
      }),
    ]);
    expect(secondRun.enqueued[0]?.id).toBe(firstRun.enqueued[0]?.id);
  });

  it("processes a due queue item into an AI canonical revision", async () => {
    await enqueueAiRefreshQueueItem(
      {
        tenantId,
        targetSlug: "queue-worker-success",
        pageTitle: "Queue Worker Success",
        reason: "weekly_refresh",
        source: "weekly_cron",
        scheduledFor: new Date("2026-07-01T12:00:00.000Z"),
        dedupeKey: `${runId}:worker:success`,
      },
      db,
    );

    const result = await processDueAiRefreshQueueItems(
      {
        now,
        limit: 1,
      },
      {
        db,
        generateCanonicalPage: async (request) => {
          expect(request.refreshReason).toBe("weekly_refresh");
          expect(request.targetSlug).toBe("queue-worker-success");

          return {
            title: "Queue Worker Success",
            summary: "Generated by the refresh queue worker.",
            bodyMarkdown:
              "## Overview\n\nThe refresh queue worker generated this canonical page.",
            sourceContextSummary: "No stored source context was needed.",
            provider: "vercel-ai-gateway",
            model: "openai/gpt-5-nano",
            responseId: "gateway_resp_queue_success",
            promptVersion: AI_GATEWAY_CANONICAL_PROMPT_VERSION,
          };
        },
      },
    );
    const page = await getPublishedWikiPageBySlug(
      tenantId,
      "queue-worker-success",
      db,
    );
    const queueItem = await db
      .selectFrom("ai_refresh_queue_items")
      .select(["status", "attempts", "last_error"])
      .where("dedupe_key", "=", `${runId}:worker:success`)
      .executeTakeFirstOrThrow();

    expect(result.failed).toEqual([]);
    expect(result.processed).toEqual([
      expect.objectContaining({
        pageSlug: "queue-worker-success",
      }),
    ]);
    expect(page).toMatchObject({
      slug: "queue-worker-success",
      latestRevisionNumber: 1,
      latestRevision: expect.objectContaining({
        aiProvenance: expect.objectContaining({
          refreshReason: "weekly_refresh",
        }),
      }),
    });
    expect(queueItem).toEqual({
      status: "succeeded",
      attempts: 1,
      last_error: null,
    });
  });

  it("records worker failures without mutating the public page", async () => {
    const page = await saveWikiPageWithRevision(
      {
        tenantId,
        slug: "queue-worker-failure",
        title: "Queue Worker Failure",
        summary: "Stable page before a failed refresh.",
        bodyMarkdown: "## Stable\n\nThis content should survive queue failure.",
        status: "published",
        actorId: "seed-editor",
        aiProvenance: buildAiProvenance("seed", "seed_ai"),
      },
      db,
    );
    await enqueueAiRefreshQueueItem(
      {
        tenantId,
        pageId: page.id,
        targetSlug: "queue-worker-failure",
        pageTitle: "Queue Worker Failure",
        reason: "weekly_refresh",
        source: "weekly_cron",
        scheduledFor: new Date("2026-07-01T12:00:00.000Z"),
        dedupeKey: `${runId}:worker:failure`,
      },
      db,
    );

    const result = await processDueAiRefreshQueueItems(
      {
        now,
        limit: 1,
      },
      {
        db,
        generateCanonicalPage: async () => {
          throw new Error("AI Gateway unavailable in queue test.");
        },
      },
    );
    const publicPage = await getPublishedWikiPageBySlug(
      tenantId,
      "queue-worker-failure",
      db,
    );
    const queueItem = await db
      .selectFrom("ai_refresh_queue_items")
      .select(["status", "attempts", "last_error", "error_metadata"])
      .where("dedupe_key", "=", `${runId}:worker:failure`)
      .executeTakeFirstOrThrow();
    const revisionCount = await db
      .selectFrom("wiki_page_revisions")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("tenant_id", "=", tenantId)
      .where("page_id", "=", page.id)
      .executeTakeFirstOrThrow();

    expect(result.processed).toEqual([]);
    expect(result.failed).toEqual([
      expect.objectContaining({
        error: "AI Gateway unavailable in queue test.",
      }),
    ]);
    expect(queueItem).toMatchObject({
      status: "failed",
      attempts: 1,
      last_error: "AI Gateway unavailable in queue test.",
      error_metadata: expect.objectContaining({
        message: "AI Gateway unavailable in queue test.",
      }),
    });
    expect(Number(revisionCount.count)).toBe(1);
    expect(publicPage).toMatchObject({
      slug: "queue-worker-failure",
      bodyMarkdown: "## Stable\n\nThis content should survive queue failure.",
      latestRevisionNumber: 1,
    });
  });
});

function buildAiProvenance(
  refreshReason: string,
  requestedBy: string,
): WikiPageRevisionAiProvenance {
  return {
    provider: "vercel-ai-gateway",
    modelId: "openai/gpt-5-nano",
    promptVersion: AI_GATEWAY_CANONICAL_PROMPT_VERSION,
    generatedAt: new Date("2026-06-20T12:00:00.000Z").toISOString(),
    responseId: null,
    sourceContextSummary: "Seeded test provenance.",
    sourceReferences: [],
    refreshReason,
    requestedBy,
  };
}

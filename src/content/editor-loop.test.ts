import { afterAll, beforeAll, describe, expect, it } from "vitest";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI can provide DATABASE_URL directly.
}

import { DEFAULT_PUBLISH_POLICY, evaluatePublishGate, describeChanges, type Snapshot } from "./editor";
import { countReadableWords, isHubSpec } from "./pipeline";
import { loadRenderedSnapshots, upsertRenderedSnapshots } from "./editor-store";
import { enqueueReaderNoteRefresh, enqueueSourceChangeRefreshes } from "./editor-triggers";
import { BudgetExceeded, MemoryLedger, createGatewayCaller } from "./model-gateway";
import { createScriptedCall } from "./scripted-call";
import { CONTENT_PROMPT_VERSION } from "./pipeline";
import { enqueueAiRefreshQueueItem, processDueAiRefreshQueueItems } from "@/src/ai/wiki-refresh-queue";
import { getDb } from "@/src/db/client";
import {
  approveWikiSuggestion,
  createWikiCommunityNote,
  getPublishedWikiPageBySlug,
  updateWikiCommunityNoteModerationStatus,
} from "@/src/db/wiki";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for the AI editor loop tests.");
}

const SLUG = "runner-shell-drill";

function shellsSnapshot(lines: string[], sha256: string): Snapshot {
  return { sourceKey: "bungie-runner-shells", text: lines.join("\n"), sha256, fetchedAt: "2026-11-14T12:00:00.000Z" };
}

const V1 = [
  "Runner shell drill pages describe the runner shell kits Bungie published.",
  "Bungie lists the runner shell Destroyer as a frontline runner shell.",
  "The runner shell Recon tracks enemies with an echo pulse.",
  "Every runner shell drill entry names the shell and its prime ability.",
];

describe.sequential("AI editor loop", () => {
  const db = getDb();
  const runId = `editor_loop_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const gameId = `${runId}_game`;
  const tenantId = `${runId}_tenant`;
  const tenantSlug = runId.replaceAll("_", "-");
  const now = new Date("2031-01-06T12:00:00.000Z");
  const tick = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

  beforeAll(async () => {
    await db.insertInto("games").values({ id: gameId, slug: `${tenantSlug}-game`, title: "Marathon", franchise: "Marathon", developer: null, publisher: null, release_date: null, metadata: null }).execute();
    await db.insertInto("tenants").values({ id: tenantId, game_id: gameId, slug: tenantSlug, name: "Editor Loop Wiki", status: "active", primary_locale: "en" }).execute();
  });

  afterAll(async () => {
    await db.deleteFrom("tenants").where("id", "=", tenantId).execute();
    await db.deleteFrom("games").where("id", "=", gameId).execute();
    await db.destroy();
  });

  it("stores snapshots idempotently and reports hash changes", async () => {
    const first = await upsertRenderedSnapshots({ tenantId, snapshots: [shellsSnapshot(V1, "sha-v1")] }, db);
    const again = await upsertRenderedSnapshots({ tenantId, snapshots: [shellsSnapshot(V1, "sha-v1")] }, db);
    expect(first.map((change) => change.kind)).toEqual(["new"]);
    expect(again.map((change) => change.kind)).toEqual(["unchanged"]);
    expect(await enqueueSourceChangeRefreshes({ tenantId, changes: first, specs: [] }, db)).toEqual([]);
    expect((await loadRenderedSnapshots(tenantId, db)).map((snapshot) => snapshot.sha256)).toEqual(["sha-v1"]);
  });

  it("writes a new page as a published revision with full provenance", async () => {
    await enqueueAiRefreshQueueItem({ tenantId, targetSlug: SLUG, pageTitle: "Runner Shell Drill", reason: "new_page", source: "manual", scheduledFor: now, dedupeKey: `${runId}:new` }, db);
    const result = await processDueAiRefreshQueueItems({ now, tenantId }, { db, call: createScriptedCall() });
    expect(result.failed).toEqual([]);
    expect(result.processed.map((entry) => entry.outcome)).toEqual(["published"]);

    const page = await getPublishedWikiPageBySlug(tenantId, SLUG, db);
    const provenance = page?.latestRevision?.aiProvenance;
    expect(page?.latestRevisionNumber).toBe(1);
    expect(page?.latestRevision?.changeNote).toBe("First version of the page, written from cited sources.");
    expect(provenance).toMatchObject({ refreshReason: "new_page", modelId: "scripted/editor-drill", promptVersion: CONTENT_PROMPT_VERSION });
    expect(provenance?.claimSupport?.every((claim) => claim.status === "supported")).toBe(true);
    expect(provenance?.sourceReferences?.map((reference) => reference.sourceKey)).toEqual(["bungie-runner-shells"]);
    expect(page?.bodyMarkdown).toContain("{{cite:bungie-runner-shells}}");
  });

  it("refreshes the page when a cited snapshot changes, with a diff and a What changed note", async () => {
    const v2 = [...V1, "Bungie added the runner shell Rook as a new runner shell option."];
    const changes = await upsertRenderedSnapshots({ tenantId, snapshots: [shellsSnapshot(v2, "sha-v2")] }, db);
    expect(changes).toEqual([expect.objectContaining({ kind: "changed", previousSha256: "sha-v1", sha256: "sha-v2" })]);

    const queued = await enqueueSourceChangeRefreshes({ tenantId, changes, now: tick(1), specs: [] }, db);
    const queuedAgain = await enqueueSourceChangeRefreshes({ tenantId, changes, now: tick(1), specs: [] }, db);
    expect(queued.map((item) => [item.targetSlug, item.reason])).toEqual([[SLUG, "source_update"]]);
    expect(queuedAgain.map((item) => item.id)).toEqual(queued.map((item) => item.id));

    const result = await processDueAiRefreshQueueItems({ now: tick(2), tenantId }, { db, call: createScriptedCall() });
    expect(result.processed.map((entry) => entry.outcome)).toEqual(["published"]);
    const page = await getPublishedWikiPageBySlug(tenantId, SLUG, db);
    expect(page?.latestRevisionNumber).toBe(2);
    expect(page?.latestRevision?.aiProvenance?.refreshReason).toBe("source_update");
    expect(page?.latestRevision?.changeNote).toBe("A cited source changed (bungie-runner-shells): 1 statement added.");
    expect(page?.bodyMarkdown).toContain("Rook");
  });

  it("re-checks the page when a reader note is approved and labels the trigger", async () => {
    const page = await getPublishedWikiPageBySlug(tenantId, SLUG, db);
    const note = await createWikiCommunityNote({ tenantId, pageId: page!.id, bodyMarkdown: "The Rook shell is missing its prime ability.", actorId: "reader-1" }, db);
    const approved = await updateWikiCommunityNoteModerationStatus({ tenantId, noteId: note.id, status: "approved", actorId: "editor-1" }, db);
    const item = await enqueueReaderNoteRefresh({ tenantId, noteId: approved.id, pageId: approved.pageId, pageSlug: approved.pageSlug, pageTitle: approved.pageTitle, now: tick(3) }, db);
    const again = await enqueueReaderNoteRefresh({ tenantId, noteId: approved.id, pageId: approved.pageId, pageSlug: approved.pageSlug, pageTitle: approved.pageTitle, now: tick(3) }, db);
    expect(again.id).toBe(item.id);

    const call = createScriptedCall();
    await processDueAiRefreshQueueItems({ now: tick(4), tenantId }, { db, call });
    const draftPrompt = call.calls.find((entry) => entry.step === "draft")?.prompt ?? "";
    expect(draftPrompt).toContain("Reader notes (NOT sources)");
    expect(draftPrompt).toContain("missing its prime ability");
    const refreshed = await getPublishedWikiPageBySlug(tenantId, SLUG, db);
    expect(refreshed?.latestRevisionNumber).toBe(3);
    expect(refreshed?.latestRevision?.aiProvenance?.refreshReason).toBe("community_note");
  });

  it("files a revision under the gate threshold for review instead of publishing it", async () => {
    await enqueueAiRefreshQueueItem({ tenantId, targetSlug: SLUG, pageTitle: "Runner Shell Drill", reason: "scheduled_weekly", source: "weekly_cron", scheduledFor: tick(5), dedupeKey: `${runId}:weekly` }, db);
    const result = await processDueAiRefreshQueueItems(
      { now: tick(6), tenantId },
      { db, call: createScriptedCall(), policy: { ...DEFAULT_PUBLISH_POLICY, minSupportedClaims: 99 } },
    );
    expect(result.processed.map((entry) => entry.outcome)).toEqual(["needs_review"]);
    expect((await getPublishedWikiPageBySlug(tenantId, SLUG, db))?.latestRevisionNumber).toBe(3);

    await approveWikiSuggestion({ tenantId, suggestionId: result.processed[0].suggestionId!, actorId: "editor-1" }, db);
    const approved = await getPublishedWikiPageBySlug(tenantId, SLUG, db);
    expect(approved?.latestRevisionNumber).toBe(4);
    expect(approved?.latestRevision?.aiProvenance?.refreshReason).toBe("scheduled_weekly");
    expect(approved?.latestRevision?.changeNote).toMatch(/^Weekly re-check against the sources/);
  });

  it("stops at the spend cap and returns claimed items to the queue untouched", async () => {
    await enqueueAiRefreshQueueItem({ tenantId, targetSlug: SLUG, pageTitle: "Runner Shell Drill", reason: "manual_refresh", source: "manual", scheduledFor: tick(7), dedupeKey: `${runId}:capped` }, db);
    const call = createGatewayCaller({
      ledger: new MemoryLedger(),
      capUsd: 0.1,
      generate: (() => {
        throw new Error("must not be called");
      }) as never,
    });
    const result = await processDueAiRefreshQueueItems({ now: tick(8), tenantId }, { db, call });
    expect(result.skipped).toMatch(/Spend cap/);
    const item = await db.selectFrom("ai_refresh_queue_items").select(["status", "attempts"]).where("dedupe_key", "=", `${runId}:capped`).executeTakeFirstOrThrow();
    expect(item).toEqual({ status: "queued", attempts: 0 });
  });

  it("claims nothing when there is no model credential", async () => {
    const result = await processDueAiRefreshQueueItems({ now: tick(9), tenantId }, { db, env: {} });
    expect(result.skipped).toMatch(/no AI Gateway credential/);
    const item = await db.selectFrom("ai_refresh_queue_items").select(["status"]).where("dedupe_key", "=", `${runId}:capped`).executeTakeFirstOrThrow();
    expect(item.status).toBe("queued");
  });
});

describe("publish gate and change notes", () => {
  it("publishes only above the supported-claim threshold", () => {
    const claims = (supported: number, unsupported: number, contradicted = 0) => [
      ...Array.from({ length: supported }, () => ({ status: "supported" as const })),
      ...Array.from({ length: unsupported }, () => ({ status: "unsupported" as const })),
      ...Array.from({ length: contradicted }, () => ({ status: "contradicted" as const })),
    ];
    expect(evaluatePublishGate(claims(8, 1, 1)).decision).toBe("publish");
    expect(evaluatePublishGate(claims(2, 0)).reasons).toEqual(["only 2 supported statements (need 3)"]);
    expect(evaluatePublishGate(claims(6, 4)).decision).toBe("needs_review");
  });

  it("sends a hub page under the length minimum to Review, but not a short leaf page", () => {
    const solid = Array.from({ length: 10 }, () => ({ status: "supported" as const }));
    const thinHub = evaluatePublishGate(solid, DEFAULT_PUBLISH_POLICY, { hub: true, words: 106 });
    expect(thinHub.decision).toBe("needs_review");
    expect(thinHub.reasons).toEqual(["hub page has 106 words (need 250)"]);
    expect(evaluatePublishGate(solid, DEFAULT_PUBLISH_POLICY, { hub: true, words: 250 }).decision).toBe("publish");
    expect(evaluatePublishGate(solid, DEFAULT_PUBLISH_POLICY, { hub: false, words: 106 }).decision).toBe("publish");
  });

  it("treats child-page hubs and flagged topic hubs as hubs, and counts only readable words", () => {
    expect(isHubSpec({ hubChildren: ["recon"] })).toBe(true);
    expect(isHubSpec({ hubChildren: [], hub: true })).toBe(true);
    expect(isHubSpec({ hubChildren: [] })).toBe(false);
    const body = "## Overview\n\nThe Armory sells kits.{{cite:a}} It barters too.\n\n| Weapon | Ammo |\n| --- | --- |\n| KKV | Light |\n\n## See also\n\n- [Factions](/marathon/factions)";
    expect(countReadableWords(body)).toBe(11);
  });

  it("counts a reworded statement as unchanged", () => {
    expect(
      describeChanges({
        previous: [{ claimText: "Rook is a scavenger frame that joins matches already in progress.", status: "supported" }],
        next: [{ claimText: "Rook is a scavenger frame that can join matches already in progress.", status: "supported" }],
        refreshReason: "scheduled_weekly",
      }),
    ).toBe("Weekly re-check against the sources: no statements changed.");
  });

  it("describes what changed between claim sets", () => {
    const before = [
      { claimText: "Ranked play opened on March 24, 2026 with two queues.", status: "supported" },
      { claimText: "Low Stakes ranked requires a 3,000 credit ante.", status: "supported" },
    ];
    const after = [
      { claimText: "Ranked play opened on March 24, 2026, with two queues.", status: "contradicted" },
      { claimText: "Season 2 merged ranked into a single queue with a 5,000 minimum.", status: "supported" },
    ];
    expect(describeChanges({ previous: before, next: after, refreshReason: "community_note" })).toBe(
      "A reader's note prompted a re-check: 1 statement added, 1 removed, 1 now marked as sources disagreeing.",
    );
  });

  it("is a BudgetExceeded error type the worker can recognise", () => {
    expect(new BudgetExceeded("x")).toBeInstanceOf(Error);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI can provide DATABASE_URL directly.
}

import { DEFAULT_PUBLISH_POLICY, evaluatePublishGate, describeChanges, type Snapshot, type StructuredCall } from "./editor";
import { countProseWords, isHubSpec } from "./pipeline";
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
import { seedTestCategories } from "@/src/db/test-categories";

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
    await seedTestCategories(db, tenantId);
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
    // A page the editor publishes is filed under its spec's category, never left uncategorized.
    expect(page?.categories.length).toBe(1);
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
    expect(page?.latestRevision?.aiProvenance).toMatchObject({ editMode: "patch", sourceHashes: { "bungie-runner-shells": "sha-v2" } });
    expect(page?.bodyMarkdown).toContain("Rook");
    for (const line of V1) expect(page?.bodyMarkdown).toContain(line);
  });

  it("re-checks the page when a reader note is approved and labels the trigger", async () => {
    const page = await getPublishedWikiPageBySlug(tenantId, SLUG, db);
    const note = await createWikiCommunityNote({ tenantId, pageId: page!.id, bodyMarkdown: "The Rook shell is missing its prime ability.", actorId: "reader-1" }, db);
    const approved = await updateWikiCommunityNoteModerationStatus({ tenantId, noteId: note.id, status: "approved", actorId: "editor-1" }, db);
    const item = await enqueueReaderNoteRefresh({ tenantId, noteId: approved.id, pageId: approved.pageId, pageSlug: approved.pageSlug, pageTitle: approved.pageTitle, now: tick(3) }, db);
    const again = await enqueueReaderNoteRefresh({ tenantId, noteId: approved.id, pageId: approved.pageId, pageSlug: approved.pageSlug, pageTitle: approved.pageTitle, now: tick(3) }, db);
    expect(again.id).toBe(item.id);

    const call = createScriptedCall();
    const result = await processDueAiRefreshQueueItems({ now: tick(4), tenantId }, { db, call });
    const patchPrompt = call.calls.find((entry) => entry.step === "patch")?.prompt ?? "";
    expect(patchPrompt).toContain("reader notes (NOT sources)");
    expect(patchPrompt).toContain("missing its prime ability");
    expect(patchPrompt).toMatch(/^\[s1\] \(Overview\) /m);
    // The sources already say everything the page says, so the edit changes nothing and no revision is written.
    expect(result.processed.map((entry) => entry.outcome)).toEqual(["unchanged"]);
    expect((await getPublishedWikiPageBySlug(tenantId, SLUG, db))?.latestRevisionNumber).toBe(2);
  });

  /** The scripted model, except that the patch step returns the given edits (sentence ids looked up by text). */
  function editingCall(edits: (ids: Map<string, string>) => unknown[]): StructuredCall {
    const scripted = createScriptedCall();
    return (async (request) => {
      if (request.step !== "patch") return scripted(request);
      const ids = new Map([...request.prompt.matchAll(/^\[(s\d+)\] \([^)]+\) (.*?)(?: \(changed source\))?$/gm)].map(([, id, text]) => [text, id]));
      return { output: request.schema.parse({ edits: edits(ids) }), modelId: "scripted/edits", responseId: null };
    }) as StructuredCall;
  }

  it("revises one sentence and republishes every other sentence word for word", async () => {
    const renamed = "The runner shell Recon was called Blackbird during development.";
    const changes = await upsertRenderedSnapshots({ tenantId, snapshots: [shellsSnapshot([...V1, "Bungie added the runner shell Rook as a new runner shell option.", renamed], "sha-v3")] }, db);
    await enqueueSourceChangeRefreshes({ tenantId, changes, now: tick(5), specs: [] }, db);
    const before = await getPublishedWikiPageBySlug(tenantId, SLUG, db);
    const call = editingCall((ids) => [
      { op: "keep", sentenceId: ids.get(V1[0]), section: null, text: null, extractIds: [], patchRef: null, reason: "still right" },
      { op: "replace", sentenceId: ids.get(V1[2]), section: null, text: renamed, extractIds: ["bungie-runner-shells#1"], patchRef: null, reason: "source adds the codename" },
    ]);
    const result = await processDueAiRefreshQueueItems({ now: tick(6), tenantId }, { db, call });
    expect(result.failed.map((entry) => entry.error)).toEqual([]);
    expect(result.processed.map((entry) => entry.outcome)).toEqual(["published"]);
    const after = await getPublishedWikiPageBySlug(tenantId, SLUG, db);
    expect(after?.latestRevisionNumber).toBe(3);
    expect(after?.latestRevision?.changeNote).toBe("A cited source changed (bungie-runner-shells): 1 statement revised.");
    expect(after?.bodyMarkdown).toBe(before?.bodyMarkdown.replace(V1[2], renamed));
  });

  it("sends a revision that drops a supported statement with an unchanged source to Review", async () => {
    await enqueueAiRefreshQueueItem({ tenantId, targetSlug: SLUG, pageTitle: "Runner Shell Drill", reason: "manual_refresh", source: "manual", scheduledFor: tick(7), dedupeKey: `${runId}:drop` }, db);
    const call = editingCall((ids) => [{ op: "remove", sentenceId: ids.get(V1[1]), section: null, text: null, extractIds: [], patchRef: null, reason: "shorter" }]);
    const result = await processDueAiRefreshQueueItems({ now: tick(8), tenantId }, { db, call });
    expect(result.processed.map((entry) => entry.outcome)).toEqual(["needs_review"]);
    const item = await db.selectFrom("ai_refresh_queue_items").select(["metadata"]).where("dedupe_key", "=", `${runId}:drop`).executeTakeFirstOrThrow();
    expect((item.metadata as { gateReasons: string[] }).gateReasons).toEqual([`drops 1 supported statement whose sources did not change: "${V1[1]}"`]);
    expect((await getPublishedWikiPageBySlug(tenantId, SLUG, db))?.latestRevisionNumber).toBe(3);
  });

  it("publishes a removal an editor asked for, since the drop is intended", async () => {
    await enqueueAiRefreshQueueItem(
      { tenantId, targetSlug: SLUG, pageTitle: "Runner Shell Drill", reason: "manual_refresh", source: "manual", scheduledFor: tick(8), dedupeKey: `${runId}:trim`, metadata: { editorNote: "Remove the off-topic sentence." } },
      db,
    );
    const call = editingCall((ids) => [{ op: "remove", sentenceId: ids.get(V1[1]), section: null, text: null, extractIds: [], patchRef: null, reason: "off topic" }]);
    const result = await processDueAiRefreshQueueItems({ now: tick(8), tenantId }, { db, call });
    expect(result.processed.map((entry) => entry.outcome)).toEqual(["published"]);
    const after = await getPublishedWikiPageBySlug(tenantId, SLUG, db);
    expect(after?.latestRevisionNumber).toBe(4);
    expect(after?.bodyMarkdown).not.toContain(V1[1]);
    expect(after?.latestRevision?.changeNote).toBe("An editor asked for a re-check: 1 statement removed.");
  });

  it("files a revision under the gate threshold for review, and approving it keeps the provenance", async () => {
    const changes = await upsertRenderedSnapshots(
      { tenantId, snapshots: [shellsSnapshot([...V1, "Bungie added the runner shell Rook as a new runner shell option.", "The runner shell Recon was called Blackbird during development.", "Bungie lists the runner shell Thief as a covert acquisitions specialist."], "sha-v4")] },
      db,
    );
    await enqueueSourceChangeRefreshes({ tenantId, changes, now: tick(9), specs: [] }, db);
    const result = await processDueAiRefreshQueueItems(
      { now: tick(10), tenantId },
      { db, call: createScriptedCall(), policy: { ...DEFAULT_PUBLISH_POLICY, minSupportedClaims: 99 } },
    );
    expect(result.processed.map((entry) => entry.outcome)).toEqual(["needs_review"]);
    expect((await getPublishedWikiPageBySlug(tenantId, SLUG, db))?.latestRevisionNumber).toBe(4);
    const pending = await db.selectFrom("wiki_suggestions").select(["id", "status"]).where("tenant_id", "=", tenantId).where("status", "=", "pending").execute();
    expect(pending.map((row) => row.id)).toEqual([result.processed[0].suggestionId]);

    await approveWikiSuggestion({ tenantId, suggestionId: result.processed[0].suggestionId!, actorId: "editor-1" }, db);
    const approved = await getPublishedWikiPageBySlug(tenantId, SLUG, db);
    expect(approved?.latestRevisionNumber).toBe(5);
    expect(approved?.latestRevision?.aiProvenance?.refreshReason).toBe("source_update");
    // Thief, plus the sentence the editor trimmed above: the scripted model writes every line its source states.
    expect(approved?.latestRevision?.changeNote).toBe("A cited source changed (bungie-runner-shells): 2 statements added.");
  });

  it("publishes a held new page once it clears the gate, even when the editor changes nothing", async () => {
    const slug = `${SLUG}-held`;
    const enqueue = (key: string, minutes: number) =>
      enqueueAiRefreshQueueItem({ tenantId, targetSlug: slug, pageTitle: "Runner Shell Drill Held", reason: "manual_refresh", source: "manual", scheduledFor: tick(minutes), dedupeKey: `${runId}:${key}` }, db);
    await enqueue("held", 10.5);
    const held = await processDueAiRefreshQueueItems(
      { now: tick(10.6), tenantId },
      { db, call: createScriptedCall(), policy: { ...DEFAULT_PUBLISH_POLICY, minSupportedClaims: 99 } },
    );
    expect(held.processed.map((entry) => entry.outcome)).toEqual(["needs_review"]);
    expect(await getPublishedWikiPageBySlug(tenantId, slug, db)).toBeNull();

    await enqueue("release", 10.7);
    const released = await processDueAiRefreshQueueItems({ now: tick(10.8), tenantId }, { db, call: editingCall(() => []) });
    expect(released.processed.map((entry) => entry.outcome)).toEqual(["published"]);
    const page = await getPublishedWikiPageBySlug(tenantId, slug, db);
    expect(page?.latestRevisionNumber).toBe(1);
    expect(page?.latestRevision?.changeNote).toBe("Published the version held for review: it now clears the publish gate.");
    const pending = await db.selectFrom("wiki_suggestions").select(["id"]).where("tenant_id", "=", tenantId).where("target_slug", "=", slug).where("status", "=", "pending").execute();
    expect(pending).toEqual([]);
  });

  it("stops at the spend cap and returns claimed items to the queue untouched", async () => {
    await enqueueAiRefreshQueueItem({ tenantId, targetSlug: SLUG, pageTitle: "Runner Shell Drill", reason: "manual_refresh", source: "manual", scheduledFor: tick(11), dedupeKey: `${runId}:capped` }, db);
    const call = createGatewayCaller({
      ledger: new MemoryLedger(),
      capUsd: 0.01,
      generate: (() => {
        throw new Error("must not be called");
      }) as never,
    });
    const result = await processDueAiRefreshQueueItems({ now: tick(12), tenantId }, { db, call });
    expect(result.skipped).toMatch(/Spend cap/);
    const item = await db.selectFrom("ai_refresh_queue_items").select(["status", "attempts"]).where("dedupe_key", "=", `${runId}:capped`).executeTakeFirstOrThrow();
    expect(item).toEqual({ status: "queued", attempts: 0 });
  });

  it("claims nothing when there is no model credential", async () => {
    const result = await processDueAiRefreshQueueItems({ now: tick(13), tenantId }, { db, env: {} });
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
    expect(thinHub.reasons).toEqual(["hub page has 106 words of prose (need 150)"]);
    expect(evaluatePublishGate(solid, DEFAULT_PUBLISH_POLICY, { hub: true, words: 150 }).decision).toBe("publish");
    expect(evaluatePublishGate(solid, DEFAULT_PUBLISH_POLICY, { hub: false, words: 106 }).decision).toBe("publish");
  });

  it("treats child-page hubs and flagged topic hubs as hubs, and counts prose words only", () => {
    expect(isHubSpec({ hubChildren: ["recon"] })).toBe(true);
    expect(isHubSpec({ hubChildren: [], hub: true })).toBe(true);
    expect(isHubSpec({ hubChildren: [] })).toBe(false);
    const body =
      "## Overview\n\nThe Armory sells kits.{{cite:a}} It barters too.\n\n| Weapon | Ammo |\n| --- | --- |\n| KKV | Light |\n\n## Pages in this section\n\n- [[cyberacme|CyberAcme (CyAc)]]\n- [[mida|MIDA]]\n\n## See also\n\n- [Factions](/marathon/factions)";
    expect(countProseWords(body)).toBe(7);
  });

  it("counts a reworded statement as unchanged", () => {
    expect(
      describeChanges({
        previous: [{ claimText: "Rook is a scavenger frame that joins matches already in progress.", status: "supported" }],
        next: [{ claimText: "Rook is a scavenger frame that can join matches already in progress.", status: "supported" }],
        refreshReason: "manual_refresh",
      }),
    ).toBe("An editor asked for a re-check: no statements changed.");
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

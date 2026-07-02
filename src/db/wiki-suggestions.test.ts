import { afterAll, beforeAll, describe, expect, it } from "vitest";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI can provide DATABASE_URL directly.
}

import { getDb } from "./client";
import {
  approveWikiSuggestion,
  createWikiSuggestion,
  getPublishedWikiPageBySlug,
  getWikiSuggestionById,
  listWikiSuggestionsForReview,
  saveWikiPageWithRevision,
  updateWikiSuggestionReviewStatus,
} from "./wiki";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for wiki suggestion lifecycle tests.");
}

describe.sequential("wiki suggestion review lifecycle", () => {
  let db: ReturnType<typeof getDb>;
  const runId = `suggestion_test_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}`;
  const gameId = `${runId}_game`;
  const tenantId = `${runId}_tenant`;
  const tenantSlug = runId.replaceAll("_", "-");

  beforeAll(async () => {
    db = getDb();

    await db
      .insertInto("games")
      .values({
        id: gameId,
        slug: `${tenantSlug}-game`,
        title: "Suggestion Test Game",
        franchise: null,
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
        name: "Suggestion Test Wiki",
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

  it("stores a new-page suggestion and publishes it only after approval", async () => {
    const suggestion = await createWikiSuggestion({
      tenantId,
      suggestionType: "new_page",
      targetSlug: "Overrun AR",
      title: "Overrun AR",
      summary: "Automatic rifle suggestion",
      bodyMarkdown: "The Overrun AR is a proposed automatic rifle page.",
      sourceUrl: "https://example.com/overrun",
      actorId: "submitter-1",
      actorEmail: "submitter@example.com",
    });

    expect(suggestion.status).toBe("pending");
    expect(suggestion.targetSlug).toBe("overrun-ar");
    await expect(
      getPublishedWikiPageBySlug(tenantId, "overrun-ar"),
    ).resolves.toBeNull();

    await approveWikiSuggestion({
      tenantId,
      suggestionId: suggestion.id,
      actorId: "editor-1",
      reviewNote: "Looks good",
    });

    const page = await getPublishedWikiPageBySlug(tenantId, "overrun-ar");
    const reviewedSuggestion = await getWikiSuggestionById(tenantId, suggestion.id);

    expect(page).toMatchObject({
      slug: "overrun-ar",
      title: "Overrun AR",
      latestRevisionNumber: 1,
      status: "published",
    });
    expect(reviewedSuggestion).toMatchObject({
      status: "approved",
      reviewedBy: "editor-1",
      reviewNote: "Looks good",
    });
  });

  it("approves edit suggestions into normal page revisions without changing slug", async () => {
    const existingPage = await saveWikiPageWithRevision({
      tenantId,
      slug: "weapons",
      title: "Weapons",
      summary: "Initial weapons page",
      bodyMarkdown: "Initial weapons body content for Marathon.",
      status: "published",
      actorId: "seed-editor",
      changeNote: "Seed test page",
    });

    const suggestion = await createWikiSuggestion({
      tenantId,
      pageId: existingPage.id,
      suggestionType: "edit_page",
      targetSlug: "weapons",
      title: "Weapons",
      summary: "Updated weapons summary",
      bodyMarkdown: "Updated weapons body content with Overrun AR details.",
      actorId: "submitter-2",
    });

    await approveWikiSuggestion({
      tenantId,
      suggestionId: suggestion.id,
      actorId: "editor-2",
    });

    const page = await getPublishedWikiPageBySlug(tenantId, "weapons");
    const revisions = await db
      .selectFrom("wiki_page_revisions")
      .select(["revision_number", "created_by"])
      .where("tenant_id", "=", tenantId)
      .where("page_id", "=", existingPage.id)
      .orderBy("revision_number", "asc")
      .execute();

    expect(page).toMatchObject({
      slug: "weapons",
      summary: "Updated weapons summary",
      latestRevisionNumber: 2,
    });
    expect(revisions).toEqual([
      { revision_number: 1, created_by: "seed-editor" },
      { revision_number: 2, created_by: "editor-2" },
    ]);
  });

  it("rejects suggestions without publishing a page", async () => {
    const suggestion = await createWikiSuggestion({
      tenantId,
      suggestionType: "new_page",
      targetSlug: "Rejected Candidate",
      title: "Rejected Candidate",
      summary: null,
      bodyMarkdown: "This page should remain unpublished after rejection.",
      actorId: "submitter-3",
    });

    await updateWikiSuggestionReviewStatus({
      tenantId,
      suggestionId: suggestion.id,
      status: "rejected",
      actorId: "editor-3",
      reviewNote: "Not enough sourcing",
    });

    const page = await getPublishedWikiPageBySlug(tenantId, "rejected-candidate");
    const reviewedSuggestion = await getWikiSuggestionById(tenantId, suggestion.id);

    expect(page).toBeNull();
    expect(reviewedSuggestion).toMatchObject({
      status: "rejected",
      reviewedBy: "editor-3",
      reviewNote: "Not enough sourcing",
    });
  });

  it("tracks changes-requested suggestions in the review queue without publishing", async () => {
    const suggestion = await createWikiSuggestion({
      tenantId,
      suggestionType: "new_page",
      targetSlug: "Needs Work Candidate",
      title: "Needs Work Candidate",
      bodyMarkdown: "This page needs more editorial work before publication.",
      actorId: "submitter-4",
    });

    await updateWikiSuggestionReviewStatus({
      tenantId,
      suggestionId: suggestion.id,
      status: "changes_requested",
      actorId: "editor-4",
      reviewNote: "Please add source references",
    });

    const queue = await listWikiSuggestionsForReview(tenantId);

    expect(
      await getPublishedWikiPageBySlug(tenantId, "needs-work-candidate"),
    ).toBeNull();
    expect(queue.find((item) => item.id === suggestion.id)).toMatchObject({
      status: "changes_requested",
      reviewNote: "Please add source references",
    });
  });

  it("blocks unsafe approval paths", async () => {
    await saveWikiPageWithRevision({
      tenantId,
      slug: "existing-page",
      title: "Existing Page",
      bodyMarkdown: "Existing page body content for collision checks.",
      status: "published",
      actorId: "seed-editor",
    });

    const collision = await createWikiSuggestion({
      tenantId,
      suggestionType: "new_page",
      targetSlug: "existing-page",
      title: "Existing Page Collision",
      bodyMarkdown: "This should not overwrite the existing page.",
      actorId: "submitter-5",
    });

    const retarget = await createWikiSuggestion({
      tenantId,
      pageId: null,
      suggestionType: "edit_page",
      targetSlug: "retargeted-page",
      title: "Retargeted Page",
      bodyMarkdown: "This edit suggestion is missing an existing page target.",
      actorId: "submitter-6",
    });

    await expect(
      approveWikiSuggestion({
        tenantId,
        suggestionId: collision.id,
        actorId: "editor-5",
      }),
    ).rejects.toThrow("A page already exists");

    await expect(
      approveWikiSuggestion({
        tenantId,
        suggestionId: retarget.id,
        actorId: "editor-6",
      }),
    ).rejects.toThrow("Edit suggestions must target an existing page");

    await expect(getWikiSuggestionById(tenantId, collision.id)).resolves.toMatchObject({
      status: "pending",
    });
    await expect(getWikiSuggestionById(tenantId, retarget.id)).resolves.toMatchObject({
      status: "pending",
    });
  });
});

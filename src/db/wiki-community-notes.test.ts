import { afterAll, beforeAll, describe, expect, it } from "vitest";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI can provide DATABASE_URL directly.
}

import { getDb } from "./client";
import {
  createWikiCommunityNote,
  getPublishedWikiPageBySlug,
  listPublicWikiCommunityNotesForPage,
  listWikiCommunityNoteContextForPage,
  listWikiCommunityNotesForReview,
  saveWikiPageWithRevision,
  updateWikiCommunityNoteModerationStatus,
} from "./wiki";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for wiki community note tests.");
}

describe.sequential("wiki community note lifecycle", () => {
  let db: ReturnType<typeof getDb>;
  const runId = `community_note_test_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}`;
  const gameId = `${runId}_game`;
  const tenantId = `${runId}_tenant`;
  const tenantSlug = runId.replaceAll("_", "-");
  const otherGameId = `${runId}_other_game`;
  const otherTenantId = `${runId}_other_tenant`;
  const otherTenantSlug = `${tenantSlug}-other`;

  beforeAll(async () => {
    db = getDb();

    await db
      .insertInto("games")
      .values([
        {
          id: gameId,
          slug: `${tenantSlug}-game`,
          title: "Community Note Test Game",
          franchise: null,
          developer: null,
          publisher: null,
          release_date: null,
          metadata: null,
        },
        {
          id: otherGameId,
          slug: `${otherTenantSlug}-game`,
          title: "Other Community Note Test Game",
          franchise: null,
          developer: null,
          publisher: null,
          release_date: null,
          metadata: null,
        },
      ])
      .execute();

    await db
      .insertInto("tenants")
      .values([
        {
          id: tenantId,
          game_id: gameId,
          slug: tenantSlug,
          name: "Community Note Test Wiki",
          status: "active",
          primary_locale: "en",
        },
        {
          id: otherTenantId,
          game_id: otherGameId,
          slug: otherTenantSlug,
          name: "Other Community Note Test Wiki",
          status: "active",
          primary_locale: "en",
        },
      ])
      .execute();
  });

  afterAll(async () => {
    await db.deleteFrom("tenants").where("id", "in", [tenantId, otherTenantId]).execute();
    await db.deleteFrom("games").where("id", "in", [gameId, otherGameId]).execute();
    await db.destroy();
  });

  it("creates a pending note only for a page owned by the tenant", async () => {
    const page = await createPage("pending-note-target", "Pending Note Target");
    const otherPage = await saveWikiPageWithRevision(
      {
        tenantId: otherTenantId,
        slug: "other-tenant-page",
        title: "Other Tenant Page",
        bodyMarkdown: "A published page in another tenant.",
        status: "published",
        actorId: "seed-editor",
      },
      db,
    );

    const note = await createWikiCommunityNote(
      {
        tenantId,
        pageId: page.id,
        noteType: "correction",
        bodyMarkdown: "The page should mention the Cryo Archive timing.",
        sourceUrl: "https://example.com/cryo-archive",
        targetQuote: "Original page quote",
        metadata: { origin: "human" },
        actorId: "submitter-1",
        actorEmail: "submitter@example.com",
      },
      db,
    );

    expect(note).toMatchObject({
      tenantId,
      tenantSlug,
      pageId: page.id,
      pageSlug: "pending-note-target",
      status: "pending",
      noteType: "correction",
      bodyMarkdown: "The page should mention the Cryo Archive timing.",
      sourceUrl: "https://example.com/cryo-archive",
      targetQuote: "Original page quote",
      createdBy: "submitter-1",
      metadata: {
        origin: "human",
        createdByEmail: "submitter@example.com",
      },
    });

    await expect(
      createWikiCommunityNote(
        {
          tenantId,
          pageId: otherPage.id,
          bodyMarkdown: "This note targets a page from another tenant.",
          actorId: "submitter-2",
        },
        db,
      ),
    ).rejects.toThrow("same tenant");
  });

  it("updates approved, rejected, and incorporated moderation states without mutating canonical pages", async () => {
    const page = await createPage(
      "moderation-target",
      "Moderation Target",
      "Canonical body before community review.",
    );
    const before = await getPublishedWikiPageBySlug(tenantId, page.slug, db);
    const approveCandidate = await createTestNote(page.id, "Approved note body");
    const rejectCandidate = await createTestNote(page.id, "Rejected note body");
    const incorporateCandidate = await createTestNote(
      page.id,
      "Incorporated note body",
    );

    const approved = await updateWikiCommunityNoteModerationStatus(
      {
        tenantId,
        noteId: approveCandidate.id,
        status: "approved",
        actorId: "editor-1",
        reviewNote: "Useful correction",
      },
      db,
    );
    const rejected = await updateWikiCommunityNoteModerationStatus(
      {
        tenantId,
        noteId: rejectCandidate.id,
        status: "rejected",
        actorId: "editor-2",
        reviewNote: "Unsupported",
      },
      db,
    );
    await updateWikiCommunityNoteModerationStatus(
      {
        tenantId,
        noteId: incorporateCandidate.id,
        status: "approved",
        actorId: "editor-3",
      },
      db,
    );
    const incorporated = await updateWikiCommunityNoteModerationStatus(
      {
        tenantId,
        noteId: incorporateCandidate.id,
        status: "incorporated",
        actorId: "editor-4",
        reviewNote: "Fed into AI refresh context",
      },
      db,
    );

    const after = await getPublishedWikiPageBySlug(tenantId, page.slug, db);
    const reviewQueue = await listWikiCommunityNotesForReview(tenantId, db);

    expect(approved).toMatchObject({
      status: "approved",
      reviewedBy: "editor-1",
      reviewNote: "Useful correction",
    });
    expect(rejected).toMatchObject({
      status: "rejected",
      reviewedBy: "editor-2",
      reviewNote: "Unsupported",
    });
    expect(incorporated).toMatchObject({
      status: "incorporated",
      reviewedBy: "editor-4",
      reviewNote: "Fed into AI refresh context",
    });
    expect(after).toMatchObject({
      bodyMarkdown: before?.bodyMarkdown,
      latestRevisionNumber: before?.latestRevisionNumber,
    });
    expect(reviewQueue.find((item) => item.id === incorporated.id)).toMatchObject({
      status: "incorporated",
      pageSlug: "moderation-target",
    });
  });

  it("lists only approved and incorporated notes for public page rendering", async () => {
    const page = await createPage("public-note-target", "Public Note Target");
    const pending = await createTestNote(page.id, "Pending note hidden from public");
    const approved = await createTestNote(page.id, "Approved note visible publicly");
    const rejected = await createTestNote(page.id, "Rejected note hidden from public");
    const incorporated = await createTestNote(
      page.id,
      "Incorporated note visible publicly",
    );

    await updateWikiCommunityNoteModerationStatus(
      {
        tenantId,
        noteId: approved.id,
        status: "approved",
        actorId: "editor-5",
      },
      db,
    );
    await updateWikiCommunityNoteModerationStatus(
      {
        tenantId,
        noteId: rejected.id,
        status: "rejected",
        actorId: "editor-6",
      },
      db,
    );
    await updateWikiCommunityNoteModerationStatus(
      {
        tenantId,
        noteId: incorporated.id,
        status: "incorporated",
        actorId: "editor-7",
      },
      db,
    );

    const publicNotes = await listPublicWikiCommunityNotesForPage(
      { tenantId, pageId: page.id },
      db,
    );
    const publicNoteIds = new Set(publicNotes.map((note) => note.id));

    expect(publicNoteIds.has(approved.id)).toBe(true);
    expect(publicNoteIds.has(incorporated.id)).toBe(true);
    expect(publicNoteIds.has(pending.id)).toBe(false);
    expect(publicNoteIds.has(rejected.id)).toBe(false);
    expect(new Set(publicNotes.map((note) => note.status))).toEqual(
      new Set(["approved", "incorporated"]),
    );
  });

  it("returns approved and incorporated notes as canonical AI refresh context", async () => {
    const page = await createPage("ai-context-target", "AI Context Target");
    const approved = await createWikiCommunityNote(
      {
        tenantId,
        pageId: page.id,
        noteType: "source",
        bodyMarkdown: "Approved context says the event unlock depends on factions.",
        sourceUrl: "https://example.com/faction-source",
        targetQuote: "Faction requirement quote",
        actorId: "submitter-8",
      },
      db,
    );
    const incorporated = await createTestNote(
      page.id,
      "Incorporated context says the puzzle state changed after review.",
    );
    await createTestNote(page.id, "Pending context should not be included.");

    await updateWikiCommunityNoteModerationStatus(
      {
        tenantId,
        noteId: approved.id,
        status: "approved",
        actorId: "editor-8",
        reviewNote: "Source checks out",
      },
      db,
    );
    await updateWikiCommunityNoteModerationStatus(
      {
        tenantId,
        noteId: incorporated.id,
        status: "incorporated",
        actorId: "editor-9",
      },
      db,
    );

    const context = await listWikiCommunityNoteContextForPage(
      { tenantId, pageId: page.id },
      db,
    );
    const contextById = new Map(context.map((source) => [source.id, source]));
    const slugContext = await listWikiCommunityNoteContextForPage(
      { tenantId, targetSlug: page.slug },
      db,
    );

    expect(context).toHaveLength(2);
    expect(slugContext.map((source) => source.id).sort()).toEqual(
      context.map((source) => source.id).sort(),
    );
    expect(contextById.get(approved.id)).toMatchObject({
      sourceKey: "ai-context-target",
      sourceType: "community_note",
      url: "https://example.com/faction-source",
      publisher: "Community note",
      topicSlugs: ["ai-context-target"],
      metadata: expect.objectContaining({
        origin: "community_note",
        communityNoteStatus: "approved",
        noteType: "source",
        authorityTier: "community",
        authorityScore: 35,
      }),
    });
    expect(contextById.get(approved.id)?.contextText).toContain(
      "Faction requirement quote",
    );
    expect(contextById.get(approved.id)?.contextText).toContain(
      "Approved context says the event unlock depends on factions.",
    );
    expect(contextById.get(incorporated.id)?.metadata).toMatchObject({
      communityNoteStatus: "incorporated",
      authorityScore: 45,
    });
  });

  async function createPage(
    slug: string,
    title: string,
    bodyMarkdown = `Canonical body for ${title}.`,
  ) {
    return saveWikiPageWithRevision(
      {
        tenantId,
        slug,
        title,
        bodyMarkdown,
        status: "published",
        actorId: "seed-editor",
      },
      db,
    );
  }

  async function createTestNote(pageId: string, bodyMarkdown: string) {
    return createWikiCommunityNote(
      {
        tenantId,
        pageId,
        bodyMarkdown,
        actorId: "submitter",
      },
      db,
    );
  }
});

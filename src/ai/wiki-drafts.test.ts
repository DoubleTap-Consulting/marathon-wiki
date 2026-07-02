import { afterAll, beforeAll, describe, expect, it } from "vitest";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI can provide DATABASE_URL directly.
}

import { AI_GATEWAY_WIKI_PROMPT_VERSION } from "./gateway";
import { createAiAssistedWikiSuggestion } from "./wiki-drafts";
import type { WikiActor } from "@/src/auth/wiki-auth";
import { getDb } from "@/src/db/client";
import {
  approveWikiSuggestion,
  getPublishedWikiPageBySlug,
  getWikiSuggestionById,
  saveWikiPageWithRevision,
  type WikiTenant,
} from "@/src/db/wiki";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for AI wiki draft tests.");
}

describe.sequential("AI-assisted wiki draft suggestions", () => {
  let db: ReturnType<typeof getDb>;
  const runId = `ai_draft_test_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}`;
  const gameId = `${runId}_game`;
  const tenantId = `${runId}_tenant`;
  const tenantSlug = runId.replaceAll("_", "-");
  const tenant: WikiTenant = {
    id: tenantId,
    slug: tenantSlug,
    name: "AI Draft Test Wiki",
    gameSlug: `${tenantSlug}-game`,
    gameTitle: "Marathon",
  };
  const actor: WikiActor = {
    id: "editor-ai-1",
    email: "editor-ai@example.com",
    name: "Editor AI",
    provider: "dev",
  };

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

  it("stores AI Gateway output as a pending suggestion with provenance before approval", async () => {
    const suggestion = await createAiAssistedWikiSuggestion(
      {
        tenant,
        actor,
        pageTitle: "Overrun AR",
        targetSlug: "Overrun AR",
        sourceNotes: "Official weapon notes should be checked by editors.",
      },
      {
        db,
        generateDraft: async () => ({
          title: "Overrun AR",
          summary: "AI-assisted draft for a Marathon automatic rifle.",
          bodyMarkdown:
            "## Overview\n\nThe Overrun AR is an AI-assisted draft that editors must verify before publishing.",
          provider: "vercel-ai-gateway",
          model: "xai/grok-test",
          responseId: "gateway_resp_ai_new_page",
          promptVersion: AI_GATEWAY_WIKI_PROMPT_VERSION,
        }),
      },
    );

    expect(suggestion).toMatchObject({
      status: "pending",
      suggestionType: "new_page",
      targetSlug: "overrun-ar",
      createdBy: actor.id,
      metadata: {
        origin: "ai_generated",
        createdByEmail: actor.email,
        ai: expect.objectContaining({
          provider: "vercel-ai-gateway",
          model: "xai/grok-test",
          responseId: "gateway_resp_ai_new_page",
          promptVersion: AI_GATEWAY_WIKI_PROMPT_VERSION,
          requestedBy: actor.id,
          sourceNotes: "Official weapon notes should be checked by editors.",
        }),
      },
    });
    await expect(
      getPublishedWikiPageBySlug(tenantId, "overrun-ar", db),
    ).resolves.toBeNull();

    await approveWikiSuggestion({
      tenantId,
      suggestionId: suggestion.id,
      actorId: "review-editor",
      reviewNote: "Approved AI draft after human review",
    }, db);

    const page = await getPublishedWikiPageBySlug(tenantId, "overrun-ar", db);
    const reviewed = await getWikiSuggestionById(tenantId, suggestion.id, db);

    expect(page).toMatchObject({
      slug: "overrun-ar",
      title: "Overrun AR",
      status: "published",
      latestRevisionNumber: 1,
    });
    expect(reviewed).toMatchObject({
      status: "approved",
      reviewedBy: "review-editor",
    });
  });

  it("approves AI-assisted edits through the normal revision path", async () => {
    const page = await saveWikiPageWithRevision({
      tenantId,
      slug: "weapons",
      title: "Weapons",
      summary: "Initial weapons summary",
      bodyMarkdown: "## Weapons\n\nInitial weapons body.",
      status: "published",
      actorId: "seed-editor",
    }, db);

    const suggestion = await createAiAssistedWikiSuggestion(
      {
        tenant,
        actor,
        pageTitle: "Weapons",
        targetSlug: "weapons",
      },
      {
        db,
        generateDraft: async (request) => {
          expect(request.existingPage?.title).toBe("Weapons");

          return {
            title: "Weapons",
            summary: "AI-assisted weapon coverage.",
            bodyMarkdown:
              "## Weapons\n\nAI-assisted edits add Marathon weapon coverage for human review.",
            provider: "vercel-ai-gateway",
            model: "xai/grok-test",
            responseId: "gateway_resp_ai_edit_page",
            promptVersion: AI_GATEWAY_WIKI_PROMPT_VERSION,
          };
        },
      },
    );

    expect(suggestion).toMatchObject({
      suggestionType: "edit_page",
      pageId: page.id,
      targetSlug: "weapons",
    });

    await approveWikiSuggestion({
      tenantId,
      suggestionId: suggestion.id,
      actorId: "review-editor",
    }, db);

    const updated = await getPublishedWikiPageBySlug(tenantId, "weapons", db);
    const revisions = await db
      .selectFrom("wiki_page_revisions")
      .select(["revision_number", "created_by"])
      .where("tenant_id", "=", tenantId)
      .where("page_id", "=", page.id)
      .orderBy("revision_number", "asc")
      .execute();

    expect(updated).toMatchObject({
      slug: "weapons",
      summary: "AI-assisted weapon coverage.",
      latestRevisionNumber: 2,
    });
    expect(revisions).toEqual([
      { revision_number: 1, created_by: "seed-editor" },
      { revision_number: 2, created_by: "review-editor" },
    ]);
  });

  it("reports missing AI Gateway config without breaking public wiki reads", async () => {
    await saveWikiPageWithRevision({
      tenantId,
      slug: "public-read-stays-up",
      title: "Public Read Stays Up",
      bodyMarkdown: "This page proves public reads do not depend on AI Gateway config.",
      status: "published",
      actorId: "seed-editor",
    }, db);

    await expect(
      createAiAssistedWikiSuggestion(
        {
          tenant,
          actor,
          pageTitle: "Missing Config Candidate",
          targetSlug: "missing-config-candidate",
        },
        { db, env: {} },
      ),
    ).rejects.toThrow("AI Gateway is not configured");

    await expect(
      getPublishedWikiPageBySlug(tenantId, "public-read-stays-up", db),
    ).resolves.toMatchObject({
      slug: "public-read-stays-up",
      title: "Public Read Stays Up",
    });
    await expect(
      getPublishedWikiPageBySlug(tenantId, "missing-config-candidate", db),
    ).resolves.toBeNull();
  });
});

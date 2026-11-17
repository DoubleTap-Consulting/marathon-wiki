import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/auth/wiki-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/auth/wiki-auth")>();
  return {
    ...actual,
    getCurrentWikiActor: vi.fn(),
    requireConfiguredAuth: vi.fn(),
  };
});

vi.mock("@/src/db/wiki", () => ({
  approveWikiSuggestion: vi.fn(),
  getWikiTenantBySlug: vi.fn(),
  updateWikiSuggestionReviewStatus: vi.fn(),
  updateWikiCommunityNoteModerationStatus: vi.fn(),
  getPublishedWikiPageBySlug: vi.fn(),
}));

vi.mock("@/src/wiki/cache", () => ({
  revalidateWikiPage: vi.fn(),
}));

vi.mock("@/src/content/editor-triggers", () => ({
  enqueueReaderNoteRefresh: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/src/ai/wiki-refresh-queue", () => ({
  enqueueAiRefreshQueueItem: vi.fn(),
}));

vi.mock("@/src/ai/wiki-drafts", () => ({
  createAiAssistedWikiSuggestion: vi.fn(),
}));

import { getCurrentWikiActor, requireConfiguredAuth } from "@/src/auth/wiki-auth";
import {
  approveWikiSuggestion,
  getWikiTenantBySlug,
  updateWikiCommunityNoteModerationStatus,
  updateWikiSuggestionReviewStatus,
} from "@/src/db/wiki";
import { enqueueReaderNoteRefresh } from "@/src/content/editor-triggers";
import { enqueueAiRefreshQueueItem } from "@/src/ai/wiki-refresh-queue";
import { createAiAssistedWikiSuggestion } from "@/src/ai/wiki-drafts";
import {
  reviewWikiCommunityNoteAction,
  reviewWikiSuggestionAction,
} from "./actions";
import {
  generateAiWikiSuggestionAction,
  queueAiRewriteAction,
} from "./ai-actions";

const getActor = vi.mocked(getCurrentWikiActor);
const requireAuth = vi.mocked(requireConfiguredAuth);
const tenantBySlug = vi.mocked(getWikiTenantBySlug);
const approve = vi.mocked(approveWikiSuggestion);
const rejectSuggestion = vi.mocked(updateWikiSuggestionReviewStatus);
const moderateNote = vi.mocked(updateWikiCommunityNoteModerationStatus);
const enqueueNote = vi.mocked(enqueueReaderNoteRefresh);
const enqueueRewrite = vi.mocked(enqueueAiRefreshQueueItem);
const createDraft = vi.mocked(createAiAssistedWikiSuggestion);

const suggester = {
  id: "user_suggester",
  email: "reader@example.com",
  name: "Reader",
  provider: "clerk" as const,
};

const editor = {
  id: "user_editor",
  email: "editor@example.com",
  name: "Editor",
  provider: "clerk" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireAuth.mockReturnValue(undefined);
  tenantBySlug.mockResolvedValue({ id: "tenant-1", slug: "marathon" } as never);
  process.env.WIKI_EDITOR_EMAILS = "editor@example.com";
  process.env.WIKI_EDITOR_USER_IDS = "";
  process.env.WIKI_DEV_AUTH_ROLE = "";
});

describe("review action permission gates", () => {
  it("does not approve or change a suggestion when the signed-in user is not allowlisted", async () => {
    getActor.mockResolvedValue(suggester);
    const formData = new FormData();
    formData.set("suggestionId", "sug_1");
    formData.set("reviewAction", "approve");

    await expect(reviewWikiSuggestionAction("marathon", formData)).rejects.toThrow(
      /permission to review/,
    );

    formData.set("reviewAction", "rejected");
    await expect(reviewWikiSuggestionAction("marathon", formData)).rejects.toThrow(
      /permission to review/,
    );

    expect(approve).not.toHaveBeenCalled();
    expect(rejectSuggestion).not.toHaveBeenCalled();
    expect(tenantBySlug).not.toHaveBeenCalled();
  });

  it("does not moderate a community note when the signed-in user is not allowlisted", async () => {
    getActor.mockResolvedValue(suggester);
    const formData = new FormData();
    formData.set("noteId", "note_1");
    formData.set("reviewAction", "approved");

    await expect(reviewWikiCommunityNoteAction("marathon", formData)).rejects.toThrow(
      /permission to review/,
    );

    expect(moderateNote).not.toHaveBeenCalled();
    expect(enqueueNote).not.toHaveBeenCalled();
  });

  it("refuses AI rewrite and draft actions for a signed-in non-editor", async () => {
    getActor.mockResolvedValue(suggester);
    const formData = new FormData();
    formData.set("pageTitle", "Ranked");
    formData.set("targetSlug", "ranked");

    await expect(queueAiRewriteAction("marathon", { ok: false, message: null }, formData)).resolves.toEqual({
      ok: false,
      message: "Editor access is required to queue AI rewrites.",
    });
    await expect(
      generateAiWikiSuggestionAction("marathon", { ok: false, message: null }, formData),
    ).resolves.toEqual({
      ok: false,
      message: "Editor access is required to request AI-assisted drafts.",
    });

    expect(enqueueRewrite).not.toHaveBeenCalled();
    expect(createDraft).not.toHaveBeenCalled();
  });

  it("allows an allowlisted editor through the suggestion approval gate", async () => {
    getActor.mockResolvedValue(editor);
    approve.mockResolvedValue({ pageSlug: "ranked" } as never);
    const formData = new FormData();
    formData.set("suggestionId", "sug_1");
    formData.set("reviewAction", "approve");

    await reviewWikiSuggestionAction("marathon", formData);

    expect(approve).toHaveBeenCalledOnce();
    expect(approve).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "user_editor", suggestionId: "sug_1" }),
    );
  });
});

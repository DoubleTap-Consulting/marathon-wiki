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
  getWikiTenantBySlug: vi.fn(),
  getPublishedWikiPageBySlug: vi.fn(),
  createWikiSuggestion: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { getCurrentWikiActor, requireConfiguredAuth } from "@/src/auth/wiki-auth";
import {
  createWikiSuggestion,
  getPublishedWikiPageBySlug,
  getWikiTenantBySlug,
} from "@/src/db/wiki";
import { submitWikiSuggestion } from "./actions";

const getActor = vi.mocked(getCurrentWikiActor);
const requireAuth = vi.mocked(requireConfiguredAuth);
const tenantBySlug = vi.mocked(getWikiTenantBySlug);
const pageBySlug = vi.mocked(getPublishedWikiPageBySlug);
const createSuggestion = vi.mocked(createWikiSuggestion);

const suggester = {
  id: "user_suggester",
  email: "reader@example.com",
  name: "Reader",
  provider: "clerk" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireAuth.mockReturnValue(undefined);
  getActor.mockResolvedValue(suggester);
  tenantBySlug.mockResolvedValue({ id: "tenant-1", slug: "marathon" } as never);
  pageBySlug.mockResolvedValue(null);
  createSuggestion.mockResolvedValue({ id: "sug_1" } as never);
  process.env.WIKI_EDITOR_EMAILS = "editor@example.com";
});

describe("suggestion submission permissions", () => {
  it("lets a signed-in user who is not on the editor allowlist create a suggestion", async () => {
    const formData = new FormData();
    formData.set("suggestionType", "new_page");
    formData.set("title", "Cryo Archive");
    formData.set("targetSlug", "cryo-archive");
    formData.set(
      "bodyMarkdown",
      "The cryo archive is a documented location in the game world.",
    );

    await expect(submitWikiSuggestion("marathon", null, { ok: false, message: null }, formData)).resolves.toEqual({
      ok: true,
      message: "Suggestion submitted for editorial review.",
    });

    expect(createSuggestion).toHaveBeenCalledOnce();
    expect(createSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "user_suggester",
        actorEmail: "reader@example.com",
        suggestionType: "new_page",
        targetSlug: "cryo-archive",
      }),
    );
  });

  it("does not accept a suggestion from a signed-out visitor", async () => {
    getActor.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("suggestionType", "new_page");
    formData.set("title", "Cryo Archive");
    formData.set("targetSlug", "cryo-archive");
    formData.set("bodyMarkdown", "The cryo archive is a documented location.");

    await expect(submitWikiSuggestion("marathon", null, { ok: false, message: null }, formData)).resolves.toEqual({
      ok: false,
      message: "Sign in before submitting a suggestion.",
    });
    expect(createSuggestion).not.toHaveBeenCalled();
  });
});

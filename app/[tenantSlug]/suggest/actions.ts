"use server";

import { revalidatePath } from "next/cache";

import {
  createWikiSuggestion,
  getPublishedWikiPageBySlug,
  getWikiTenantBySlug,
  type WikiSuggestionType,
} from "@/src/db/wiki";
import {
  getCurrentWikiActor,
  requireConfiguredAuth,
} from "@/src/auth/wiki-auth";
import {
  normalizeTenantSlug,
  normalizeWikiSlug,
} from "@/src/wiki/tenant-routing";

export type SuggestionFormState = {
  ok: boolean;
  message: string | null;
};

export async function submitWikiSuggestion(
  tenantSlug: string,
  pageSlug: string | null,
  _state: SuggestionFormState,
  formData: FormData,
): Promise<SuggestionFormState> {
  try {
    requireConfiguredAuth();

    const actor = await getCurrentWikiActor();

    if (!actor) {
      return {
        ok: false,
        message: "Sign in before submitting a suggestion.",
      };
    }

    const tenant = await getWikiTenantBySlug(normalizeTenantSlug(tenantSlug));

    if (!tenant) {
      return {
        ok: false,
        message: "This wiki tenant could not be found.",
      };
    }

    const suggestionType = getString(formData, "suggestionType");
    const title = getString(formData, "title");
    const summary = getString(formData, "summary") || null;
    const bodyMarkdown = getString(formData, "bodyMarkdown");
    const sourceUrl = getString(formData, "sourceUrl") || null;

    if (suggestionType !== "new_page" && suggestionType !== "edit_page") {
      return { ok: false, message: "Choose a valid suggestion type." };
    }

    if (title.length < 3) {
      return { ok: false, message: "Title must be at least 3 characters." };
    }

    if (bodyMarkdown.length < 20) {
      return {
        ok: false,
        message: "Body must include at least 20 characters of proposed content.",
      };
    }

    if (sourceUrl && !isValidUrl(sourceUrl)) {
      return { ok: false, message: "Source URL must be a valid URL." };
    }

    const page = pageSlug
      ? await getPublishedWikiPageBySlug(
          tenant.id,
          normalizeWikiSlug(pageSlug),
        )
      : null;

    if (pageSlug && !page) {
      return {
        ok: false,
        message: "The page you are editing could not be found.",
      };
    }

    const targetSlug = page
      ? page.slug
      : normalizeWikiSlug(getString(formData, "targetSlug"));

    if (!targetSlug) {
      return { ok: false, message: "Page slug is required." };
    }

    if (!page) {
      const existingPage = await getPublishedWikiPageBySlug(tenant.id, targetSlug);

      if (existingPage) {
        return {
          ok: false,
          message: "A published page already uses that slug. Suggest an edit instead.",
        };
      }
    }

    await createWikiSuggestion({
      tenantId: tenant.id,
      pageId: page?.id ?? null,
      suggestionType: suggestionType as WikiSuggestionType,
      targetSlug,
      title,
      summary,
      bodyMarkdown,
      sourceUrl,
      actorId: actor.id,
      actorEmail: actor.email,
    });

    revalidatePath(`/${tenant.slug}/review`);

    return {
      ok: true,
      message: "Suggestion submitted for editorial review.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Suggestion could not be submitted.",
    };
  }
}

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function isValidUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

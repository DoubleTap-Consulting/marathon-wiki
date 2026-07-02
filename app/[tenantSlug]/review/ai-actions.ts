"use server";

import { revalidatePath } from "next/cache";

import {
  canReviewSuggestions,
  getCurrentWikiActor,
  requireConfiguredAuth,
} from "@/src/auth/wiki-auth";
import { createAiAssistedWikiSuggestion } from "@/src/ai/wiki-drafts";
import { getWikiTenantBySlug } from "@/src/db/wiki";
import { normalizeTenantSlug, normalizeWikiSlug } from "@/src/wiki/tenant-routing";

export type AiDraftFormState = {
  ok: boolean;
  message: string | null;
  suggestionId?: string;
};

export async function generateAiWikiSuggestionAction(
  tenantSlug: string,
  _state: AiDraftFormState,
  formData: FormData,
): Promise<AiDraftFormState> {
  try {
    requireConfiguredAuth();

    const actor = await getCurrentWikiActor();

    if (!actor || !canReviewSuggestions(actor)) {
      return {
        ok: false,
        message: "Editor access is required to request AI-assisted drafts.",
      };
    }

    const tenant = await getWikiTenantBySlug(normalizeTenantSlug(tenantSlug));

    if (!tenant) {
      return { ok: false, message: "This wiki tenant could not be found." };
    }

    const pageTitle = getString(formData, "pageTitle");
    const targetSlug = normalizeWikiSlug(getString(formData, "targetSlug"));
    const sourceNotes = getString(formData, "sourceNotes") || null;

    const suggestion = await createAiAssistedWikiSuggestion({
      tenant,
      actor,
      pageTitle,
      targetSlug,
      sourceNotes,
    });

    revalidatePath(`/${tenant.slug}/review`);

    return {
      ok: true,
      message: "AI draft generated and stored as a pending suggestion.",
      suggestionId: suggestion.id,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "AI draft could not be generated.",
    };
  }
}

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

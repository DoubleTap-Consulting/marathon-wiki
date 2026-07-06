"use server";

import { revalidatePath } from "next/cache";

import {
  canReviewSuggestions,
  getCurrentWikiActor,
  requireConfiguredAuth,
} from "@/src/auth/wiki-auth";
import { generateAiCanonicalWikiPageRevision } from "@/src/ai/wiki-canonical";
import { createAiAssistedWikiSuggestion } from "@/src/ai/wiki-drafts";
import { getWikiTenantBySlug } from "@/src/db/wiki";
import { revalidateWikiPage } from "@/src/wiki/cache";
import { normalizeTenantSlug, normalizeWikiSlug } from "@/src/wiki/tenant-routing";

export type AiDraftFormState = {
  ok: boolean;
  message: string | null;
  suggestionId?: string;
};

export type AiCanonicalFormState = {
  ok: boolean;
  message: string | null;
  pageSlug?: string;
};

export async function generateAiCanonicalPageAction(
  tenantSlug: string,
  _state: AiCanonicalFormState,
  formData: FormData,
): Promise<AiCanonicalFormState> {
  try {
    requireConfiguredAuth();

    const actor = await getCurrentWikiActor();

    if (!actor || !canReviewSuggestions(actor)) {
      return {
        ok: false,
        message: "Editor access is required to generate canonical pages.",
      };
    }

    const tenant = await getWikiTenantBySlug(normalizeTenantSlug(tenantSlug));

    if (!tenant) {
      return { ok: false, message: "This wiki tenant could not be found." };
    }

    const pageTitle = getString(formData, "pageTitle");
    const targetSlug = normalizeWikiSlug(getString(formData, "targetSlug"));
    const sourceContext = getString(formData, "sourceContext") || null;
    const refreshReason = getString(formData, "refreshReason") || null;

    const result = await generateAiCanonicalWikiPageRevision({
      tenant,
      actor,
      pageTitle,
      targetSlug,
      sourceContext,
      refreshReason,
    });

    await revalidateWikiPage(tenant.slug, result.page.slug);
    revalidatePath(`/${tenant.slug}`);
    revalidatePath(`/${tenant.slug}/pages`);
    revalidatePath(`/${tenant.slug}/${result.page.slug}`);
    revalidatePath(`/${tenant.slug}/review`);

    return {
      ok: true,
      message: "AI canonical revision published.",
      pageSlug: result.page.slug,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "AI canonical page could not be generated.",
    };
  }
}

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

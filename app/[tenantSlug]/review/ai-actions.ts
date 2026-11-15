"use server";

import { revalidatePath } from "next/cache";

import {
  canReviewSuggestions,
  getCurrentWikiActor,
  requireConfiguredAuth,
} from "@/src/auth/wiki-auth";
import { enqueueAiRefreshQueueItem } from "@/src/ai/wiki-refresh-queue";
import { createAiAssistedWikiSuggestion } from "@/src/ai/wiki-drafts";
import { getPublishedWikiPageBySlug, getWikiTenantBySlug } from "@/src/db/wiki";
import { normalizeTenantSlug, normalizeWikiSlug } from "@/src/wiki/tenant-routing";

export type AiDraftFormState = {
  ok: boolean;
  message: string | null;
  suggestionId?: string;
};

export type AiRewriteFormState = {
  ok: boolean;
  message: string | null;
  pageSlug?: string;
};

/**
 * Queues an AI editor rewrite instead of calling a model during the request. The refresh worker
 * regenerates the page from stored source snapshots, and the publish gate decides whether it
 * goes live or comes back here for review.
 */
export async function queueAiRewriteAction(
  tenantSlug: string,
  _state: AiRewriteFormState,
  formData: FormData,
): Promise<AiRewriteFormState> {
  try {
    requireConfiguredAuth();

    const actor = await getCurrentWikiActor();

    if (!actor || !canReviewSuggestions(actor)) {
      return { ok: false, message: "Editor access is required to queue AI rewrites." };
    }

    const tenant = await getWikiTenantBySlug(normalizeTenantSlug(tenantSlug));

    if (!tenant) {
      return { ok: false, message: "This wiki tenant could not be found." };
    }

    const pageTitle = getString(formData, "pageTitle");
    const targetSlug = normalizeWikiSlug(getString(formData, "targetSlug"));

    if (pageTitle.length < 3 || !targetSlug) {
      return { ok: false, message: "Enter a page title (3+ characters) and a slug." };
    }

    const existing = await getPublishedWikiPageBySlug(tenant.id, targetSlug);
    const item = await enqueueAiRefreshQueueItem({
      tenantId: tenant.id,
      pageId: existing?.id ?? null,
      targetSlug,
      pageTitle,
      reason: existing ? "manual_refresh" : "new_page",
      source: "review_queue_button",
      scheduledFor: new Date(),
      metadata: { requestedBy: actor.id },
    });

    revalidatePath(`/${tenant.slug}/review`);

    return {
      ok: true,
      message:
        item.status === "queued"
          ? `Queued an AI ${existing ? "rewrite" : "first draft"} of ${targetSlug}. It is published if it passes the claim check, otherwise it appears here for review.`
          : `A rewrite of ${targetSlug} is already ${item.status}.`,
      pageSlug: existing ? targetSlug : undefined,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "The rewrite could not be queued.",
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

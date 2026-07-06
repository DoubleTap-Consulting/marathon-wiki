"use server";

import { revalidatePath } from "next/cache";

import {
  approveWikiSuggestion,
  getWikiTenantBySlug,
  updateWikiCommunityNoteModerationStatus,
  updateWikiSuggestionReviewStatus,
} from "@/src/db/wiki";
import {
  canReviewSuggestions,
  getCurrentWikiActor,
  requireConfiguredAuth,
} from "@/src/auth/wiki-auth";
import { revalidateWikiPage } from "@/src/wiki/cache";
import { normalizeTenantSlug } from "@/src/wiki/tenant-routing";

export async function reviewWikiSuggestionAction(
  tenantSlug: string,
  formData: FormData,
) {
  requireConfiguredAuth();

  const actor = await getCurrentWikiActor();

  if (!actor || !canReviewSuggestions(actor)) {
    throw new Error("You do not have permission to review suggestions.");
  }

  const tenant = await getWikiTenantBySlug(normalizeTenantSlug(tenantSlug));

  if (!tenant) {
    throw new Error("Wiki tenant not found.");
  }

  const suggestionId = getString(formData, "suggestionId");
  const reviewAction = getString(formData, "reviewAction");
  const reviewNote = getString(formData, "reviewNote") || null;

  if (!suggestionId) {
    throw new Error("Suggestion id is required.");
  }

  if (reviewAction === "approve") {
    const approved = await approveWikiSuggestion({
      tenantId: tenant.id,
      suggestionId,
      actorId: actor.id,
      reviewNote,
    });

    await revalidateWikiPage(tenant.slug, approved.pageSlug);
    revalidatePath(`/${tenant.slug}`);
    revalidatePath(`/${tenant.slug}/pages`);
    revalidatePath(`/${tenant.slug}/${approved.pageSlug}`);
    revalidatePath(`/${tenant.slug}/review`);
    return;
  }

  if (reviewAction === "rejected" || reviewAction === "changes_requested") {
    await updateWikiSuggestionReviewStatus({
      tenantId: tenant.id,
      suggestionId,
      status: reviewAction,
      actorId: actor.id,
      reviewNote,
    });

    revalidatePath(`/${tenant.slug}/review`);
    return;
  }

  throw new Error("Choose a valid review action.");
}

export async function reviewWikiCommunityNoteAction(
  tenantSlug: string,
  formData: FormData,
) {
  requireConfiguredAuth();

  const actor = await getCurrentWikiActor();

  if (!actor || !canReviewSuggestions(actor)) {
    throw new Error("You do not have permission to review community notes.");
  }

  const tenant = await getWikiTenantBySlug(normalizeTenantSlug(tenantSlug));

  if (!tenant) {
    throw new Error("Wiki tenant not found.");
  }

  const noteId = getString(formData, "noteId");
  const reviewAction = getString(formData, "reviewAction");
  const reviewNote = getString(formData, "reviewNote") || null;

  if (!noteId) {
    throw new Error("Community note id is required.");
  }

  if (
    reviewAction !== "approved" &&
    reviewAction !== "rejected" &&
    reviewAction !== "incorporated"
  ) {
    throw new Error("Choose a valid community note review action.");
  }

  const note = await updateWikiCommunityNoteModerationStatus({
    tenantId: tenant.id,
    noteId,
    status: reviewAction,
    actorId: actor.id,
    reviewNote,
  });

  revalidatePath(`/${tenant.slug}/review`);
  await revalidateWikiPage(tenant.slug, note.pageSlug);
  revalidatePath(`/${tenant.slug}/${note.pageSlug}`);
}

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

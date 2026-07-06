"use server";

import { revalidatePath } from "next/cache";

import {
  getCurrentWikiActor,
  requireConfiguredAuth,
} from "@/src/auth/wiki-auth";
import {
  createWikiCommunityNote,
  getPublishedWikiPageBySlug,
  getWikiTenantBySlug,
  type WikiCommunityNoteType,
} from "@/src/db/wiki";
import { normalizeTenantSlug, normalizeWikiSlug } from "@/src/wiki/tenant-routing";

export type CommunityNoteFormState = {
  ok: boolean;
  message: string | null;
};

const COMMUNITY_NOTE_TYPES = new Set([
  "general",
  "correction",
  "source",
  "clarification",
  "dispute",
]);

export async function submitWikiCommunityNoteAction(
  tenantSlug: string,
  pageSlug: string,
  _state: CommunityNoteFormState,
  formData: FormData,
): Promise<CommunityNoteFormState> {
  try {
    requireConfiguredAuth();

    const actor = await getCurrentWikiActor();

    if (!actor) {
      return {
        ok: false,
        message: "Sign in before submitting a community note.",
      };
    }

    const tenant = await getWikiTenantBySlug(normalizeTenantSlug(tenantSlug));

    if (!tenant) {
      return {
        ok: false,
        message: "This wiki tenant could not be found.",
      };
    }

    const page = await getPublishedWikiPageBySlug(
      tenant.id,
      normalizeWikiSlug(pageSlug),
    );

    if (!page) {
      return {
        ok: false,
        message: "The page for this community note could not be found.",
      };
    }

    const bodyMarkdown = getString(formData, "bodyMarkdown");
    const sourceUrl = getString(formData, "sourceUrl") || null;
    const targetQuote = getString(formData, "targetQuote") || null;
    const noteType = normalizeCommunityNoteType(getString(formData, "noteType"));

    if (bodyMarkdown.length < 20) {
      return {
        ok: false,
        message: "Community notes must include at least 20 characters.",
      };
    }

    if (sourceUrl && !isValidUrl(sourceUrl)) {
      return {
        ok: false,
        message: "Source URL must be a valid URL.",
      };
    }

    await createWikiCommunityNote({
      tenantId: tenant.id,
      pageId: page.id,
      noteType,
      bodyMarkdown,
      sourceUrl,
      targetQuote,
      metadata: { origin: "human" },
      actorId: actor.id,
      actorEmail: actor.email,
    });

    revalidatePath(`/${tenant.slug}/review`);

    return {
      ok: true,
      message: "Community note submitted for moderator review.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Community note could not be submitted.",
    };
  }
}

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function normalizeCommunityNoteType(value: string): WikiCommunityNoteType {
  return COMMUNITY_NOTE_TYPES.has(value)
    ? (value as WikiCommunityNoteType)
    : "general";
}

function isValidUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

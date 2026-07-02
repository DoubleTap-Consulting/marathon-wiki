import type { Kysely } from "kysely";

import {
  generateMarathonWikiDraft,
  type GrokDraftResult,
  type GrokTransport,
} from "./grok";
import type { WikiActor } from "@/src/auth/wiki-auth";
import { getDb } from "@/src/db/client";
import type { DB } from "@/src/db/types";
import {
  createWikiSuggestion,
  getPublishedWikiPageBySlug,
  type WikiSuggestionSummary,
  type WikiTenant,
} from "@/src/db/wiki";
import { normalizeWikiSlug } from "@/src/wiki/tenant-routing";

export type AiWikiSuggestionInput = {
  tenant: WikiTenant;
  actor: WikiActor;
  pageTitle: string;
  targetSlug: string;
  sourceNotes?: string | null;
};

export type AiDraftGenerator = typeof generateMarathonWikiDraft;

export async function createAiAssistedWikiSuggestion(
  input: AiWikiSuggestionInput,
  options: {
    db?: Kysely<DB>;
    generateDraft?: AiDraftGenerator;
    transport?: GrokTransport;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<WikiSuggestionSummary> {
  const db = options.db ?? getDb();
  const targetSlug = normalizeWikiSlug(input.targetSlug);
  const pageTitle = input.pageTitle.trim();
  const sourceNotes = input.sourceNotes?.trim() || null;

  if (pageTitle.length < 3) {
    throw new Error("Page title must be at least 3 characters.");
  }

  if (!targetSlug) {
    throw new Error("Page slug is required.");
  }

  const existingPage = await getPublishedWikiPageBySlug(
    input.tenant.id,
    targetSlug,
    db,
  );
  const generateDraft = options.generateDraft ?? generateMarathonWikiDraft;
  const draft = await generateDraft(
    {
      gameTitle: input.tenant.gameTitle,
      pageTitle,
      targetSlug,
      sourceNotes,
      existingPage,
    },
    {
      env: options.env,
      transport: options.transport,
    },
  );

  return createWikiSuggestion(
    {
      tenantId: input.tenant.id,
      pageId: existingPage?.id ?? null,
      suggestionType: existingPage ? "edit_page" : "new_page",
      targetSlug,
      title: draft.title,
      summary: draft.summary,
      bodyMarkdown: draft.bodyMarkdown,
      actorId: input.actor.id,
      actorEmail: input.actor.email,
      metadata: buildAiSuggestionMetadata(draft, input.actor.id, sourceNotes),
    },
    db,
  );
}

function buildAiSuggestionMetadata(
  draft: GrokDraftResult,
  actorId: string,
  sourceNotes: string | null,
) {
  return {
    origin: "ai_generated" as const,
    ai: {
      provider: draft.provider,
      model: draft.model,
      responseId: draft.responseId,
      promptVersion: draft.promptVersion,
      generatedAt: new Date().toISOString(),
      requestedBy: actorId,
      sourceNotes,
    },
  };
}

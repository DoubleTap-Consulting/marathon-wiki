import type { Kysely } from "kysely";

import {
  generateMarathonWikiCanonicalPage,
  type GatewayCanonicalPageResult,
  type GatewayGenerateText,
} from "./gateway";
import type { WikiActor } from "@/src/auth/wiki-auth";
import { getDb } from "@/src/db/client";
import type { DB } from "@/src/db/types";
import {
  getPublishedWikiPageBySlug,
  listWikiCommunityNoteContextForPage,
  listWikiSourceContextForTopic,
  saveWikiPageWithRevision,
  type WikiPageDetail,
  type WikiPageRevisionAiProvenance,
  type WikiSourceReference,
  type WikiTenant,
} from "@/src/db/wiki";
import { normalizeWikiSlug } from "@/src/wiki/tenant-routing";

export type AiCanonicalPageInput = {
  tenant: WikiTenant;
  actor: WikiActor;
  pageTitle: string;
  targetSlug: string;
  sourceContext?: string | null;
  refreshReason?: string | null;
};

export type AiCanonicalPageGenerator = typeof generateMarathonWikiCanonicalPage;

export type AiCanonicalPagePublishResult = {
  page: WikiPageDetail;
  provenance: WikiPageRevisionAiProvenance;
};

export async function generateAiCanonicalWikiPageRevision(
  input: AiCanonicalPageInput,
  options: {
    db?: Kysely<DB>;
    generateCanonicalPage?: AiCanonicalPageGenerator;
    generate?: GatewayGenerateText;
    env?: Partial<NodeJS.ProcessEnv>;
  } = {},
): Promise<AiCanonicalPagePublishResult> {
  const db = options.db ?? getDb();
  const targetSlug = normalizeWikiSlug(input.targetSlug);
  const pageTitle = input.pageTitle.trim();
  const editorSourceContext = input.sourceContext?.trim() || null;

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
  const storedSourceReferences = await listWikiSourceContextForTopic(
    {
      tenantId: input.tenant.id,
      targetSlug,
      pageTitle,
    },
    db,
  );
  const communityNoteReferences = await listWikiCommunityNoteContextForPage(
    {
      tenantId: input.tenant.id,
      pageId: existingPage?.id ?? null,
      targetSlug,
    },
    db,
  );
  const sourceReferences = [
    ...storedSourceReferences,
    ...communityNoteReferences,
  ];
  const sourceContext = buildCanonicalSourceContext(
    editorSourceContext,
    sourceReferences,
  );
  const refreshReason =
    input.refreshReason?.trim() || (existingPage ? "manual_refresh" : "new_page");
  const generateCanonicalPage =
    options.generateCanonicalPage ?? generateMarathonWikiCanonicalPage;
  const generated = await generateCanonicalPage(
    {
      gameTitle: input.tenant.gameTitle,
      pageTitle,
      targetSlug,
      sourceContext,
      refreshReason,
      existingPage,
    },
    {
      env: options.env,
      generate: options.generate,
    },
  );
  const provenance = buildCanonicalAiProvenance(
    generated,
    input.actor.id,
    refreshReason,
    sourceReferences,
  );
  const bodyMarkdown = normalizeCanonicalBodyMarkdown(
    generated.bodyMarkdown,
    generated.title,
  );
  const page = await saveWikiPageWithRevision(
    {
      tenantId: input.tenant.id,
      slug: targetSlug,
      title: generated.title,
      summary: generated.summary,
      bodyMarkdown,
      status: "published",
      actorId: input.actor.id,
      changeNote: existingPage
        ? `AI canonical refresh: ${refreshReason}`
        : `AI canonical generation: ${refreshReason}`,
      aiProvenance: provenance,
      sourceReferences,
    },
    db,
  );

  return {
    page,
    provenance,
  };
}

function buildCanonicalAiProvenance(
  generated: GatewayCanonicalPageResult,
  requestedBy: string,
  refreshReason: string,
  sourceReferences: WikiSourceReference[],
): WikiPageRevisionAiProvenance {
  return {
    provider: generated.provider,
    modelId: generated.model,
    promptVersion: generated.promptVersion,
    generatedAt: new Date().toISOString(),
    responseId: generated.responseId,
    sourceContextSummary: generated.sourceContextSummary,
    sourceReferences: sourceReferences.map((source) => ({
      sourceId: source.id,
      sourceKey: source.sourceKey,
      sourceType: source.sourceType,
      title: source.title,
      url: source.url,
      publisher: source.publisher,
      authorityTier: source.metadata?.authorityTier ?? null,
      authorityScore: source.metadata?.authorityScore ?? null,
    })),
    refreshReason,
    requestedBy,
  };
}

function buildCanonicalSourceContext(
  editorSourceContext: string | null,
  sourceReferences: WikiSourceReference[],
) {
  const sections = [
    editorSourceContext
      ? `Editor supplied context:\n${truncateContext(editorSourceContext)}`
      : null,
    sourceReferences.length > 0
      ? [
          "Retrieved stored source context:",
          ...sourceReferences.map((source, index) =>
            [
              `[${index + 1}] ${source.title}`,
              source.publisher ? `Publisher: ${source.publisher}` : null,
              `Source type: ${source.sourceType}`,
              source.metadata?.authorityTier
                ? `Authority: ${source.metadata.authorityTier}${
                    typeof source.metadata.authorityScore === "number"
                      ? ` (${source.metadata.authorityScore}/100)`
                      : ""
                  }`
                : null,
              source.retrievedAt
                ? `Retrieved: ${source.retrievedAt.toISOString()}`
                : null,
              source.url ? `URL: ${source.url}` : null,
              source.contextText
                ? `Context: ${truncateContext(source.contextText)}`
                : null,
            ]
              .filter(Boolean)
              .join("\n"),
          ),
        ].join("\n\n")
      : null,
  ].filter(Boolean);

  return sections.length > 0 ? sections.join("\n\n") : null;
}

function truncateContext(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();

  return normalized.length > 1_500
    ? `${normalized.slice(0, 1_500).trim()}...`
    : normalized;
}

function normalizeCanonicalBodyMarkdown(bodyMarkdown: string, title: string) {
  const lines = bodyMarkdown.trim().split(/\r?\n/);
  const firstContentIndex = lines.findIndex((line) => line.trim().length > 0);

  if (firstContentIndex === -1) {
    return bodyMarkdown.trim();
  }

  const firstLine = lines[firstContentIndex]?.trim() ?? "";
  const expectedHeading = `# ${title.trim()}`.toLowerCase();

  if (firstLine.toLowerCase() !== expectedHeading) {
    return bodyMarkdown.trim();
  }

  lines.splice(firstContentIndex, 1);

  return lines.join("\n").replace(/^\s+/, "").trim();
}

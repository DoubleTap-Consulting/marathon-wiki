import type {
  WikiPageDetail,
  WikiPageRevisionAiProvenance,
  WikiPageRevisionDetail,
} from "@/src/db/wiki";
import type { ArticleSource } from "@/src/wiki/article";

function isoOrNull(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function toIso(value: Date | string) {
  return new Date(value).toISOString();
}

/**
 * Sources for the reader: the latest AI revision's references (in the order the
 * model listed them) with retrieval dates from the stored source rows, or the
 * page's own sources when no AI revision exists.
 */
export function buildArticleSources(page: WikiPageDetail): ArticleSource[] {
  const references = page.latestRevision?.aiProvenance?.sourceReferences ?? [];

  if (references.length > 0) {
    return references.map((reference) => {
      const stored = page.sources.find(
        (source) =>
          source.id === reference.sourceId ||
          (source.metadata as { copiedFromSourceId?: string } | null)?.copiedFromSourceId === reference.sourceId,
      );

      return {
        id: reference.sourceId,
        sourceKey: reference.sourceKey,
        sourceType: reference.sourceType,
        title: reference.title,
        url: reference.url,
        publisher: reference.publisher,
        authorityTier: reference.authorityTier ?? null,
        retrievedAt: isoOrNull(stored?.retrievedAt),
      };
    });
  }

  return page.sources.map((source) => ({
    id: source.id,
    sourceKey: source.sourceKey,
    sourceType: source.sourceType,
    title: source.title,
    url: source.url,
    publisher: source.publisher,
    authorityTier: (source.metadata as { authorityTier?: string } | null)?.authorityTier ?? null,
    retrievedAt: isoOrNull(source.retrievedAt),
  }));
}

export type TrustSummary =
  | { kind: "ai-updated" | "ai-checked"; at: string; revisionNumber: number; provenance: WikiPageRevisionAiProvenance }
  | { kind: "edited"; at: string; revisionNumber: number; hasAiHistory: boolean };

/** What the trust strip says, from the newest revision. Falls back to the page date when provenance is unavailable. */
export function summarizeTrust(
  page: WikiPageDetail,
  revisions: WikiPageRevisionDetail[] | null,
): TrustSummary {
  const latest = revisions?.[0];

  if (!latest) {
    return { kind: "edited", at: toIso(page.updatedAt), revisionNumber: page.latestRevisionNumber, hasAiHistory: true };
  }

  const hasAiHistory = revisions.some((revision) => revision.aiProvenance);

  if (!latest.aiProvenance) {
    return { kind: "edited", at: toIso(latest.createdAt), revisionNumber: latest.revisionNumber, hasAiHistory };
  }

  const previous = revisions[1];
  const unchanged = previous && previous.bodyMarkdown.trim() === latest.bodyMarkdown.trim();

  return {
    kind: unchanged ? "ai-checked" : "ai-updated",
    at: toIso(latest.createdAt),
    revisionNumber: latest.revisionNumber,
    provenance: latest.aiProvenance,
  };
}

export function modelDisplayName(modelId: string) {
  return /grok/i.test(modelId) ? "Grok" : "AI";
}

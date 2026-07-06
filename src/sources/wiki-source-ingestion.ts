import { createHash } from "node:crypto";

import type { Kysely } from "kysely";

import { getDb } from "@/src/db/client";
import type { DB } from "@/src/db/types";
import {
  MARATHON_CURATED_SOURCE_REGISTRY,
  type CuratedWikiSource,
  type WikiSourceAuthorityTier,
} from "@/src/sources/marathon-source-registry";
import { normalizeTenantSlug, normalizeWikiSlug } from "@/src/wiki/tenant-routing";

export type WikiSourceMetadata = {
  origin?: string;
  registrySourceId?: string;
  authorityTier?: WikiSourceAuthorityTier | string;
  authorityScore?: number;
  refreshCadenceDays?: number;
  extractionStrategy?: string;
  extraction?: {
    fetchedAt?: string;
    httpStatus?: number;
    matchedTerms?: string[];
    missingTerms?: string[];
    usedFallbackContext?: boolean;
    contentHash?: string;
    sourceUrl?: string;
  };
  [key: string]: unknown;
};

export type CuratedSourceIngestionResult = {
  tenantsProcessed: number;
  sourcesAttempted: number;
  upserted: Array<{
    id: string;
    tenantId: string;
    sourceKey: string;
    title: string;
    topicSlugs: string[];
    authorityTier: string;
    authorityScore: number;
    usedFallbackContext: boolean;
  }>;
  failed: Array<{
    sourceId: string;
    tenantId?: string;
    url: string;
    error: string;
  }>;
};

type SourceIngestionTenant = {
  id: string;
  slug: string;
  gameSlug: string;
  gameTitle: string;
};

export async function runCuratedWikiSourceIngestion(
  input: {
    tenantId?: string;
    tenantSlug?: string;
    sourceIds?: string[];
    topicSlug?: string;
    now?: Date;
  } = {},
  options: {
    db?: Kysely<DB>;
    fetchImpl?: typeof fetch;
    registry?: CuratedWikiSource[];
  } = {},
): Promise<CuratedSourceIngestionResult> {
  const db = options.db ?? getDb();
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (!fetchImpl) {
    throw new Error("Fetch is not available for curated source ingestion.");
  }

  const now = input.now ?? new Date();
  const tenants = await listTenantsForSourceIngestion(input, db);
  const registry = filterRegistry(
    options.registry ?? MARATHON_CURATED_SOURCE_REGISTRY,
    input,
  );
  const result: CuratedSourceIngestionResult = {
    tenantsProcessed: tenants.length,
    sourcesAttempted: 0,
    upserted: [],
    failed: [],
  };

  for (const tenant of tenants) {
    const tenantSources = registry.filter(
      (source) => source.gameSlug === tenant.gameSlug,
    );
    result.sourcesAttempted += tenantSources.length;

    for (const source of tenantSources) {
      try {
        const extracted = await fetchAndExtractCuratedSourceContext(
          source,
          now,
          fetchImpl,
        );
        const id = buildCuratedWikiSourceRowId(tenant.id, source.id);

        await db
          .insertInto("wiki_sources")
          .values({
            id,
            tenant_id: tenant.id,
            page_id: null,
            revision_id: null,
            source_key: source.sourceKey,
            source_type: source.sourceType,
            title: source.title,
            url: source.url,
            publisher: source.publisher,
            context_text: extracted.contextText,
            topic_slugs: source.topicSlugs.map(normalizeWikiSlug).filter(Boolean),
            retrieved_at: now,
            metadata: buildSourceMetadata(source, extracted, now),
          })
          .onConflict((oc) =>
            oc.column("id").doUpdateSet({
              page_id: null,
              revision_id: null,
              source_key: source.sourceKey,
              source_type: source.sourceType,
              title: source.title,
              url: source.url,
              publisher: source.publisher,
              context_text: extracted.contextText,
              topic_slugs: source.topicSlugs
                .map(normalizeWikiSlug)
                .filter(Boolean),
              retrieved_at: now,
              metadata: buildSourceMetadata(source, extracted, now),
              updated_at: now,
            }),
          )
          .execute();

        result.upserted.push({
          id,
          tenantId: tenant.id,
          sourceKey: source.sourceKey,
          title: source.title,
          topicSlugs: source.topicSlugs.map(normalizeWikiSlug).filter(Boolean),
          authorityTier: source.authorityTier,
          authorityScore: source.authorityScore,
          usedFallbackContext: extracted.usedFallbackContext,
        });
      } catch (error) {
        result.failed.push({
          sourceId: source.id,
          tenantId: tenant.id,
          url: source.url,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return result;
}

export function buildCuratedWikiSourceRowId(tenantId: string, sourceId: string) {
  return `curated_source_${stableIdPart(tenantId)}_${stableIdPart(sourceId)}`;
}

async function listTenantsForSourceIngestion(
  input: {
    tenantId?: string;
    tenantSlug?: string;
  },
  db: Kysely<DB>,
): Promise<SourceIngestionTenant[]> {
  let query = db
    .selectFrom("tenants")
    .innerJoin("games", "games.id", "tenants.game_id")
    .select([
      "tenants.id as id",
      "tenants.slug as slug",
      "games.slug as gameSlug",
      "games.title as gameTitle",
    ])
    .where("tenants.status", "=", "active")
    .orderBy("tenants.slug", "asc");

  if (input.tenantId?.trim()) {
    query = query.where("tenants.id", "=", input.tenantId.trim());
  }

  if (input.tenantSlug?.trim()) {
    query = query.where(
      "tenants.slug",
      "=",
      normalizeTenantSlug(input.tenantSlug),
    );
  }

  return query.execute();
}

function filterRegistry(
  registry: CuratedWikiSource[],
  input: {
    sourceIds?: string[];
    topicSlug?: string;
  },
) {
  const sourceIds = new Set(input.sourceIds?.filter(Boolean));
  const topicSlug = input.topicSlug ? normalizeWikiSlug(input.topicSlug) : null;

  return registry.filter((source) => {
    if (sourceIds.size > 0 && !sourceIds.has(source.id)) {
      return false;
    }

    if (
      topicSlug &&
      !source.topicSlugs.map(normalizeWikiSlug).includes(topicSlug)
    ) {
      return false;
    }

    return true;
  });
}

async function fetchAndExtractCuratedSourceContext(
  source: CuratedWikiSource,
  now: Date,
  fetchImpl: typeof fetch,
) {
  const response = await fetchImpl(source.url, {
    cache: "no-store",
    headers: {
      accept: "text/html, text/plain;q=0.9, */*;q=0.1",
      "user-agent": "MarathonWikiSourceIngestion/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Curated source fetch failed with HTTP ${response.status} for ${source.url}.`,
    );
  }

  const body = await response.text();
  const text = htmlToPlainText(body);
  const matchedTerms = findMatchedTerms(
    text,
    source.extraction.requiredTerms,
    source.extraction.aliases,
  );
  const missingTerms = source.extraction.requiredTerms.filter(
    (term) => !matchedTerms.includes(term),
  );
  const usedFallbackContext = missingTerms.length > 0;

  return {
    contextText: usedFallbackContext
      ? source.extraction.fallbackContext
      : source.extraction.contextSummary,
    matchedTerms,
    missingTerms,
    usedFallbackContext,
    httpStatus: response.status,
    contentHash: hashContent(text),
    fetchedAt: now.toISOString(),
  };
}

function buildSourceMetadata(
  source: CuratedWikiSource,
  extracted: Awaited<ReturnType<typeof fetchAndExtractCuratedSourceContext>>,
  now: Date,
): WikiSourceMetadata {
  return {
    origin: "curated_source_ingestion",
    registrySourceId: source.id,
    authorityTier: source.authorityTier,
    authorityScore: source.authorityScore,
    refreshCadenceDays: source.refreshCadenceDays,
    extractionStrategy: source.extraction.strategy,
    extraction: {
      fetchedAt: extracted.fetchedAt ?? now.toISOString(),
      httpStatus: extracted.httpStatus,
      matchedTerms: extracted.matchedTerms,
      missingTerms: extracted.missingTerms,
      usedFallbackContext: extracted.usedFallbackContext,
      contentHash: extracted.contentHash,
      sourceUrl: source.url,
    },
  };
}

function findMatchedTerms(
  text: string,
  requiredTerms: string[],
  aliases: Record<string, string[]> | undefined,
) {
  const normalizedText = text.toLowerCase();

  return requiredTerms.filter((term) => {
    const termAliases = aliases?.[term] ?? [term];

    return termAliases.some((alias) =>
      normalizedText.includes(alias.toLowerCase()),
    );
  });
}

function htmlToPlainText(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

function hashContent(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function stableIdPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
}

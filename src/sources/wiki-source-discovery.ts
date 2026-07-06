import { createHash } from "node:crypto";

import type { Kysely } from "kysely";

import { getDb } from "@/src/db/client";
import type { DB } from "@/src/db/types";
import type { WikiSourceAuthorityTier } from "@/src/sources/marathon-source-registry";
import type { WikiSourceMetadata } from "@/src/sources/wiki-source-ingestion";
import { normalizeTenantSlug, normalizeWikiSlug } from "@/src/wiki/tenant-routing";

const DEFAULT_DISCOVERY_LIMIT = 5;
const MAX_DISCOVERY_LIMIT = 5;
const MAX_CONTEXT_CHARACTERS = 1800;
const MAX_FETCHED_TEXT_CHARACTERS = 120_000;

type SourceDiscoveryTenant = {
  id: string;
  slug: string;
  gameSlug: string;
  gameTitle: string;
};

export type WikiSourceDiscoveryCandidate = {
  title?: string | null;
  url?: string | null;
  publisher?: string | null;
  summary?: string | null;
  context?: string | null;
  contextText?: string | null;
  authorityScore?: number | null;
  authorityTier?: WikiSourceAuthorityTier | string | null;
  sourceType?: string | null;
  sourceKey?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type WikiSourceDiscoveryResult = {
  tenantsProcessed: number;
  providerUsed: string | null;
  query: string | null;
  candidatesDiscovered: number;
  candidatesAttempted: number;
  upserted: Array<{
    id: string;
    tenantId: string;
    sourceKey: string;
    title: string;
    url: string;
    topicSlugs: string[];
    authorityTier: string;
    authorityScore: number;
    fetchedContext: boolean;
  }>;
  failed: Array<{
    tenantId?: string;
    title?: string | null;
    url?: string | null;
    error: string;
  }>;
};

type NormalizedDiscoveryCandidate = {
  title: string;
  url: string;
  publisher: string | null;
  contextText: string | null;
  authorityTier: string;
  authorityScore: number;
  sourceType: string;
  sourceKey: string | null;
  metadata: Record<string, unknown> | null;
};

type DiscoveryProviderConfig = {
  endpoint?: string | null;
  token?: string | null;
};

export async function runWikiSourceDiscovery(
  input: {
    tenantId?: string;
    tenantSlug?: string;
    topicSlug: string;
    query?: string | null;
    limit?: number | null;
    candidates?: WikiSourceDiscoveryCandidate[];
    now?: Date;
  },
  options: {
    db?: Kysely<DB>;
    fetchImpl?: typeof fetch;
    provider?: DiscoveryProviderConfig;
  } = {},
): Promise<WikiSourceDiscoveryResult> {
  const topicSlug = normalizeWikiSlug(input.topicSlug);

  if (!topicSlug) {
    throw new Error("Source discovery requires a topic slug.");
  }

  const db = options.db ?? getDb();
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = input.now ?? new Date();
  const limit = normalizeDiscoveryLimit(input.limit);
  const tenants = await listTenantsForSourceDiscovery(input, db);
  const providerEndpoint =
    options.provider?.endpoint?.trim() ??
    process.env.WIKI_SOURCE_DISCOVERY_ENDPOINT?.trim() ??
    null;
  const providerToken =
    options.provider?.token?.trim() ??
    process.env.WIKI_SOURCE_DISCOVERY_TOKEN?.trim() ??
    null;
  const explicitCandidates = input.candidates?.length
    ? input.candidates
    : null;
  const result: WikiSourceDiscoveryResult = {
    tenantsProcessed: tenants.length,
    providerUsed: explicitCandidates ? null : providerEndpoint,
    query: input.query?.trim() || null,
    candidatesDiscovered: 0,
    candidatesAttempted: 0,
    upserted: [],
    failed: [],
  };

  for (const tenant of tenants) {
    const query =
      input.query?.trim() || `${tenant.gameTitle} ${topicSlug} wiki sources`;
    const rawCandidates = explicitCandidates
      ? explicitCandidates
      : await fetchProviderCandidates(
          {
            endpoint: providerEndpoint,
            token: providerToken,
            tenant,
            topicSlug,
            query,
            limit,
          },
          fetchImpl,
        );
    const candidates = normalizeDiscoveryCandidates(rawCandidates);
    const boundedCandidates = candidates.slice(0, limit);

    if (!result.query) {
      result.query = query;
    }
    result.candidatesDiscovered += candidates.length;
    result.candidatesAttempted += boundedCandidates.length;

    for (const candidate of boundedCandidates) {
      try {
        const context = candidate.contextText
          ? {
              contextText: candidate.contextText,
              fetchedContext: false,
              httpStatus: null,
              contentHash: hashContent(candidate.contextText),
            }
          : await fetchCandidateContext(candidate.url, fetchImpl);
        const sourceKey =
          candidate.sourceKey ??
          buildDiscoveredWikiSourceKey(topicSlug, candidate.url);
        const id = buildDiscoveredWikiSourceRowId(
          tenant.id,
          topicSlug,
          candidate.url,
        );
        const topicSlugs = [topicSlug];

        await db
          .insertInto("wiki_sources")
          .values({
            id,
            tenant_id: tenant.id,
            page_id: null,
            revision_id: null,
            source_key: sourceKey,
            source_type: candidate.sourceType,
            title: candidate.title,
            url: candidate.url,
            publisher: candidate.publisher,
            context_text: context.contextText,
            topic_slugs: topicSlugs,
            retrieved_at: now,
            metadata: buildDiscoveryMetadata({
              candidate,
              context,
              query,
              providerEndpoint,
              topicSlug,
              now,
            }),
          })
          .onConflict((oc) =>
            oc.column("id").doUpdateSet({
              page_id: null,
              revision_id: null,
              source_key: sourceKey,
              source_type: candidate.sourceType,
              title: candidate.title,
              url: candidate.url,
              publisher: candidate.publisher,
              context_text: context.contextText,
              topic_slugs: topicSlugs,
              retrieved_at: now,
              metadata: buildDiscoveryMetadata({
                candidate,
                context,
                query,
                providerEndpoint,
                topicSlug,
                now,
              }),
              updated_at: now,
            }),
          )
          .execute();

        result.upserted.push({
          id,
          tenantId: tenant.id,
          sourceKey,
          title: candidate.title,
          url: candidate.url,
          topicSlugs,
          authorityTier: candidate.authorityTier,
          authorityScore: candidate.authorityScore,
          fetchedContext: context.fetchedContext,
        });
      } catch (error) {
        result.failed.push({
          tenantId: tenant.id,
          title: candidate.title,
          url: candidate.url,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return result;
}

export function buildDiscoveredWikiSourceRowId(
  tenantId: string,
  topicSlug: string,
  url: string,
) {
  return [
    "discovered_source",
    stableIdPart(tenantId),
    stableIdPart(topicSlug),
    hashContent(url).slice(0, 20),
  ].join("_");
}

export function buildDiscoveredWikiSourceKey(topicSlug: string, url: string) {
  return [
    "discovered",
    normalizeWikiSlug(topicSlug),
    hashContent(url).slice(0, 12),
  ].join(":");
}

async function listTenantsForSourceDiscovery(
  input: {
    tenantId?: string;
    tenantSlug?: string;
  },
  db: Kysely<DB>,
): Promise<SourceDiscoveryTenant[]> {
  if (!input.tenantId?.trim() && !input.tenantSlug?.trim()) {
    throw new Error("Source discovery requires tenantId or tenantSlug.");
  }

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

  const tenants = await query.execute();

  if (tenants.length === 0) {
    throw new Error("No active tenant matched source discovery input.");
  }

  return tenants;
}

async function fetchProviderCandidates(
  input: {
    endpoint: string | null;
    token: string | null;
    tenant: SourceDiscoveryTenant;
    topicSlug: string;
    query: string;
    limit: number;
  },
  fetchImpl: typeof fetch,
): Promise<WikiSourceDiscoveryCandidate[]> {
  if (!input.endpoint) {
    return [];
  }

  if (!fetchImpl) {
    throw new Error("Fetch is not available for source discovery.");
  }

  const response = await fetchImpl(input.endpoint, {
    method: "POST",
    cache: "no-store",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(input.token ? { authorization: `Bearer ${input.token}` } : {}),
    },
    body: JSON.stringify({
      tenantId: input.tenant.id,
      tenantSlug: input.tenant.slug,
      gameSlug: input.tenant.gameSlug,
      gameTitle: input.tenant.gameTitle,
      topicSlug: input.topicSlug,
      query: input.query,
      limit: input.limit,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Source discovery provider failed with HTTP ${response.status}.`,
    );
  }

  const payload = (await response.json()) as unknown;
  const sources = Array.isArray(payload)
    ? payload
    : typeof payload === "object" &&
        payload !== null &&
        Array.isArray((payload as { sources?: unknown }).sources)
      ? (payload as { sources: unknown[] }).sources
      : [];

  return sources.filter(isCandidateRecord) as WikiSourceDiscoveryCandidate[];
}

function normalizeDiscoveryCandidates(
  candidates: WikiSourceDiscoveryCandidate[],
) {
  const seenUrls = new Set<string>();
  const normalized: NormalizedDiscoveryCandidate[] = [];

  for (const candidate of candidates) {
    const url = normalizeHttpUrl(candidate.url);
    const title = candidate.title?.trim();

    if (!url || !title || seenUrls.has(url)) {
      continue;
    }

    seenUrls.add(url);
    normalized.push({
      title,
      url,
      publisher: candidate.publisher?.trim() || null,
      contextText: truncateContext(
        candidate.contextText ?? candidate.context ?? candidate.summary ?? null,
      ),
      authorityTier: normalizeAuthorityTier(candidate.authorityTier),
      authorityScore: normalizeAuthorityScore(candidate.authorityScore),
      sourceType: candidate.sourceType?.trim() || "discovered_reference",
      sourceKey: candidate.sourceKey?.trim() || null,
      metadata: candidate.metadata ?? null,
    });
  }

  return normalized;
}

async function fetchCandidateContext(url: string, fetchImpl: typeof fetch) {
  if (!fetchImpl) {
    throw new Error("Fetch is not available for source discovery.");
  }

  const response = await fetchImpl(url, {
    cache: "no-store",
    headers: {
      accept: "text/html, text/plain;q=0.9, */*;q=0.1",
      "user-agent": "MarathonWikiSourceDiscovery/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Discovered source fetch failed with HTTP ${response.status} for ${url}.`,
    );
  }

  const body = await response.text();
  const plainText = htmlToPlainText(body).slice(0, MAX_FETCHED_TEXT_CHARACTERS);
  const contextText = truncateContext(plainText);

  if (!contextText) {
    throw new Error(`Discovered source returned no extractable text for ${url}.`);
  }

  return {
    contextText,
    fetchedContext: true,
    httpStatus: response.status,
    contentHash: hashContent(plainText),
  };
}

function buildDiscoveryMetadata(input: {
  candidate: NormalizedDiscoveryCandidate;
  context: {
    fetchedContext: boolean;
    httpStatus: number | null;
    contentHash: string;
  };
  query: string;
  providerEndpoint: string | null;
  topicSlug: string;
  now: Date;
}): WikiSourceMetadata {
  return {
    ...(input.candidate.metadata ?? {}),
    origin: "source_discovery_candidate",
    discoveryQuery: input.query,
    discoveryProvider: input.providerEndpoint
      ? safeProviderName(input.providerEndpoint)
      : "explicit_candidates",
    topicSlug: input.topicSlug,
    authorityTier: input.candidate.authorityTier,
    authorityScore: input.candidate.authorityScore,
    candidate: {
      title: input.candidate.title,
      url: input.candidate.url,
      publisher: input.candidate.publisher,
      sourceType: input.candidate.sourceType,
      explicitContextProvided: !input.context.fetchedContext,
    },
    extraction: {
      fetchedAt: input.now.toISOString(),
      httpStatus: input.context.httpStatus ?? undefined,
      contentHash: input.context.contentHash,
      sourceUrl: input.candidate.url,
    },
  };
}

function normalizeDiscoveryLimit(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_DISCOVERY_LIMIT;
  }

  return Math.min(MAX_DISCOVERY_LIMIT, Math.floor(value));
}

function normalizeHttpUrl(value: string | null | undefined) {
  if (!value?.trim()) {
    return null;
  }

  try {
    const url = new URL(value.trim());

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }

    url.hash = "";

    return url.toString();
  } catch {
    return null;
  }
}

function normalizeAuthorityTier(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : "community";
}

function normalizeAuthorityScore(value: unknown) {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(number)) {
    return 45;
  }

  return Math.max(0, Math.min(100, Math.round(number)));
}

function truncateContext(value: string | null | undefined) {
  const text = value?.replace(/\s+/g, " ").trim();

  if (!text) {
    return null;
  }

  return text.length > MAX_CONTEXT_CHARACTERS
    ? `${text.slice(0, MAX_CONTEXT_CHARACTERS - 1).trim()}...`
    : text;
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

function safeProviderName(endpoint: string) {
  try {
    return new URL(endpoint).host;
  } catch {
    return "configured_provider";
  }
}

function hashContent(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function stableIdPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
}

function isCandidateRecord(value: unknown): value is WikiSourceDiscoveryCandidate {
  return typeof value === "object" && value !== null;
}

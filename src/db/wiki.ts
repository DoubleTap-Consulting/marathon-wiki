import { randomUUID } from "node:crypto";

import { sql, type Kysely, type Transaction } from "kysely";

import { getDb } from "./client";
import type { DB } from "./types";
import type { WikiSourceMetadata } from "@/src/sources/wiki-source-ingestion";
import { isTenantPubliclyEnabled, normalizeWikiSlug } from "@/src/wiki/tenant-routing";

export const MARATHON_TENANT_SLUG = "marathon";

type WikiDatabase = Kysely<DB> | Transaction<DB>;

const WIKI_COMMUNITY_NOTE_PUBLIC_STATUSES: WikiCommunityNoteStatus[] = [
  "approved",
  "incorporated",
];

export type WikiTenant = {
  id: string;
  slug: string;
  name: string;
  gameSlug: string;
  gameTitle: string;
};

export type WikiCategorySummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  pageCount: number;
};

export type WikiPageBase = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  status: string;
  updatedAt: Date;
  publishedAt: Date | null;
};

/** A page as the index tables list it. */
export type WikiPageSummary = WikiPageBase & {
  /** The page's first category by sort order; null means the page is uncategorized. */
  category: { slug: string; name: string } | null;
  sourceCount: number;
};

/** One row of the home "Recently changed" list: a page's latest published revision. */
export type WikiRecentChange = {
  slug: string;
  title: string;
  revisionNumber: number;
  changeNote: string | null;
  createdAt: Date;
};

export type WikiPageRevisionSummary = {
  id: string;
  revisionNumber: number;
  changeNote: string | null;
  aiProvenance: WikiPageRevisionAiProvenance | null;
  createdBy: string | null;
  createdAt: Date;
};

export type WikiSourceReference = {
  id: string;
  sourceKey: string | null;
  sourceType: string;
  title: string;
  url: string | null;
  publisher: string | null;
  contextText: string | null;
  topicSlugs: string[];
  retrievedAt: Date | null;
  metadata: WikiSourceMetadata | null;
};

export type WikiPageDetail = WikiPageBase & {
  bodyMarkdown: string;
  latestRevisionNumber: number;
  latestRevision: WikiPageRevisionSummary | null;
  categories: Array<Pick<WikiCategorySummary, "id" | "slug" | "name">>;
  tags: Array<{
    id: string;
    slug: string;
    name: string;
  }>;
  sources: Array<{
    id: string;
    sourceType: string;
    title: string;
    url: string | null;
    publisher: string | null;
    sourceKey: string | null;
    retrievedAt: Date | null;
    metadata: WikiSourceMetadata | null;
  }>;
};

export type WikiHomeSnapshot = {
  tenant: WikiTenant;
  categories: WikiCategorySummary[];
  pages: WikiPageSummary[];
  recentChanges: WikiRecentChange[];
  /** The most recent source check across the wiki, or null when no source has a retrieval date. */
  sourcesCheckedAt: Date | null;
};

export type WikiCategorySnapshot = {
  tenant: WikiTenant;
  category: WikiCategorySummary;
  categories: WikiCategorySummary[];
  pages: WikiPageSummary[];
  sourcesCheckedAt: Date | null;
};

export type WikiPageSnapshot = {
  tenant: WikiTenant;
  categories: WikiCategorySummary[];
  page: WikiPageDetail;
};

export type WikiSitemapEntry = {
  routeType: "tenant" | "pages" | "category" | "page";
  tenantSlug: string;
  pageSlug: string | null;
  categorySlug: string | null;
  updatedAt: Date | null;
};

export type WikiSuggestionStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "changes_requested";

export type WikiSuggestionType = "new_page" | "edit_page";

export type WikiCommunityNoteStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "incorporated";

export type WikiCommunityNoteType =
  | "general"
  | "correction"
  | "source"
  | "clarification"
  | "dispute";

export type WikiSuggestionMetadata = {
  createdByEmail?: string | null;
  origin?: "human" | "ai_generated";
  ai?: {
    provider: string;
    model: string;
    responseId: string | null;
    promptVersion: string;
    generatedAt: string;
    requestedBy: string;
    sourceNotes?: string | null;
  };
  [key: string]: unknown;
};

export type WikiCommunityNoteMetadata = {
  createdByEmail?: string | null;
  origin?: "human" | "ai_generated";
  [key: string]: unknown;
};

export type WikiPageRevisionAiProvenance = {
  provider: string;
  modelId: string;
  promptVersion: string;
  generatedAt: string;
  responseId: string | null;
  sourceContextSummary: string;
  sourceReferences?: Array<{
    sourceId: string;
    sourceKey: string | null;
    sourceType: string;
    title: string;
    url: string | null;
    publisher: string | null;
    authorityTier?: string | null;
    authorityScore?: number | null;
  }>;
  claimSupport?: Array<{
    claimId: string;
    claimText: string;
    status: "supported" | "unsupported" | "contradicted";
    supportScore: number;
    matchedTerms: string[];
    missingTerms: string[];
    matchedSourceIds: string[];
    matchedSourceKeys: Array<string | null>;
    matchedSourceTitles: string[];
    reason: string;
  }>;
  refreshReason: string;
  requestedBy: string;
  [key: string]: unknown;
};

export type WikiSuggestionSummary = {
  id: string;
  tenantId: string;
  tenantSlug: string;
  pageId: string | null;
  pageSlug: string | null;
  status: string;
  suggestionType: string;
  targetSlug: string;
  title: string;
  summary: string | null;
  bodyMarkdown: string;
  sourceUrl: string | null;
  reviewNote: string | null;
  metadata: WikiSuggestionMetadata | null;
  createdBy: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SaveWikiPageInput = {
  tenantId: string;
  slug: string;
  title: string;
  bodyMarkdown: string;
  summary?: string | null;
  status?: "draft" | "published" | "archived";
  actorId?: string | null;
  changeNote?: string | null;
  aiProvenance?: WikiPageRevisionAiProvenance | null;
  sourceReferences?: WikiSourceReference[];
  /** Files the page under this category when it has none yet; an existing category is never changed. */
  categorySlug?: string | null;
};

export type CreateWikiSuggestionInput = {
  tenantId: string;
  pageId?: string | null;
  suggestionType: WikiSuggestionType;
  targetSlug: string;
  title: string;
  summary?: string | null;
  bodyMarkdown: string;
  sourceUrl?: string | null;
  metadata?: WikiSuggestionMetadata | null;
  actorId: string;
  actorEmail?: string | null;
};

export type CreateWikiCommunityNoteInput = {
  tenantId: string;
  pageId: string;
  bodyMarkdown: string;
  sourceUrl?: string | null;
  targetQuote?: string | null;
  noteType?: WikiCommunityNoteType | string;
  metadata?: WikiCommunityNoteMetadata | null;
  actorId: string;
  actorEmail?: string | null;
};

export type WikiCommunityNoteSummary = {
  id: string;
  tenantId: string;
  tenantSlug: string;
  pageId: string;
  pageSlug: string;
  pageTitle: string;
  status: string;
  noteType: string;
  bodyMarkdown: string;
  sourceUrl: string | null;
  targetQuote: string | null;
  reviewNote: string | null;
  metadata: WikiCommunityNoteMetadata | null;
  createdBy: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function getWikiTenantBySlug(
  slug: string,
  db: WikiDatabase = getDb(),
): Promise<WikiTenant | null> {
  const tenant = await db
    .selectFrom("tenants")
    .innerJoin("games", "games.id", "tenants.game_id")
    .select([
      "tenants.id as id",
      "tenants.slug as slug",
      "tenants.name as name",
      "games.slug as gameSlug",
      "games.title as gameTitle",
    ])
    .where("tenants.slug", "=", slug)
    .where("tenants.status", "=", "active")
    .executeTakeFirst();

  return tenant ?? null;
}

export async function listWikiCategoriesByTenant(
  tenantId: string,
  db: WikiDatabase = getDb(),
): Promise<WikiCategorySummary[]> {
  const categories = await db
    .selectFrom("wiki_categories as category")
    .leftJoin("wiki_page_categories as page_category", (join) =>
      join
        .onRef("page_category.category_id", "=", "category.id")
        .onRef("page_category.tenant_id", "=", "category.tenant_id"),
    )
    .leftJoin("wiki_pages as page", (join) =>
      join
        .onRef("page.id", "=", "page_category.page_id")
        .onRef("page.tenant_id", "=", "page_category.tenant_id")
        .on("page.status", "=", "published"),
    )
    .select([
      "category.id as id",
      "category.slug as slug",
      "category.name as name",
      "category.description as description",
      "category.sort_order as sortOrder",
      sql<number>`cast(count(page.id) as integer)`.as("pageCount"),
    ])
    .where("category.tenant_id", "=", tenantId)
    .groupBy([
      "category.id",
      "category.slug",
      "category.name",
      "category.description",
      "category.sort_order",
    ])
    .orderBy("category.sort_order", "asc")
    .orderBy("category.name", "asc")
    .execute();

  return categories;
}

export async function listPublishedWikiPagesByTenant(
  tenantId: string,
  db: WikiDatabase = getDb(),
  limit = 20,
): Promise<WikiPageSummary[]> {
  const pages = await db
    .selectFrom("wiki_pages")
    .select([
      "id",
      "slug",
      "title",
      "summary",
      "status",
      "updated_at as updatedAt",
      "published_at as publishedAt",
    ])
    .where("tenant_id", "=", tenantId)
    .where("status", "=", "published")
    .orderBy("title", "asc")
    .limit(limit)
    .execute();

  return withIndexFacts(tenantId, pages, db);
}

/** Adds each page's first category and its source count, the columns the index tables show. */
async function withIndexFacts(
  tenantId: string,
  pages: WikiPageBase[],
  db: WikiDatabase,
): Promise<WikiPageSummary[]> {
  if (pages.length === 0) return [];
  const ids = pages.map((page) => page.id);
  const [categories, sources] = await Promise.all([
    db
      .selectFrom("wiki_page_categories as page_category")
      .innerJoin("wiki_categories as category", (join) =>
        join.onRef("category.id", "=", "page_category.category_id").onRef("category.tenant_id", "=", "page_category.tenant_id"),
      )
      .select(["page_category.page_id as pageId", "category.slug as slug", "category.name as name"])
      .where("page_category.tenant_id", "=", tenantId)
      .where("page_category.page_id", "in", ids)
      .orderBy("category.sort_order", "asc")
      .orderBy("category.name", "asc")
      .execute(),
    // Same count as the article's trust strip: the latest revision's cited references, else the page's sources.
    db
      .selectFrom("wiki_pages as page")
      .leftJoin("wiki_page_revisions as revision", (join) =>
        join
          .onRef("revision.page_id", "=", "page.id")
          .onRef("revision.tenant_id", "=", "page.tenant_id")
          .onRef("revision.revision_number", "=", "page.latest_revision_number"),
      )
      .select([
        "page.id as pageId",
        sql<number>`cast(coalesce(
          case when jsonb_typeof(revision.ai_provenance->'sourceReferences') = 'array' and jsonb_array_length(revision.ai_provenance->'sourceReferences') > 0
            then jsonb_array_length(revision.ai_provenance->'sourceReferences') end,
          (select count(*) from wiki_sources source where source.page_id = page.id and source.tenant_id = page.tenant_id)
        ) as integer)`.as("count"),
      ])
      .where("page.tenant_id", "=", tenantId)
      .where("page.id", "in", ids)
      .execute(),
  ]);
  return pages.map((page) => {
    const category = categories.find((row) => row.pageId === page.id);
    return {
      ...page,
      category: category ? { slug: category.slug, name: category.name } : null,
      sourceCount: sources.find((row) => row.pageId === page.id)?.count ?? 0,
    };
  });
}

/** The latest published revision of the most recently changed pages. */
export async function listRecentWikiChanges(tenantId: string, db: WikiDatabase = getDb(), limit = 5): Promise<WikiRecentChange[]> {
  return db
    .selectFrom("wiki_pages as page")
    .innerJoin("wiki_page_revisions as revision", (join) =>
      join
        .onRef("revision.page_id", "=", "page.id")
        .onRef("revision.tenant_id", "=", "page.tenant_id")
        .onRef("revision.revision_number", "=", "page.latest_revision_number"),
    )
    .select([
      "page.slug as slug",
      "page.title as title",
      "revision.revision_number as revisionNumber",
      "revision.change_note as changeNote",
      "revision.created_at as createdAt",
    ])
    .where("page.tenant_id", "=", tenantId)
    .where("page.status", "=", "published")
    .orderBy("revision.created_at", "desc")
    .orderBy("page.title", "asc")
    .limit(limit)
    .execute();
}

/** The latest retrieval date across the given pages' sources (all published pages when omitted). */
export async function getLatestSourceCheck(tenantId: string, db: WikiDatabase = getDb(), pageIds?: string[]): Promise<Date | null> {
  if (pageIds && pageIds.length === 0) return null;
  let query = db
    .selectFrom("wiki_sources as source")
    .innerJoin("wiki_pages as page", (join) => join.onRef("page.id", "=", "source.page_id").onRef("page.tenant_id", "=", "source.tenant_id"))
    .select(sql<Date | null>`max(source.retrieved_at)`.as("latest"))
    .where("source.tenant_id", "=", tenantId)
    .where("page.status", "=", "published");
  if (pageIds) query = query.where("page.id", "in", pageIds);
  const row = await query.executeTakeFirst();
  return row?.latest ? new Date(row.latest) : null;
}

/** Everything the search index needs for each published page: body for headings, first category, tags. */
export async function listWikiSearchSources(tenantId: string, db: WikiDatabase = getDb()) {
  const [pages, categories, tags] = await Promise.all([
    db
      .selectFrom("wiki_pages")
      .select(["id", "slug", "title", "summary", "body_markdown as bodyMarkdown"])
      .where("tenant_id", "=", tenantId)
      .where("status", "=", "published")
      .orderBy("title", "asc")
      .execute(),
    db
      .selectFrom("wiki_page_categories as page_category")
      .innerJoin("wiki_categories as category", (join) =>
        join.onRef("category.id", "=", "page_category.category_id").onRef("category.tenant_id", "=", "page_category.tenant_id"),
      )
      .select(["page_category.page_id as pageId", "category.name as name"])
      .where("page_category.tenant_id", "=", tenantId)
      .orderBy("category.sort_order", "asc")
      .execute(),
    db
      .selectFrom("wiki_page_tags as page_tag")
      .innerJoin("wiki_tags as tag", (join) => join.onRef("tag.id", "=", "page_tag.tag_id").onRef("tag.tenant_id", "=", "page_tag.tenant_id"))
      .select(["page_tag.page_id as pageId", "tag.name as name"])
      .where("page_tag.tenant_id", "=", tenantId)
      .execute(),
  ]);

  return pages.map(({ id, ...page }) => ({
    ...page,
    category: categories.find((category) => category.pageId === id)?.name ?? null,
    tags: tags.filter((tag) => tag.pageId === id).map((tag) => tag.name),
  }));
}

export async function getWikiCategoryBySlug(
  tenantId: string,
  slug: string,
  db: WikiDatabase = getDb(),
): Promise<WikiCategorySummary | null> {
  const category = await db
    .selectFrom("wiki_categories as category")
    .leftJoin("wiki_page_categories as page_category", (join) =>
      join
        .onRef("page_category.category_id", "=", "category.id")
        .onRef("page_category.tenant_id", "=", "category.tenant_id"),
    )
    .leftJoin("wiki_pages as page", (join) =>
      join
        .onRef("page.id", "=", "page_category.page_id")
        .onRef("page.tenant_id", "=", "page_category.tenant_id")
        .on("page.status", "=", "published"),
    )
    .select([
      "category.id as id",
      "category.slug as slug",
      "category.name as name",
      "category.description as description",
      "category.sort_order as sortOrder",
      sql<number>`cast(count(page.id) as integer)`.as("pageCount"),
    ])
    .where("category.tenant_id", "=", tenantId)
    .where("category.slug", "=", slug)
    .groupBy([
      "category.id",
      "category.slug",
      "category.name",
      "category.description",
      "category.sort_order",
    ])
    .executeTakeFirst();

  return category ?? null;
}

export async function listPublishedWikiPagesByCategory(
  tenantId: string,
  categoryId: string,
  db: WikiDatabase = getDb(),
  limit = 100,
): Promise<WikiPageSummary[]> {
  const pages = await db
    .selectFrom("wiki_page_categories as page_category")
    .innerJoin("wiki_pages as page", (join) =>
      join
        .onRef("page.id", "=", "page_category.page_id")
        .onRef("page.tenant_id", "=", "page_category.tenant_id"),
    )
    .select([
      "page.id as id",
      "page.slug as slug",
      "page.title as title",
      "page.summary as summary",
      "page.status as status",
      "page.updated_at as updatedAt",
      "page.published_at as publishedAt",
    ])
    .where("page_category.tenant_id", "=", tenantId)
    .where("page_category.category_id", "=", categoryId)
    .where("page.status", "=", "published")
    .orderBy("page.title", "asc")
    .limit(limit)
    .execute();

  return withIndexFacts(tenantId, pages, db);
}

export async function getPublishedWikiPageBySlug(
  tenantId: string,
  slug: string,
  db: WikiDatabase = getDb(),
): Promise<WikiPageDetail | null> {
  const page = await db
    .selectFrom("wiki_pages")
    .select([
      "id",
      "slug",
      "title",
      "summary",
      "body_markdown as bodyMarkdown",
      "status",
      "latest_revision_number as latestRevisionNumber",
      "updated_at as updatedAt",
      "published_at as publishedAt",
    ])
    .where("tenant_id", "=", tenantId)
    .where("slug", "=", slug)
    .where("status", "=", "published")
    .executeTakeFirst();

  if (!page) {
    return null;
  }

  const latestRevision = await db
    .selectFrom("wiki_page_revisions")
    .select([
      "id",
      "revision_number as revisionNumber",
      "change_note as changeNote",
      "ai_provenance as aiProvenance",
      "created_by as createdBy",
      "created_at as createdAt",
    ])
    .where("tenant_id", "=", tenantId)
    .where("page_id", "=", page.id)
    .where("revision_number", "=", page.latestRevisionNumber)
    .executeTakeFirst();

  const categories = await db
    .selectFrom("wiki_page_categories as page_category")
    .innerJoin("wiki_categories as category", (join) =>
      join
        .onRef("category.id", "=", "page_category.category_id")
        .onRef("category.tenant_id", "=", "page_category.tenant_id"),
    )
    .select(["category.id", "category.slug", "category.name"])
    .where("page_category.tenant_id", "=", tenantId)
    .where("page_category.page_id", "=", page.id)
    .orderBy("category.sort_order", "asc")
    .execute();

  const tags = await db
    .selectFrom("wiki_page_tags as page_tag")
    .innerJoin("wiki_tags as tag", (join) =>
      join
        .onRef("tag.id", "=", "page_tag.tag_id")
        .onRef("tag.tenant_id", "=", "page_tag.tenant_id"),
    )
    .select(["tag.id", "tag.slug", "tag.name"])
    .where("page_tag.tenant_id", "=", tenantId)
    .where("page_tag.page_id", "=", page.id)
    .orderBy("tag.name", "asc")
    .execute();

  const sources = await db
    .selectFrom("wiki_sources")
    .select([
      "id",
      "source_type as sourceType",
      "title",
      "url",
      "publisher",
      "source_key as sourceKey",
      "retrieved_at as retrievedAt",
      "metadata",
    ])
    .where("tenant_id", "=", tenantId)
    .where("page_id", "=", page.id)
    .where((eb) =>
      eb.or([
        eb("revision_id", "is", null),
        latestRevision ? eb("revision_id", "=", latestRevision.id) : eb("id", "=", ""),
      ]),
    )
    .orderBy("title", "asc")
    .execute();

  return {
    ...page,
    latestRevision: latestRevision
      ? {
          ...latestRevision,
          aiProvenance: normalizeRevisionAiProvenance(
            latestRevision.aiProvenance,
          ),
        }
      : null,
    categories,
    tags,
    sources: sources.map((source) => ({
      ...source,
      metadata: normalizeWikiSourceMetadata(source.metadata),
    })),
  };
}

export type WikiPageRevisionDetail = WikiPageRevisionSummary & {
  title: string;
  summary: string | null;
  bodyMarkdown: string;
};

/** Every revision of a page, newest first, for the public History and diff views. */
export async function listWikiPageRevisions(
  tenantId: string,
  pageId: string,
  db: WikiDatabase = getDb(),
): Promise<WikiPageRevisionDetail[]> {
  const revisions = await db
    .selectFrom("wiki_page_revisions")
    .select([
      "id",
      "revision_number as revisionNumber",
      "title",
      "summary",
      "body_markdown as bodyMarkdown",
      "change_note as changeNote",
      "ai_provenance as aiProvenance",
      "created_by as createdBy",
      "created_at as createdAt",
    ])
    .where("tenant_id", "=", tenantId)
    .where("page_id", "=", pageId)
    .orderBy("revision_number", "desc")
    .execute();

  return revisions.map((revision) => ({
    ...revision,
    aiProvenance: normalizeRevisionAiProvenance(revision.aiProvenance),
  }));
}

export async function getWikiPageById(
  tenantId: string,
  pageId: string,
  db: WikiDatabase = getDb(),
): Promise<WikiPageDetail | null> {
  const page = await db
    .selectFrom("wiki_pages")
    .select([
      "id",
      "slug",
      "title",
      "summary",
      "body_markdown as bodyMarkdown",
      "status",
      "latest_revision_number as latestRevisionNumber",
      "updated_at as updatedAt",
      "published_at as publishedAt",
    ])
    .where("tenant_id", "=", tenantId)
    .where("id", "=", pageId)
    .executeTakeFirst();

  if (!page) {
    return null;
  }

  return {
    ...page,
    latestRevision: null,
    categories: [],
    tags: [],
    sources: [],
  };
}

export async function getWikiHomeSnapshot(
  tenantSlug = MARATHON_TENANT_SLUG,
  db: WikiDatabase = getDb(),
): Promise<WikiHomeSnapshot | null> {
  const tenant = await getWikiTenantBySlug(tenantSlug, db);

  if (!tenant) {
    return null;
  }

  const [categories, pages, recentChanges, sourcesCheckedAt] = await Promise.all([
    listWikiCategoriesByTenant(tenant.id, db),
    listPublishedWikiPagesByTenant(tenant.id, db, 500),
    listRecentWikiChanges(tenant.id, db),
    getLatestSourceCheck(tenant.id, db),
  ]);

  return {
    tenant,
    categories,
    pages,
    recentChanges,
    sourcesCheckedAt,
  };
}

export async function getWikiCategorySnapshot(
  tenantSlug: string,
  categorySlug: string,
  db: WikiDatabase = getDb(),
): Promise<WikiCategorySnapshot | null> {
  const tenant = await getWikiTenantBySlug(tenantSlug, db);

  if (!tenant) {
    return null;
  }

  const category = await getWikiCategoryBySlug(tenant.id, categorySlug, db);

  if (!category) {
    return null;
  }

  const [categories, pages] = await Promise.all([
    listWikiCategoriesByTenant(tenant.id, db),
    listPublishedWikiPagesByCategory(tenant.id, category.id, db),
  ]);
  const sourcesCheckedAt = await getLatestSourceCheck(tenant.id, db, pages.map((page) => page.id));

  return {
    tenant,
    category,
    categories,
    pages,
    sourcesCheckedAt,
  };
}

export async function getWikiPageSnapshot(
  tenantSlug: string,
  pageSlug: string,
  db: WikiDatabase = getDb(),
): Promise<WikiPageSnapshot | null> {
  const tenant = await getWikiTenantBySlug(tenantSlug, db);

  if (!tenant) {
    return null;
  }

  const [categories, page] = await Promise.all([
    listWikiCategoriesByTenant(tenant.id, db),
    getPublishedWikiPageBySlug(tenant.id, pageSlug, db),
  ]);

  if (!page) {
    return null;
  }

  return {
    tenant,
    categories,
    page,
  };
}

/**
 * When each of these sources was last read for this wiki: any stored retrieved_at (snapshot
 * refetch, generation load, or paraphrase load) and, once the daily re-fetch runs, its last check.
 */
export async function listSourceCheckTimes(tenantId: string, sourceKeys: string[], db: WikiDatabase = getDb()): Promise<Date[]> {
  if (sourceKeys.length === 0) return [];
  const rows = await db
    .selectFrom("wiki_sources")
    .select([sql<Date | null>`retrieved_at at time zone 'UTC'`.as("retrievedAt"), sql<string | null>`metadata->>'httpCheckedAt'`.as("httpCheckedAt")])
    .where("tenant_id", "=", tenantId)
    .where("source_key", "in", sourceKeys)
    .execute();
  return rows.flatMap((row) => [row.retrievedAt, row.httpCheckedAt].flatMap((value) => (value ? [new Date(value)] : [])));
}

/** When each source was last ingested: its latest stored snapshot, else the latest row citing it. */
export async function listSourceIngestTimes(tenantId: string, sourceKeys: string[], db: WikiDatabase = getDb()): Promise<Map<string, Date>> {
  if (sourceKeys.length === 0) return new Map();
  const rows = await db
    .selectFrom("wiki_sources")
    .select([
      "source_key as sourceKey",
      sql<Date | null>`max(retrieved_at) filter (where metadata->>'origin' = 'rendered_snapshot') at time zone 'UTC'`.as("snapshotAt"),
      sql<Date | null>`max(retrieved_at) at time zone 'UTC'`.as("anyAt"),
    ])
    .where("tenant_id", "=", tenantId)
    .where("source_key", "in", sourceKeys)
    .groupBy("source_key")
    .execute();
  return new Map(rows.flatMap((row) => {
    const at = row.snapshotAt ?? row.anyAt;
    return at ? [[row.sourceKey, new Date(at)] as [string, Date]] : [];
  }));
}

export async function listWikiSourceContextForTopic(
  input: {
    tenantId: string;
    targetSlug: string;
    pageTitle: string;
    limit?: number;
  },
  db: WikiDatabase = getDb(),
): Promise<WikiSourceReference[]> {
  const targetSlug = normalizeWikiSlug(input.targetSlug);

  if (!targetSlug) {
    return [];
  }

  const titlePattern = `%${input.pageTitle.trim().toLowerCase()}%`;

  const sources = await db
    .selectFrom("wiki_sources as source")
    .select([
      "source.id as id",
      "source.source_key as sourceKey",
      "source.source_type as sourceType",
      "source.title as title",
      "source.url as url",
      "source.publisher as publisher",
      "source.context_text as contextText",
      "source.topic_slugs as topicSlugs",
      "source.retrieved_at as retrievedAt",
      "source.metadata as metadata",
    ])
    .where("source.tenant_id", "=", input.tenantId)
    .where("source.context_text", "is not", null)
    .where((eb) =>
      eb.or([
        eb("source.metadata", "is", null),
        sql<boolean>`coalesce(${sql.ref("source.metadata")}->>'origin', '') <> 'canonical_generation_context'`,
      ]),
    )
    .where((eb) =>
      eb.or([
        eb("source.source_key", "=", targetSlug),
        sql<boolean>`${targetSlug} = any(${sql.ref("source.topic_slugs")})`,
        sql<boolean>`lower(${sql.ref("source.title")}) like ${titlePattern}`,
      ]),
    )
    .orderBy(
      sql<number>`case
        when ${targetSlug} = any(${sql.ref("source.topic_slugs")}) then 0
        when ${sql.ref("source.source_key")} = ${targetSlug} then 1
        else 2
      end`,
      "asc",
    )
    .orderBy(
      sql<number>`coalesce((${sql.ref("source.metadata")}->>'authorityScore')::integer, 0)`,
      "desc",
    )
    .orderBy("source.title", "asc")
    .limit(input.limit ?? 6)
    .execute();

  return sources.map((source) => ({
    ...source,
    topicSlugs: source.topicSlugs ?? [],
    metadata: normalizeWikiSourceMetadata(source.metadata),
  }));
}

export async function createWikiCommunityNote(
  input: CreateWikiCommunityNoteInput,
  db: WikiDatabase = getDb(),
): Promise<WikiCommunityNoteSummary> {
  const bodyMarkdown = input.bodyMarkdown.trim();

  if (bodyMarkdown.length < 3) {
    throw new Error("Community note body is required.");
  }

  const page = await db
    .selectFrom("wiki_pages")
    .select("id")
    .where("tenant_id", "=", input.tenantId)
    .where("id", "=", input.pageId)
    .executeTakeFirst();

  if (!page) {
    throw new Error("Community notes must target a page in the same tenant.");
  }

  const note = await db
    .insertInto("wiki_community_notes")
    .values({
      id: createId("community_note"),
      tenant_id: input.tenantId,
      page_id: input.pageId,
      status: "pending",
      note_type: input.noteType?.trim() || "general",
      body_markdown: bodyMarkdown,
      source_url: input.sourceUrl?.trim() || null,
      target_quote: input.targetQuote?.trim() || null,
      created_by: input.actorId,
      metadata: {
        ...(input.metadata ?? {}),
        createdByEmail: input.actorEmail ?? null,
      },
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return getWikiCommunityNoteById(input.tenantId, note.id, db);
}

export async function listPublicWikiCommunityNotesForPage(
  input: {
    tenantId: string;
    pageId: string;
  },
  db: WikiDatabase = getDb(),
): Promise<WikiCommunityNoteSummary[]> {
  const notes = await db
    .selectFrom("wiki_community_notes as note")
    .innerJoin("tenants as tenant", "tenant.id", "note.tenant_id")
    .innerJoin("wiki_pages as page", (join) =>
      join
        .onRef("page.id", "=", "note.page_id")
        .onRef("page.tenant_id", "=", "note.tenant_id"),
    )
    .select([
      "note.id as id",
      "note.tenant_id as tenantId",
      "tenant.slug as tenantSlug",
      "note.page_id as pageId",
      "page.slug as pageSlug",
      "page.title as pageTitle",
      "note.status as status",
      "note.note_type as noteType",
      "note.body_markdown as bodyMarkdown",
      "note.source_url as sourceUrl",
      "note.target_quote as targetQuote",
      "note.review_note as reviewNote",
      "note.metadata as metadata",
      "note.created_by as createdBy",
      "note.reviewed_by as reviewedBy",
      "note.reviewed_at as reviewedAt",
      "note.created_at as createdAt",
      "note.updated_at as updatedAt",
    ])
    .where("note.tenant_id", "=", input.tenantId)
    .where("note.page_id", "=", input.pageId)
    .where("note.status", "in", WIKI_COMMUNITY_NOTE_PUBLIC_STATUSES)
    .orderBy("note.reviewed_at", "desc")
    .orderBy("note.created_at", "desc")
    .execute();

  return notes.map(mapWikiCommunityNoteSummary);
}

export async function listWikiCommunityNotesForReview(
  tenantId: string,
  db: WikiDatabase = getDb(),
): Promise<WikiCommunityNoteSummary[]> {
  const notes = await db
    .selectFrom("wiki_community_notes as note")
    .innerJoin("tenants as tenant", "tenant.id", "note.tenant_id")
    .innerJoin("wiki_pages as page", (join) =>
      join
        .onRef("page.id", "=", "note.page_id")
        .onRef("page.tenant_id", "=", "note.tenant_id"),
    )
    .select([
      "note.id as id",
      "note.tenant_id as tenantId",
      "tenant.slug as tenantSlug",
      "note.page_id as pageId",
      "page.slug as pageSlug",
      "page.title as pageTitle",
      "note.status as status",
      "note.note_type as noteType",
      "note.body_markdown as bodyMarkdown",
      "note.source_url as sourceUrl",
      "note.target_quote as targetQuote",
      "note.review_note as reviewNote",
      "note.metadata as metadata",
      "note.created_by as createdBy",
      "note.reviewed_by as reviewedBy",
      "note.reviewed_at as reviewedAt",
      "note.created_at as createdAt",
      "note.updated_at as updatedAt",
    ])
    .where("note.tenant_id", "=", tenantId)
    .orderBy(sql`case note.status
      when 'pending' then 0
      when 'approved' then 1
      when 'incorporated' then 2
      when 'rejected' then 3
      else 4
    end`)
    .orderBy("note.created_at", "desc")
    .execute();

  return notes.map(mapWikiCommunityNoteSummary);
}

export async function getWikiCommunityNoteById(
  tenantId: string,
  noteId: string,
  db: WikiDatabase = getDb(),
): Promise<WikiCommunityNoteSummary> {
  const note = await db
    .selectFrom("wiki_community_notes as note")
    .innerJoin("tenants as tenant", "tenant.id", "note.tenant_id")
    .innerJoin("wiki_pages as page", (join) =>
      join
        .onRef("page.id", "=", "note.page_id")
        .onRef("page.tenant_id", "=", "note.tenant_id"),
    )
    .select([
      "note.id as id",
      "note.tenant_id as tenantId",
      "tenant.slug as tenantSlug",
      "note.page_id as pageId",
      "page.slug as pageSlug",
      "page.title as pageTitle",
      "note.status as status",
      "note.note_type as noteType",
      "note.body_markdown as bodyMarkdown",
      "note.source_url as sourceUrl",
      "note.target_quote as targetQuote",
      "note.review_note as reviewNote",
      "note.metadata as metadata",
      "note.created_by as createdBy",
      "note.reviewed_by as reviewedBy",
      "note.reviewed_at as reviewedAt",
      "note.created_at as createdAt",
      "note.updated_at as updatedAt",
    ])
    .where("note.tenant_id", "=", tenantId)
    .where("note.id", "=", noteId)
    .executeTakeFirstOrThrow();

  return mapWikiCommunityNoteSummary(note);
}

export async function updateWikiCommunityNoteModerationStatus(
  input: {
    tenantId: string;
    noteId: string;
    status: Exclude<WikiCommunityNoteStatus, "pending">;
    actorId: string;
    reviewNote?: string | null;
  },
  db: Kysely<DB> = getDb(),
): Promise<WikiCommunityNoteSummary> {
  return db.transaction().execute(async (trx) => {
    const note = await getWikiCommunityNoteById(input.tenantId, input.noteId, trx);
    const allowedCurrentStatuses =
      input.status === "incorporated" ? ["pending", "approved"] : ["pending"];

    if (!allowedCurrentStatuses.includes(note.status)) {
      throw new Error(
        `Cannot mark a ${note.status} community note as ${input.status}.`,
      );
    }

    await trx
      .updateTable("wiki_community_notes")
      .set({
        status: input.status,
        reviewed_by: input.actorId,
        reviewed_at: sql`CURRENT_TIMESTAMP`,
        review_note: input.reviewNote ?? null,
        updated_at: sql`CURRENT_TIMESTAMP`,
      })
      .where("tenant_id", "=", input.tenantId)
      .where("id", "=", input.noteId)
      .executeTakeFirstOrThrow();

    return getWikiCommunityNoteById(input.tenantId, input.noteId, trx);
  });
}

export async function listWikiCommunityNoteContextForPage(
  input: {
    tenantId: string;
    pageId?: string | null;
    targetSlug?: string | null;
    limit?: number;
  },
  db: WikiDatabase = getDb(),
): Promise<WikiSourceReference[]> {
  const targetSlug = input.targetSlug
    ? normalizeWikiSlug(input.targetSlug)
    : null;

  if (!input.pageId && !targetSlug) {
    return [];
  }

  let pageQuery = db
    .selectFrom("wiki_pages")
    .select(["id", "slug", "title"])
    .where("tenant_id", "=", input.tenantId);

  if (input.pageId) {
    pageQuery = pageQuery.where("id", "=", input.pageId);
  }

  if (targetSlug) {
    pageQuery = pageQuery.where("slug", "=", targetSlug);
  }

  const page = await pageQuery.executeTakeFirst();

  if (!page) {
    return [];
  }

  const notes = await db
    .selectFrom("wiki_community_notes as note")
    .select([
      "note.id as id",
      "note.status as status",
      "note.note_type as noteType",
      "note.body_markdown as bodyMarkdown",
      "note.source_url as sourceUrl",
      "note.target_quote as targetQuote",
      "note.review_note as reviewNote",
      "note.created_by as createdBy",
      "note.reviewed_by as reviewedBy",
      "note.reviewed_at as reviewedAt",
      "note.created_at as createdAt",
      "note.updated_at as updatedAt",
    ])
    .where("note.tenant_id", "=", input.tenantId)
    .where("note.page_id", "=", page.id)
    .where("note.status", "in", WIKI_COMMUNITY_NOTE_PUBLIC_STATUSES)
    .orderBy(sql`case note.status
      when 'incorporated' then 0
      when 'approved' then 1
      else 2
    end`)
    .orderBy("note.reviewed_at", "desc")
    .orderBy("note.created_at", "desc")
    .limit(input.limit ?? 6)
    .execute();

  return notes.map((note) => ({
    id: note.id,
    sourceKey: page.slug,
    sourceType: "community_note",
    title: `${formatCommunityNoteType(note.noteType)} community note for ${page.title}`,
    url: note.sourceUrl,
    publisher: "Community note",
    contextText: buildCommunityNoteContextText(note),
    topicSlugs: [page.slug],
    retrievedAt: note.reviewedAt ?? note.updatedAt,
    metadata: {
      origin: "community_note",
      authorityTier: "community",
      authorityScore: note.status === "incorporated" ? 45 : 35,
      communityNoteId: note.id,
      communityNoteStatus: note.status,
      noteType: note.noteType,
      targetQuote: note.targetQuote,
      reviewNote: note.reviewNote,
      createdBy: note.createdBy,
      reviewedBy: note.reviewedBy,
      reviewedAt: note.reviewedAt?.toISOString() ?? null,
      createdAt: note.createdAt.toISOString(),
    },
  }));
}

export async function listWikiSitemapEntries(
  db: WikiDatabase = getDb(),
): Promise<WikiSitemapEntry[]> {
  const tenants = await db
    .selectFrom("tenants")
    .select([
      "tenants.slug as tenantSlug",
      "tenants.updated_at as updatedAt",
    ])
    .where("tenants.status", "=", "active")
    .orderBy("tenants.slug", "asc")
    .execute();

  if (tenants.length === 0) {
    return [];
  }

  const tenantSlugs = tenants.map((tenant) => tenant.tenantSlug);
  const [categories, pages] = await Promise.all([
    db
      .selectFrom("wiki_categories as category")
      .innerJoin("tenants", "tenants.id", "category.tenant_id")
      .select([
        "tenants.slug as tenantSlug",
        "category.slug as categorySlug",
        "category.updated_at as updatedAt",
      ])
      .where("tenants.slug", "in", tenantSlugs)
      .where("tenants.status", "=", "active")
      .orderBy("tenants.slug", "asc")
      .orderBy("category.slug", "asc")
      .execute(),
    db
      .selectFrom("wiki_pages as page")
      .innerJoin("tenants", "tenants.id", "page.tenant_id")
      .select([
        "tenants.slug as tenantSlug",
        "page.slug as pageSlug",
        "page.updated_at as updatedAt",
      ])
      .where("tenants.slug", "in", tenantSlugs)
      .where("tenants.status", "=", "active")
      .where("page.status", "=", "published")
      .orderBy("tenants.slug", "asc")
      .orderBy("page.slug", "asc")
      .execute(),
  ]);

  return [
    ...tenants.flatMap((tenant) => [
      {
        routeType: "tenant" as const,
        tenantSlug: tenant.tenantSlug,
        pageSlug: null,
        categorySlug: null,
        updatedAt: tenant.updatedAt,
      },
      {
        routeType: "pages" as const,
        tenantSlug: tenant.tenantSlug,
        pageSlug: null,
        categorySlug: null,
        updatedAt: tenant.updatedAt,
      },
    ]),
    ...categories.map((category) => ({
      routeType: "category" as const,
      tenantSlug: category.tenantSlug,
      pageSlug: null,
      categorySlug: category.categorySlug,
      updatedAt: category.updatedAt,
    })),
    ...pages.map((page) => ({
      routeType: "page" as const,
      tenantSlug: page.tenantSlug,
      pageSlug: page.pageSlug,
      categorySlug: null,
      updatedAt: page.updatedAt,
    })),
  ].filter((entry) => isTenantPubliclyEnabled(entry.tenantSlug));
}

export async function saveWikiPageWithRevision(
  input: SaveWikiPageInput,
  db: Kysely<DB> = getDb(),
): Promise<WikiPageDetail> {
  return db.transaction().execute((trx) => {
    return saveWikiPageWithRevisionInTransaction(input, trx);
  });
}

export async function createWikiSuggestion(
  input: CreateWikiSuggestionInput,
  db: Kysely<DB> = getDb(),
): Promise<WikiSuggestionSummary> {
  const targetSlug = normalizeWikiSlug(input.targetSlug);

  if (!targetSlug) {
    throw new Error("Suggestion target slug is required.");
  }

  const suggestion = await db
    .insertInto("wiki_suggestions")
    .values({
      id: createId("suggestion"),
      tenant_id: input.tenantId,
      page_id: input.pageId ?? null,
      status: "pending",
      suggestion_type: input.suggestionType,
      target_slug: targetSlug,
      title: input.title,
      summary: input.summary ?? null,
      body_markdown: input.bodyMarkdown,
      source_url: input.sourceUrl ?? null,
      created_by: input.actorId,
      metadata: {
        ...(input.metadata ?? {}),
        createdByEmail: input.actorEmail ?? null,
      },
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return getWikiSuggestionById(input.tenantId, suggestion.id, db);
}

export async function listWikiSuggestionsForReview(
  tenantId: string,
  db: WikiDatabase = getDb(),
): Promise<WikiSuggestionSummary[]> {
  const suggestions = await db
    .selectFrom("wiki_suggestions as suggestion")
    .innerJoin("tenants as tenant", "tenant.id", "suggestion.tenant_id")
    .leftJoin("wiki_pages as page", (join) =>
      join
        .onRef("page.id", "=", "suggestion.page_id")
        .onRef("page.tenant_id", "=", "suggestion.tenant_id"),
    )
    .select([
      "suggestion.id as id",
      "suggestion.tenant_id as tenantId",
      "tenant.slug as tenantSlug",
      "suggestion.page_id as pageId",
      "page.slug as pageSlug",
      "suggestion.status as status",
      "suggestion.suggestion_type as suggestionType",
      "suggestion.target_slug as targetSlug",
      "suggestion.title as title",
      "suggestion.summary as summary",
      "suggestion.body_markdown as bodyMarkdown",
      "suggestion.source_url as sourceUrl",
      "suggestion.review_note as reviewNote",
      "suggestion.metadata as metadata",
      "suggestion.created_by as createdBy",
      "suggestion.reviewed_by as reviewedBy",
      "suggestion.reviewed_at as reviewedAt",
      "suggestion.created_at as createdAt",
      "suggestion.updated_at as updatedAt",
    ])
    .where("suggestion.tenant_id", "=", tenantId)
    .orderBy(sql`case suggestion.status
      when 'pending' then 0
      when 'changes_requested' then 1
      when 'approved' then 2
      when 'rejected' then 3
      else 4
    end`)
    .orderBy("suggestion.created_at", "desc")
    .execute();

  return suggestions.map((suggestion) => ({
    ...suggestion,
    metadata: normalizeSuggestionMetadata(suggestion.metadata),
  }));
}

export async function getWikiSuggestionById(
  tenantId: string,
  suggestionId: string,
  db: WikiDatabase = getDb(),
): Promise<WikiSuggestionSummary> {
  const suggestion = await db
    .selectFrom("wiki_suggestions as suggestion")
    .innerJoin("tenants as tenant", "tenant.id", "suggestion.tenant_id")
    .leftJoin("wiki_pages as page", (join) =>
      join
        .onRef("page.id", "=", "suggestion.page_id")
        .onRef("page.tenant_id", "=", "suggestion.tenant_id"),
    )
    .select([
      "suggestion.id as id",
      "suggestion.tenant_id as tenantId",
      "tenant.slug as tenantSlug",
      "suggestion.page_id as pageId",
      "page.slug as pageSlug",
      "suggestion.status as status",
      "suggestion.suggestion_type as suggestionType",
      "suggestion.target_slug as targetSlug",
      "suggestion.title as title",
      "suggestion.summary as summary",
      "suggestion.body_markdown as bodyMarkdown",
      "suggestion.source_url as sourceUrl",
      "suggestion.review_note as reviewNote",
      "suggestion.metadata as metadata",
      "suggestion.created_by as createdBy",
      "suggestion.reviewed_by as reviewedBy",
      "suggestion.reviewed_at as reviewedAt",
      "suggestion.created_at as createdAt",
      "suggestion.updated_at as updatedAt",
    ])
    .where("suggestion.tenant_id", "=", tenantId)
    .where("suggestion.id", "=", suggestionId)
    .executeTakeFirstOrThrow();

  return {
    ...suggestion,
    metadata: normalizeSuggestionMetadata(suggestion.metadata),
  };
}

export async function updateWikiSuggestionReviewStatus(
  input: {
    tenantId: string;
    suggestionId: string;
    status: Extract<WikiSuggestionStatus, "rejected" | "changes_requested">;
    actorId: string;
    reviewNote?: string | null;
  },
  db: Kysely<DB> = getDb(),
): Promise<void> {
  await db
    .updateTable("wiki_suggestions")
    .set({
      status: input.status,
      reviewed_by: input.actorId,
      reviewed_at: sql`CURRENT_TIMESTAMP`,
      review_note: input.reviewNote ?? null,
      updated_at: sql`CURRENT_TIMESTAMP`,
    })
    .where("tenant_id", "=", input.tenantId)
    .where("id", "=", input.suggestionId)
    .where("status", "in", ["pending", "changes_requested"])
    .executeTakeFirstOrThrow();
}

export async function approveWikiSuggestion(
  input: {
    tenantId: string;
    suggestionId: string;
    actorId: string;
    reviewNote?: string | null;
    /** Required for a new page (else the suggestion's own categorySlug); a published page always has a category. */
    categorySlug?: string | null;
  },
  db: Kysely<DB> = getDb(),
): Promise<{ pageSlug: string }> {
  return db.transaction().execute(async (trx) => {
    const suggestion = await getWikiSuggestionById(
      input.tenantId,
      input.suggestionId,
      trx,
    );

    if (!["pending", "changes_requested"].includes(suggestion.status)) {
      throw new Error("Only pending suggestions can be approved.");
    }

    const targetSlug = normalizeWikiSlug(suggestion.targetSlug);

    if (!targetSlug) {
      throw new Error("Suggestion target slug is invalid.");
    }

    if (suggestion.suggestionType === "edit_page") {
      if (!suggestion.pageId) {
        throw new Error("Edit suggestions must target an existing page.");
      }

      const existingPage = await getWikiPageById(
        input.tenantId,
        suggestion.pageId,
        trx,
      );

      if (!existingPage || existingPage.slug !== targetSlug) {
        throw new Error("Edit suggestions cannot change the target page slug.");
      }
    }

    if (suggestion.suggestionType === "new_page") {
      const existingPage = await trx
        .selectFrom("wiki_pages")
        .select("id")
        .where("tenant_id", "=", input.tenantId)
        .where("slug", "=", targetSlug)
        .executeTakeFirst();

      if (existingPage) {
        throw new Error("A page already exists for this suggestion slug.");
      }
    }

    const categorySlug = input.categorySlug || suggestionCategorySlug(suggestion.metadata);
    if (suggestion.suggestionType === "new_page" && !categorySlug) {
      throw new Error("Pick a category before approving a new page.");
    }

    await saveWikiPageWithRevisionInTransaction(
      {
        tenantId: input.tenantId,
        slug: targetSlug,
        title: suggestion.title,
        summary: suggestion.summary,
        bodyMarkdown: suggestion.bodyMarkdown,
        status: "published",
        actorId: input.actorId,
        changeNote:
          input.reviewNote ??
          aiSuggestionChangeNote(suggestion.metadata) ??
          `Approved suggestion ${suggestion.id} (${suggestion.suggestionType})`,
        // An AI editor revision that waited for review keeps its claim-level provenance.
        aiProvenance: aiSuggestionProvenance(suggestion.metadata),
        categorySlug: suggestion.suggestionType === "new_page" ? categorySlug : null,
      },
      trx,
    );

    await trx
      .updateTable("wiki_suggestions")
      .set({
        status: "approved",
        reviewed_by: input.actorId,
        reviewed_at: sql`CURRENT_TIMESTAMP`,
        review_note: input.reviewNote ?? null,
        updated_at: sql`CURRENT_TIMESTAMP`,
      })
      .where("tenant_id", "=", input.tenantId)
      .where("id", "=", input.suggestionId)
      .executeTakeFirstOrThrow();

    return { pageSlug: targetSlug };
  });
}

export function suggestionCategorySlug(metadata: WikiSuggestionMetadata | null | undefined): string | null {
  const value = metadata?.categorySlug;
  return typeof value === "string" && value ? value : null;
}

function aiSuggestionProvenance(metadata: WikiSuggestionMetadata | null | undefined) {
  const provenance = metadata?.origin === "ai_generated" ? metadata.aiProvenance : null;
  return provenance && typeof provenance === "object" ? (provenance as WikiPageRevisionAiProvenance) : null;
}

function aiSuggestionChangeNote(metadata: WikiSuggestionMetadata | null | undefined) {
  return metadata?.origin === "ai_generated" && typeof metadata.changeNote === "string" ? metadata.changeNote : null;
}

/** Adds the page to the category only when it is in no category; throws on a category the wiki doesn't have. */
async function fileUncategorizedPage(input: { tenantId: string; pageId: string; categorySlug: string }, trx: Transaction<DB>) {
  const category = await trx
    .selectFrom("wiki_categories")
    .select("id")
    .where("tenant_id", "=", input.tenantId)
    .where("slug", "=", input.categorySlug)
    .executeTakeFirst();
  if (!category) throw new Error(`No category '${input.categorySlug}' in this wiki.`);
  const existing = await trx
    .selectFrom("wiki_page_categories")
    .select("category_id")
    .where("tenant_id", "=", input.tenantId)
    .where("page_id", "=", input.pageId)
    .executeTakeFirst();
  if (existing) return;
  await trx
    .insertInto("wiki_page_categories")
    .values({ tenant_id: input.tenantId, page_id: input.pageId, category_id: category.id })
    .execute();
}

async function saveWikiPageWithRevisionInTransaction(
  input: SaveWikiPageInput,
  trx: Transaction<DB>,
): Promise<WikiPageDetail> {
  const status = input.status ?? "draft";
  const summary = input.summary ?? null;
  const actorId = input.actorId ?? null;
  const normalizedSlug = normalizeWikiSlug(input.slug);

  if (!normalizedSlug) {
    throw new Error("Page slug is required.");
  }

  const existingPage = await trx
    .selectFrom("wiki_pages")
    .select(["id", "latest_revision_number"])
    .where("tenant_id", "=", input.tenantId)
    .where("slug", "=", normalizedSlug)
    .executeTakeFirst();

  const pageId = existingPage?.id ?? createId("page");
  const revisionNumber = existingPage
    ? existingPage.latest_revision_number + 1
    : 1;

  if (existingPage) {
    if (status === "published") {
      await trx
        .updateTable("wiki_pages")
        .set({
          title: input.title,
          summary,
          body_markdown: input.bodyMarkdown,
          status,
          latest_revision_number: revisionNumber,
          updated_by: actorId,
          published_at: sql`COALESCE("published_at", CURRENT_TIMESTAMP)`,
          updated_at: sql`CURRENT_TIMESTAMP`,
        })
        .where("id", "=", existingPage.id)
        .where("tenant_id", "=", input.tenantId)
        .execute();
    } else {
      await trx
        .updateTable("wiki_pages")
        .set({
          title: input.title,
          summary,
          body_markdown: input.bodyMarkdown,
          status,
          latest_revision_number: revisionNumber,
          updated_by: actorId,
          updated_at: sql`CURRENT_TIMESTAMP`,
        })
        .where("id", "=", existingPage.id)
        .where("tenant_id", "=", input.tenantId)
        .execute();
    }
  } else {
    await trx
      .insertInto("wiki_pages")
      .values({
        id: pageId,
        tenant_id: input.tenantId,
        slug: normalizedSlug,
        title: input.title,
        summary,
        body_markdown: input.bodyMarkdown,
        status,
        latest_revision_number: revisionNumber,
        created_by: actorId,
        updated_by: actorId,
        published_at: status === "published" ? sql`CURRENT_TIMESTAMP` : null,
      })
      .execute();
  }

  const revisionId = createId("revision");

  await trx
    .insertInto("wiki_page_revisions")
    .values({
      id: revisionId,
      tenant_id: input.tenantId,
      page_id: pageId,
      revision_number: revisionNumber,
      title: input.title,
      summary,
      body_markdown: input.bodyMarkdown,
      change_note: input.changeNote ?? null,
      ai_provenance: input.aiProvenance ?? null,
      created_by: actorId,
    })
    .execute();

  if (input.sourceReferences?.length) {
    await trx
      .insertInto("wiki_sources")
      .values(
        input.sourceReferences.map((source) => ({
          id: createId("source"),
          tenant_id: input.tenantId,
          page_id: pageId,
          revision_id: revisionId,
          source_key: source.sourceKey,
          source_type: source.sourceType,
          title: source.title,
          url: source.url,
          publisher: source.publisher,
          context_text: source.contextText,
          topic_slugs: source.topicSlugs,
          retrieved_at: source.retrievedAt,
          metadata: {
            ...copyWikiSourceMetadata(source.metadata),
            copiedFromSourceId: source.id,
            copiedForRevisionId: revisionId,
            origin: "canonical_generation_context",
          },
        })),
      )
      .execute();
  }

  if (input.categorySlug) {
    await fileUncategorizedPage({ tenantId: input.tenantId, pageId, categorySlug: input.categorySlug }, trx);
  }

  const savedPage = await getPublishedWikiPageBySlug(
    input.tenantId,
    normalizedSlug,
    trx,
  );

  if (savedPage) {
    return savedPage;
  }

  const draftPage = await trx
    .selectFrom("wiki_pages")
    .select([
      "id",
      "slug",
      "title",
      "summary",
      "body_markdown as bodyMarkdown",
      "status",
      "latest_revision_number as latestRevisionNumber",
      "updated_at as updatedAt",
      "published_at as publishedAt",
    ])
    .where("id", "=", pageId)
    .where("tenant_id", "=", input.tenantId)
    .executeTakeFirstOrThrow();

  return {
    ...draftPage,
    latestRevision: null,
    categories: [],
    tags: [],
    sources: [],
  };
}

function createId(prefix: string) {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

function normalizeSuggestionMetadata(
  value: unknown,
): WikiSuggestionMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as WikiSuggestionMetadata;
}

function normalizeCommunityNoteMetadata(
  value: unknown,
): WikiCommunityNoteMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as WikiCommunityNoteMetadata;
}

function mapWikiCommunityNoteSummary(
  note: Omit<WikiCommunityNoteSummary, "metadata"> & { metadata: unknown },
): WikiCommunityNoteSummary {
  return {
    ...note,
    metadata: normalizeCommunityNoteMetadata(note.metadata),
  };
}

function formatCommunityNoteType(noteType: string) {
  const label = noteType.replaceAll("_", " ").trim() || "general";

  return label.charAt(0).toUpperCase() + label.slice(1);
}

function buildCommunityNoteContextText(note: {
  status: string;
  noteType: string;
  bodyMarkdown: string;
  sourceUrl: string | null;
  targetQuote: string | null;
  reviewNote: string | null;
}) {
  return [
    `Community note status: ${note.status}`,
    `Community note type: ${note.noteType}`,
    note.targetQuote ? `Target quote:\n${note.targetQuote}` : null,
    `Note:\n${note.bodyMarkdown}`,
    note.sourceUrl ? `Submitted source URL: ${note.sourceUrl}` : null,
    note.reviewNote ? `Moderator note:\n${note.reviewNote}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function normalizeRevisionAiProvenance(
  value: unknown,
): WikiPageRevisionAiProvenance | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as WikiPageRevisionAiProvenance;
}

function normalizeWikiSourceMetadata(value: unknown): WikiSourceMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as WikiSourceMetadata;
}

function copyWikiSourceMetadata(value: WikiSourceMetadata | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value;
}

import { randomUUID } from "node:crypto";

import { sql, type Kysely, type Transaction } from "kysely";

import { getDb } from "./client";
import type { DB } from "./types";

export const MARATHON_TENANT_SLUG = "marathon";

type WikiDatabase = Kysely<DB> | Transaction<DB>;

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

export type WikiPageSummary = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  status: string;
  updatedAt: Date;
  publishedAt: Date | null;
};

export type WikiPageDetail = WikiPageSummary & {
  bodyMarkdown: string;
  latestRevisionNumber: number;
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
  }>;
};

export type WikiHomeSnapshot = {
  tenant: WikiTenant;
  categories: WikiCategorySummary[];
  pages: WikiPageSummary[];
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
    .select([
      "category.id as id",
      "category.slug as slug",
      "category.name as name",
      "category.description as description",
      "category.sort_order as sortOrder",
      sql<number>`cast(count(page_category.page_id) as integer)`.as("pageCount"),
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

  return pages;
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
    ])
    .where("tenant_id", "=", tenantId)
    .where("page_id", "=", page.id)
    .orderBy("title", "asc")
    .execute();

  return {
    ...page,
    categories,
    tags,
    sources,
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

  const [categories, pages] = await Promise.all([
    listWikiCategoriesByTenant(tenant.id, db),
    listPublishedWikiPagesByTenant(tenant.id, db, 12),
  ]);

  return {
    tenant,
    categories,
    pages,
  };
}

export async function saveWikiPageWithRevision(
  input: SaveWikiPageInput,
  db: Kysely<DB> = getDb(),
): Promise<WikiPageDetail> {
  const status = input.status ?? "draft";
  const summary = input.summary ?? null;
  const actorId = input.actorId ?? null;
  const normalizedSlug = input.slug.trim().toLowerCase();

  const page = await db.transaction().execute(async (trx) => {
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

    await trx
      .insertInto("wiki_page_revisions")
      .values({
        id: createId("revision"),
        tenant_id: input.tenantId,
        page_id: pageId,
        revision_number: revisionNumber,
        title: input.title,
        summary,
        body_markdown: input.bodyMarkdown,
        change_note: input.changeNote ?? null,
        created_by: actorId,
      })
      .execute();

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
      categories: [],
      tags: [],
      sources: [],
    };
  });

  return page;
}

function createId(prefix: string) {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

import { afterAll, beforeAll, describe, expect, it } from "vitest";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI can provide DATABASE_URL directly.
}

import { getDb } from "./client";
import {
  getPublishedWikiPageBySlug,
  getWikiCategorySnapshot,
  getWikiHomeSnapshot,
  getWikiPageSnapshot,
  getWikiTenantBySlug,
  listPublishedWikiPagesByTenant,
  saveWikiPageWithRevision,
} from "./wiki";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for public wiki data tests.");
}

describe.sequential("public wiki data model and reader queries", () => {
  let db: ReturnType<typeof getDb>;
  const runId = `public_data_test_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}`;
  const gameId = `${runId}_game`;
  const tenantId = `${runId}_tenant`;
  const inactiveTenantId = `${runId}_inactive_tenant`;
  const tenantSlug = runId.replaceAll("_", "-");
  const inactiveTenantSlug = `${tenantSlug}-inactive`;
  const categoryId = `${runId}_category`;
  const tagId = `${runId}_tag`;
  const sourceId = `${runId}_source`;
  let weaponsPageId = "";

  beforeAll(async () => {
    db = getDb();

    await db
      .insertInto("games")
      .values({
        id: gameId,
        slug: `${tenantSlug}-game`,
        title: "Public Data Test Game",
        franchise: "Marathon",
        developer: null,
        publisher: null,
        release_date: null,
        metadata: null,
      })
      .execute();

    await db
      .insertInto("tenants")
      .values([
        {
          id: tenantId,
          game_id: gameId,
          slug: tenantSlug,
          name: "Public Data Test Wiki",
          status: "active",
          primary_locale: "en",
        },
        {
          id: inactiveTenantId,
          game_id: gameId,
          slug: inactiveTenantSlug,
          name: "Inactive Public Data Test Wiki",
          status: "inactive",
          primary_locale: "en",
        },
      ])
      .execute();

    await db
      .insertInto("wiki_categories")
      .values({
        id: categoryId,
        tenant_id: tenantId,
        slug: "weapons",
        name: "Weapons",
        description: "Published weapons pages",
        sort_order: 1,
      })
      .execute();

    await db
      .insertInto("wiki_tags")
      .values({
        id: tagId,
        tenant_id: tenantId,
        slug: "assault-rifle",
        name: "Assault Rifle",
        description: null,
      })
      .execute();

    const weapons = await saveWikiPageWithRevision({
      tenantId,
      slug: "weapons",
      title: "Weapons",
      summary: "Published weapons overview",
      bodyMarkdown: "## Weapons\n\nThe public weapons overview.",
      status: "published",
      actorId: "seed-editor",
    });
    weaponsPageId = weapons.id;

    await saveWikiPageWithRevision({
      tenantId,
      slug: "draft-only",
      title: "Draft Only",
      summary: "This should stay hidden",
      bodyMarkdown: "Draft page content should not appear in public reads.",
      status: "draft",
      actorId: "seed-editor",
    });

    await db
      .insertInto("wiki_page_categories")
      .values({
        tenant_id: tenantId,
        page_id: weaponsPageId,
        category_id: categoryId,
      })
      .execute();

    await db
      .insertInto("wiki_page_tags")
      .values({
        tenant_id: tenantId,
        page_id: weaponsPageId,
        tag_id: tagId,
      })
      .execute();

    await db
      .insertInto("wiki_sources")
      .values({
        id: sourceId,
        tenant_id: tenantId,
        page_id: weaponsPageId,
        revision_id: null,
        source_type: "official",
        title: "Official Marathon Reference",
        url: "https://example.com/marathon",
        publisher: "Bungie",
        retrieved_at: null,
        metadata: null,
      })
      .execute();
  });

  afterAll(async () => {
    await db.deleteFrom("tenants").where("id", "in", [tenantId, inactiveTenantId]).execute();
    await db.deleteFrom("games").where("id", "=", gameId).execute();
    await db.destroy();
  });

  it("resolves only active tenants and keeps tenant rows reusable across games", async () => {
    await expect(getWikiTenantBySlug(tenantSlug)).resolves.toMatchObject({
      id: tenantId,
      slug: tenantSlug,
      gameSlug: `${tenantSlug}-game`,
      gameTitle: "Public Data Test Game",
    });
    await expect(getWikiTenantBySlug(inactiveTenantSlug)).resolves.toBeNull();
  });

  it("builds the home snapshot from published pages and category counts", async () => {
    const snapshot = await getWikiHomeSnapshot(tenantSlug);

    expect(snapshot?.tenant.slug).toBe(tenantSlug);
    expect(snapshot?.pages.map((page) => page.slug)).toEqual(["weapons"]);
    expect(snapshot?.categories).toEqual([
      expect.objectContaining({
        slug: "weapons",
        name: "Weapons",
        pageCount: 1,
      }),
    ]);
  });

  it("returns category snapshots with only published pages", async () => {
    const snapshot = await getWikiCategorySnapshot(tenantSlug, "weapons");

    expect(snapshot?.category).toMatchObject({
      slug: "weapons",
      pageCount: 1,
    });
    expect(snapshot?.pages.map((page) => page.slug)).toEqual(["weapons"]);
    await expect(getWikiCategorySnapshot(tenantSlug, "missing")).resolves.toBeNull();
  });

  it("returns article snapshots with categories, tags, sources, and revisions", async () => {
    const snapshot = await getWikiPageSnapshot(tenantSlug, "weapons");

    expect(snapshot?.page).toMatchObject({
      id: weaponsPageId,
      slug: "weapons",
      title: "Weapons",
      latestRevisionNumber: 1,
      status: "published",
    });
    expect(snapshot?.page.categories).toEqual([
      expect.objectContaining({ slug: "weapons", name: "Weapons" }),
    ]);
    expect(snapshot?.page.tags).toEqual([
      expect.objectContaining({ slug: "assault-rifle", name: "Assault Rifle" }),
    ]);
    expect(snapshot?.page.sources).toEqual([
      expect.objectContaining({
        sourceType: "official",
        title: "Official Marathon Reference",
        publisher: "Bungie",
      }),
    ]);
  });

  it("hides draft pages from public list and article queries", async () => {
    const pages = await listPublishedWikiPagesByTenant(tenantId);

    expect(pages.map((page) => page.slug)).toEqual(["weapons"]);
    await expect(
      getPublishedWikiPageBySlug(tenantId, "draft-only"),
    ).resolves.toBeNull();
  });
});

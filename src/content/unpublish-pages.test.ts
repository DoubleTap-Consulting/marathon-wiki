import { afterAll, beforeAll, describe, expect, it } from "vitest";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI can provide DATABASE_URL directly.
}

import { Pool } from "@neondatabase/serverless";

import { getDb } from "@/src/db/client";
import {
  getPublishedWikiPageBySlug,
  getWikiPageSnapshot,
  listPublishedWikiPagesByTenant,
  listWikiCategoriesByTenant,
  listWikiSearchSources,
  listWikiSitemapEntries,
} from "@/src/db/wiki";

import {
  PROD_LOAD_FLAG,
  applyUnpublishPages,
  decideUnpublishPages,
  normalizeUnpublishSlugs,
  unpublishConfirmationPhrase,
} from "./unpublish-pages";

const slugs = ["armory"];
const base = {
  env: {},
  guard: { ok: true } as const,
  pointsAtProduction: false,
  confirm: null,
  tenantSlug: "marathon",
  slugs,
};
const prodGuard = { ok: false, reason: "DATABASE_URL points at the production database endpoint" } as const;

function nonProdPhrase() {
  return unpublishConfirmationPhrase({ tenantSlug: "marathon", slugs, target: "non-production" });
}

describe("unpublish confirmation and guards", () => {
  it("names the tenant, sorted slugs, and target", () => {
    expect(normalizeUnpublishSlugs(" ranked,armory armory ")).toEqual(["armory", "ranked"]);
    expect(unpublishConfirmationPhrase({ tenantSlug: "marathon", slugs: ["armory"], target: "production" })).toBe(
      "unpublish marathon armory from production",
    );
    expect(
      unpublishConfirmationPhrase({
        tenantSlug: "gta6",
        slugs: ["overview", "platforms"],
        target: "production",
        action: "unpublish",
      }),
    ).toBe("unpublish gta6 overview,platforms from production");
    expect(
      unpublishConfirmationPhrase({
        tenantSlug: "marathon",
        slugs: ["armory"],
        target: "production",
        action: "republish",
      }),
    ).toBe("republish marathon armory into production");
  });

  it("asks for the exact phrase, then allows it", () => {
    const first = decideUnpublishPages(base);
    expect(first).toEqual({
      ok: false,
      reason: "missing --confirm",
      phrase: "unpublish marathon armory from non-production",
    });
    expect(decideUnpublishPages({ ...base, confirm: "yes" })).toMatchObject({ ok: false, reason: "the confirmation does not match" });
    expect(decideUnpublishPages({ ...base, confirm: first.phrase! })).toEqual({
      ok: true,
      target: "non-production",
      action: "unpublish",
      phrase: first.phrase,
      slugs: ["armory"],
    });
  });

  it("refuses production unless the override flag is set, and refuses Vercel and empty slugs", () => {
    const prod = { ...base, guard: prodGuard, pointsAtProduction: true };
    expect(decideUnpublishPages({ ...prod, confirm: nonProdPhrase() })).toMatchObject({
      ok: false,
      reason: expect.stringContaining(PROD_LOAD_FLAG),
    });
    const flagged = { ...prod, env: { [PROD_LOAD_FLAG]: "1" } };
    expect(decideUnpublishPages({ ...flagged, confirm: nonProdPhrase() })).toMatchObject({
      ok: false,
      phrase: "unpublish marathon armory from production",
    });
    expect(decideUnpublishPages({ ...flagged, confirm: "unpublish marathon armory from production" })).toMatchObject({
      ok: true,
      target: "production",
    });
    expect(decideUnpublishPages({ ...base, env: { VERCEL: "1" }, confirm: nonProdPhrase() }).ok).toBe(false);
    expect(decideUnpublishPages({ ...base, env: { VERCEL_ENV: "production" }, confirm: nonProdPhrase() }).ok).toBe(false);
    expect(decideUnpublishPages({ ...base, slugs: [], confirm: nonProdPhrase() })).toMatchObject({
      ok: false,
      reason: "pass --slugs with one or more page slugs",
    });
    expect(
      decideUnpublishPages({ ...base, guard: { ok: false, reason: "no database URL is set" }, confirm: nonProdPhrase() }),
    ).toMatchObject({
      ok: false,
      reason: "database guard: no database URL is set",
    });
  });
});

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for the unpublish page tests.");
}
if (/ep-dawn-unit-atl2b0aj/i.test(process.env.DATABASE_URL)) {
  throw new Error("refusing to run these tests against the production database.");
}

describe.sequential("unpublish, idempotency, and republish against a local database", () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = getDb();
  const runId = `unpub_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const tenantSlug = `${runId}-wiki`;
  const tenantId = `${runId}_tenant`;
  const gameId = `${runId}_game`;
  const pageId = `${tenantId}_armory`;

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await client.query(`insert into games (id, slug, title) values ($1, $2, 'Marathon')`, [gameId, `${runId}-game`]);
      await client.query(
        `insert into tenants (id, game_id, slug, name, status, primary_locale) values ($1, $2, $3, 'Test', 'active', 'en')`,
        [tenantId, gameId, tenantSlug],
      );
      await client.query(
        `insert into wiki_categories (id, tenant_id, slug, name, sort_order) values ($1, $2, 'gameplay', 'Gameplay', 10)`,
        [`${runId}_cat`, tenantId],
      );
      await client.query(
        `insert into wiki_pages (id, tenant_id, slug, title, summary, body_markdown, status, latest_revision_number, created_by, updated_by, published_at)
         values ($1, $2, 'armory', 'Armory', 'Hub page.', '## Overview\n\nArmory.', 'published', 1, 'seed', 'seed', now())`,
        [pageId, tenantId],
      );
      await client.query(
        `insert into wiki_page_revisions (id, tenant_id, page_id, revision_number, title, summary, body_markdown, created_by)
         values ($1, $2, $3, 1, 'Armory', 'Hub page.', '## Overview\n\nArmory.', 'seed')`,
        [`${pageId}_r1`, tenantId, pageId],
      );
      await client.query(`insert into wiki_page_categories (tenant_id, page_id, category_id) values ($1, $2, $3)`, [
        tenantId,
        pageId,
        `${runId}_cat`,
      ]);
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query("delete from tenants where id = $1", [tenantId]);
      await client.query("delete from games where id = $1", [gameId]);
    } finally {
      client.release();
      await pool.end();
      await db.destroy();
    }
  });

  async function publicSurface() {
    const [published, snapshot, listed, search, sitemap, categories] = await Promise.all([
      getPublishedWikiPageBySlug(tenantId, "armory", db),
      getWikiPageSnapshot(tenantSlug, "armory", db),
      listPublishedWikiPagesByTenant(tenantId, db),
      listWikiSearchSources(tenantId, db),
      listWikiSitemapEntries(db),
      listWikiCategoriesByTenant(tenantId, db),
    ]);
    return {
      published,
      snapshot,
      listedSlugs: listed.map((page) => page.slug),
      searchSlugs: search.map((page) => page.slug),
      sitemapHasPage: sitemap.some((entry) => entry.tenantSlug === tenantSlug && entry.pageSlug === "armory"),
      gameplayCount: categories.find((category) => category.slug === "gameplay")?.pageCount ?? null,
    };
  }

  it("unpublishes a page so public reads 404 and it drops from sitemap, search, and categories", async () => {
    const before = await publicSurface();
    expect(before.published?.slug).toBe("armory");
    expect(before.snapshot?.page.slug).toBe("armory");
    expect(before.listedSlugs).toContain("armory");
    expect(before.searchSlugs).toContain("armory");
    expect(before.sitemapHasPage).toBe(true);
    expect(before.gameplayCount).toBe(1);

    const client = await pool.connect();
    try {
      const result = await applyUnpublishPages(client, {
        tenantId,
        slugs: ["armory"],
        action: "unpublish",
        actor: "test-unpublish",
      });
      expect(result).toEqual({ changed: ["armory"], already: [] });
    } finally {
      client.release();
    }

    const after = await publicSurface();
    // getWikiPageSnapshot is what the article and history routes use before notFound().
    expect(after.published).toBeNull();
    expect(after.snapshot).toBeNull();
    expect(after.listedSlugs).not.toContain("armory");
    expect(after.searchSlugs).not.toContain("armory");
    expect(after.sitemapHasPage).toBe(false);
    expect(after.gameplayCount).toBe(0);

    const client2 = await pool.connect();
    try {
      const kept = await client2.query(
        `select p.status, (select count(*)::int from wiki_page_revisions r where r.page_id = p.id) as revisions
         from wiki_pages p where p.id = $1`,
        [pageId],
      );
      expect(kept.rows).toEqual([{ status: "archived", revisions: 1 }]);
    } finally {
      client2.release();
    }
  });

  it("is idempotent when the page is already unpublished", async () => {
    const client = await pool.connect();
    try {
      const result = await applyUnpublishPages(client, {
        tenantId,
        slugs: ["armory"],
        action: "unpublish",
        actor: "test-unpublish",
      });
      expect(result).toEqual({ changed: [], already: ["armory"] });
    } finally {
      client.release();
    }
    expect(await getPublishedWikiPageBySlug(tenantId, "armory", db)).toBeNull();
    expect(await getWikiPageSnapshot(tenantSlug, "armory", db)).toBeNull();
  });

  it("republishes the same page so it is public again", async () => {
    const client = await pool.connect();
    try {
      const result = await applyUnpublishPages(client, {
        tenantId,
        slugs: ["armory"],
        action: "republish",
        actor: "test-unpublish",
      });
      expect(result).toEqual({ changed: ["armory"], already: [] });
      const again = await applyUnpublishPages(client, {
        tenantId,
        slugs: ["armory"],
        action: "republish",
        actor: "test-unpublish",
      });
      expect(again).toEqual({ changed: [], already: ["armory"] });
    } finally {
      client.release();
    }

    const after = await publicSurface();
    expect(after.published?.slug).toBe("armory");
    expect(after.snapshot?.page.slug).toBe("armory");
    expect(after.listedSlugs).toContain("armory");
    expect(after.searchSlugs).toContain("armory");
    expect(after.sitemapHasPage).toBe(true);
    expect(after.gameplayCount).toBe(1);
  });
});

import { afterAll, describe, expect, it } from "vitest";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI can provide DATABASE_URL directly.
}

import { Pool, type PoolClient } from "@neondatabase/serverless";

import { loadGeneratedPages, type GeneratedPage } from "../../scripts/content/generated-load.ts";
import { type GameTenantUpsertSpec, upsertGameTenantAndCategories } from "./upsert-gta6-tenant";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for the gta6 tenant upsert tests.");
}
if (/ep-dawn-unit-atl2b0aj/i.test(process.env.DATABASE_URL)) {
  throw new Error("refusing to run these tests against the production database.");
}

function testSpec(runId: string): GameTenantUpsertSpec {
  return {
    gameId: `${runId}_game`,
    gameSlug: `${runId}-game`,
    gameTitle: "Grand Theft Auto VI",
    franchise: "Grand Theft Auto",
    developer: "Rockstar Games",
    publisher: "Rockstar Games",
    releaseDate: "2026-11-19T00:00:00+00",
    gameMetadata: { seed: "test" },
    tenantId: `${runId}_tenant`,
    tenantSlug: `${runId}-wiki`,
    tenantName: "GTA 6 test wiki",
    status: "active",
    primaryLocale: "en",
    categories: [
      {
        id: `${runId}_cat_overview`,
        slug: "overview",
        name: "Overview",
        description: "Overview pages.",
        sortOrder: 10,
      },
    ],
  };
}

function samplePage(slug: string): GeneratedPage {
  return {
    slug,
    title: "Overview",
    summary: "A test overview page.",
    category: "overview",
    bodyMarkdown: "## Overview\n\nA test overview page with enough cited prose.",
    aiProvenance: {
      generatedAt: "2026-11-16T00:00:00.000Z",
      publishGate: { decision: "publish" },
      sourceReferences: [],
    },
  };
}

describe.sequential("gta6 tenant upsert in the generated-pages transaction", () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  afterAll(async () => {
    await pool.end();
  });

  async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("begin");
      try {
        return await fn(client);
      } finally {
        await client.query("rollback");
      }
    } finally {
      client.release();
    }
  }

  it("creates the game, tenant, and categories when no tenant row exists, then loads pages", async () => {
    const spec = testSpec(`upsert_new_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    await withTransaction(async (client) => {
      const before = await client.query("select id from tenants where slug = $1", [spec.tenantSlug]);
      expect(before.rows).toHaveLength(0);
      const upserted = await upsertGameTenantAndCategories(client, spec);
      expect(upserted).toEqual({ tenantId: spec.tenantId, created: true });
      const loaded = await loadGeneratedPages(client, {
        tenantId: upserted.tenantId,
        pages: [samplePage("overview")],
        fetchedAt: new Map(),
        actor: "test-upsert",
      });
      expect(loaded.published).toEqual(["overview"]);
      const pages = await client.query("select slug, status from wiki_pages where tenant_id = $1", [spec.tenantId]);
      expect(pages.rows).toEqual([{ slug: "overview", status: "published" }]);
    });
    const poolCheck = await pool.query("select id from tenants where slug = $1", [spec.tenantSlug]);
    expect(poolCheck.rows).toHaveLength(0);
  });

  it("is idempotent when the tenant row already exists", async () => {
    const spec = testSpec(`upsert_exist_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    await withTransaction(async (client) => {
      const first = await upsertGameTenantAndCategories(client, spec);
      const second = await upsertGameTenantAndCategories(client, spec);
      expect(first.created).toBe(true);
      expect(second).toEqual({ tenantId: spec.tenantId, created: false });
      const tenants = await client.query("select id, name, slug from tenants where slug = $1", [spec.tenantSlug]);
      expect(tenants.rows).toHaveLength(1);
      expect(tenants.rows[0].id).toBe(spec.tenantId);
      const loaded = await loadGeneratedPages(client, {
        tenantId: spec.tenantId,
        pages: [samplePage("overview")],
        fetchedAt: new Map(),
        actor: "test-upsert",
      });
      expect(loaded.published).toEqual(["overview"]);
    });
  });

  it("rolls back the tenant upsert when the import fails in the same transaction", async () => {
    const spec = testSpec(`upsert_fail_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    await withTransaction(async (client) => {
      const upserted = await upsertGameTenantAndCategories(client, spec);
      expect(upserted.created).toBe(true);
      const present = await client.query("select id from tenants where slug = $1", [spec.tenantSlug]);
      expect(present.rows).toHaveLength(1);
      await expect(
        loadGeneratedPages(client, {
          tenantId: "missing-tenant-for-failed-import",
          pages: [samplePage("overview")],
          fetchedAt: new Map(),
          actor: "test-upsert",
        }),
      ).rejects.toThrow();
    });
    const gone = await pool.query("select id from tenants where slug = $1", [spec.tenantSlug]);
    expect(gone.rows).toHaveLength(0);
  });
});

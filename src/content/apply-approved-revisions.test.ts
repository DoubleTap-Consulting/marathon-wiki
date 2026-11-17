import { afterAll, describe, expect, it } from "vitest";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI can provide DATABASE_URL directly.
}

import { Pool, type PoolClient } from "@neondatabase/serverless";

import { applyApprovedRevisions, countUpdatedAndNew, type ApprovedRevision } from "./apply-approved-revisions";
import { approvedConfirmationPhrase } from "./load-approved-revisions";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for the approved-revision apply tests.");
}
if (/ep-dawn-unit-atl2b0aj/i.test(process.env.DATABASE_URL)) {
  throw new Error("refusing to run these tests against the production database.");
}

const sha = "d6ab2e5efeb9ec5b581deca20fed2d1e53656a858a354966924847037e271fcf";

function revision(slug: string, title: string): ApprovedRevision {
  return {
    slug,
    title,
    summary: `${title} summary.`,
    category: "gameplay",
    bodyMarkdown: `## Overview\n\n${title} body.`,
    changeNote: "Updated from cited official sources.",
  };
}

describe("countUpdatedAndNew", () => {
  it("counts 24 updated and 1 new the way the production confirm phrase does", () => {
    const approved = Array.from({ length: 24 }, (_, i) => `page-${i}`).concat("armory");
    const existing = approved.filter((slug) => slug !== "armory");
    expect(countUpdatedAndNew(existing, approved)).toEqual({ updatedCount: 24, newCount: 1 });
    expect(
      approvedConfirmationPhrase({
        updatedCount: 24,
        newCount: 1,
        fileSha256: sha,
        target: "production",
        tenantSlug: "marathon",
      }),
    ).toBe("apply 24 updated + 1 new revisions d6ab2e5efeb9 into production marathon");
  });
});

describe.sequential("applyApprovedRevisions creates a missing page in the same transaction", () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  afterAll(async () => {
    await pool.end();
  });

  async function withTenant<T>(fn: (client: PoolClient, tenantId: string) => Promise<T>): Promise<T> {
    const runId = `apply_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into games (id, slug, title) values ($1, $2, 'Marathon')`,
        [`${runId}_game`, `${runId}-game`],
      );
      await client.query(
        `insert into tenants (id, game_id, slug, name, status, primary_locale) values ($1, $2, $3, 'Test', 'active', 'en')`,
        [`${runId}_tenant`, `${runId}_game`, `${runId}-wiki`],
      );
      await client.query(
        `insert into wiki_categories (id, tenant_id, slug, name, sort_order) values ($1, $2, 'gameplay', 'Gameplay', 10)`,
        [`${runId}_cat`, `${runId}_tenant`],
      );
      try {
        return await fn(client, `${runId}_tenant`);
      } finally {
        await client.query("rollback");
      }
    } finally {
      client.release();
    }
  }

  it("updates an existing page and inserts a missing page plus its first published revision", async () => {
    await withTenant(async (client, tenantId) => {
      await client.query(
        `insert into wiki_pages (id, tenant_id, slug, title, summary, body_markdown, status, latest_revision_number, created_by, updated_by)
         values ($1, $2, 'ranked', 'Ranked', 'old', 'old body', 'published', 1, 'seed', 'seed')`,
        [`${tenantId}_ranked`, tenantId],
      );
      await client.query(
        `insert into wiki_page_revisions (id, tenant_id, page_id, revision_number, title, summary, body_markdown, created_by)
         values ($1, $2, $3, 1, 'Ranked', 'old', 'old body', 'seed')`,
        [`${tenantId}_ranked_r1`, tenantId, `${tenantId}_ranked`],
      );

      const applied = await applyApprovedRevisions(client, {
        tenantId,
        revisions: [revision("ranked", "Ranked"), revision("armory", "Armory")],
        fileSha256: sha,
        actor: "test-apply",
      });
      expect(applied).toEqual({ updated: ["ranked"], created: ["armory"] });

      const pages = await client.query(
        `select slug, title, latest_revision_number, status from wiki_pages where tenant_id = $1 order by slug`,
        [tenantId],
      );
      expect(pages.rows).toEqual([
        { slug: "armory", title: "Armory", latest_revision_number: 1, status: "published" },
        { slug: "ranked", title: "Ranked", latest_revision_number: 2, status: "published" },
      ]);
      const armoryRev = await client.query(
        `select r.revision_number, r.title, r.change_note from wiki_page_revisions r
         join wiki_pages p on p.id = r.page_id
         where r.tenant_id = $1 and p.slug = 'armory'`,
        [tenantId],
      );
      expect(armoryRev.rows).toEqual([{ revision_number: 1, title: "Armory", change_note: "Updated from cited official sources." }]);
    });
  });

  it("rolls back a new page when a later revision in the same transaction fails", async () => {
    await withTenant(async (client, tenantId) => {
      await client.query("savepoint apply_attempt");
      await expect(
        applyApprovedRevisions(client, {
          tenantId,
          revisions: [revision("armory", "Armory"), revision("armory", "Armory")],
          fileSha256: sha,
          actor: "test-apply",
        }),
      ).rejects.toThrow();
      await client.query("rollback to apply_attempt");
      const pages = await client.query("select slug from wiki_pages where tenant_id = $1", [tenantId]);
      expect(pages.rows).toHaveLength(0);
    });
  });
});

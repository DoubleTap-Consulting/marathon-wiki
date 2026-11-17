/**
 * Writes content/marathon/generated/pages.json into one wiki. Shared by the preview seed
 * (scripts/seed-preview.ts) and the one-time load (scripts/content/load-generated-once.ts).
 *
 * - Several entries for one slug are successive revisions of that page (oldest first).
 * - An entry whose publish gate said needs_review is never published: it becomes a pending
 *   AI suggestion in Review, exactly like the queue worker would file it.
 * - Every row written here has a `gen_` id, so the preview seed can delete and recreate them.
 *
 * Plain Node (type stripping, no path aliases): it runs inside the Vercel build.
 */
import type { PoolClient } from "@neondatabase/serverless";

export type GeneratedPage = {
  slug: string;
  title: string;
  summary: string;
  category: string;
  bodyMarkdown: string;
  aiProvenance: {
    generatedAt: string;
    changeNote?: string;
    publishGate?: { decision: "publish" | "needs_review"; reasons?: string[] };
    sourceReferences: Array<{ sourceId: string; sourceKey: string; sourceType: string; title: string; url: string; publisher: string; authorityTier: string; authorityScore: number }>;
  } & Record<string, unknown>;
};

export type LoadResult = { published: string[]; review: string[] };

/** Ids are scoped by tenant so two wikis can share a slug (for example overview) without colliding. */
function generatedRowId(tenantId: string, kind: "page" | "rev" | "src" | "sug", rest: string) {
  return `gen_${kind}_${tenantId}_${rest}`;
}

export async function loadGeneratedPages(
  client: PoolClient,
  input: { tenantId: string; pages: GeneratedPage[]; fetchedAt: Map<string, string>; actor: string },
): Promise<LoadResult> {
  const { tenantId, actor } = input;
  const result: LoadResult = { published: [], review: [] };
  const steps = new Map<string, number>();

  for (const page of input.pages) {
    const step = (steps.get(page.slug) ?? 0) + 1;
    steps.set(page.slug, step);
    const existing = await client.query("select id from wiki_pages where tenant_id = $1 and slug = $2", [tenantId, page.slug]);

    if (page.aiProvenance.publishGate?.decision === "needs_review") {
      const changeNote = page.aiProvenance.changeNote ?? "First version of the page, written from cited sources.";
      await client.query(
        `insert into wiki_suggestions (id, tenant_id, page_id, status, suggestion_type, target_slug, title, summary, body_markdown, metadata, created_by)
         values ($1, $2, $3, 'pending', $4, $5, $6, $7, $8, $9, $10)`,
        [
          generatedRowId(tenantId, "sug", `${page.slug}_${step}`),
          tenantId,
          existing.rows[0]?.id ?? null,
          existing.rows.length ? "edit_page" : "new_page",
          page.slug,
          page.title,
          page.summary,
          page.bodyMarkdown,
          JSON.stringify({ origin: "ai_generated", aiProvenance: page.aiProvenance, publishGate: page.aiProvenance.publishGate, changeNote, generated: true }),
          actor,
        ],
      );
      result.review.push(page.slug);
      continue;
    }

    let pageId: string;
    if (existing.rows.length > 0) {
      pageId = existing.rows[0].id;
    } else {
      pageId = generatedRowId(tenantId, "page", page.slug);
      await client.query(
        `insert into wiki_pages (id, tenant_id, slug, title, summary, body_markdown, status, latest_revision_number, created_by, updated_by, published_at)
         values ($1, $2, $3, $4, $5, '', 'published', 0, $7, $7, $6)`,
        [pageId, tenantId, page.slug, page.title, page.summary, page.aiProvenance.generatedAt, actor],
      );
    }
    const max = await client.query("select coalesce(max(revision_number), 0)::int as max from wiki_page_revisions where tenant_id = $1 and page_id = $2", [tenantId, pageId]);
    const revisionNumber: number = max.rows[0].max + 1;
    const revisionId = generatedRowId(tenantId, "rev", `${page.slug}_${step}`);
    const changeNote =
      page.aiProvenance.changeNote ?? (revisionNumber === 1 ? "First version of the page, written from cited sources." : "Updated from cited official and press sources.");
    await client.query(
      `insert into wiki_page_revisions (id, tenant_id, page_id, revision_number, title, summary, body_markdown, change_note, ai_provenance, created_by, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [revisionId, tenantId, pageId, revisionNumber, page.title, page.summary, page.bodyMarkdown, changeNote, JSON.stringify(page.aiProvenance), actor, page.aiProvenance.generatedAt],
    );
    for (const source of page.aiProvenance.sourceReferences) {
      await client.query(
        `insert into wiki_sources (id, tenant_id, page_id, revision_id, source_key, source_type, title, url, publisher, retrieved_at, metadata)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          generatedRowId(tenantId, "src", `${page.slug}_${step}_${source.sourceKey}`),
          tenantId,
          pageId,
          revisionId,
          source.sourceKey,
          source.sourceType,
          source.title,
          source.url,
          source.publisher,
          input.fetchedAt.get(source.sourceKey) ?? page.aiProvenance.generatedAt,
          JSON.stringify({ origin: "canonical_generation_context", copiedFromSourceId: source.sourceId, authorityTier: source.authorityTier, authorityScore: source.authorityScore, generated: true }),
        ],
      );
    }
    await client.query(
      `update wiki_pages set title = $3, summary = $4, body_markdown = $5, latest_revision_number = $6, status = 'published', updated_by = $8, updated_at = $7
       where tenant_id = $1 and id = $2`,
      [tenantId, pageId, page.title, page.summary, page.bodyMarkdown, revisionNumber, page.aiProvenance.generatedAt, actor],
    );
    await client.query(
      `insert into wiki_page_categories (tenant_id, page_id, category_id)
       select $1, $2, id from wiki_categories where tenant_id = $1 and slug = $3
       on conflict do nothing`,
      [tenantId, pageId, page.category],
    );
    result.published.push(page.slug);
  }
  return result;
}

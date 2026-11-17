/**
 * Writes one reviewed set of paraphrase revisions: a new published revision on an
 * existing page, or a new page row plus its first published revision when no row exists.
 * The caller starts and commits (or rolls back) the transaction.
 */
import type { PoolClient } from "@neondatabase/serverless";

export type ApprovedRevision = {
  slug: string;
  title: string;
  summary: string;
  category?: string;
  bodyMarkdown: string;
  changeNote?: string;
  aiProvenance?: Record<string, unknown>;
};

export type ApplyApprovedResult = {
  updated: string[];
  created: string[];
};

export async function applyApprovedRevisions(
  client: PoolClient,
  input: {
    tenantId: string;
    revisions: ApprovedRevision[];
    fileSha256: string;
    actor: string;
    now?: string;
  },
): Promise<ApplyApprovedResult> {
  const now = input.now ?? new Date().toISOString();
  const result: ApplyApprovedResult = { updated: [], created: [] };

  for (const page of input.revisions) {
    const existing = await client.query("select id from wiki_pages where tenant_id = $1 and slug = $2", [
      input.tenantId,
      page.slug,
    ]);
    let pageId: string;
    let created = false;
    if (existing.rows.length === 0) {
      pageId = `para_page_${input.tenantId}_${page.slug}`;
      await client.query(
        `insert into wiki_pages (id, tenant_id, slug, title, summary, body_markdown, status, latest_revision_number, created_by, updated_by, published_at)
         values ($1, $2, $3, $4, $5, '', 'published', 0, $7, $7, $6)`,
        [pageId, input.tenantId, page.slug, page.title, page.summary, now, input.actor],
      );
      created = true;
    } else {
      pageId = existing.rows[0].id;
    }

    const max = await client.query(
      "select coalesce(max(revision_number), 0)::int as max from wiki_page_revisions where tenant_id = $1 and page_id = $2",
      [input.tenantId, pageId],
    );
    const revisionNumber: number = max.rows[0].max + 1;
    const revisionId = `para_rev_${input.tenantId}_${page.slug}_${input.fileSha256.slice(0, 8)}`;
    const changeNote = page.changeNote ?? "Updated from cited official sources.";
    const provenance = {
      ...(page.aiProvenance ?? {}),
      origin: "approved-paraphrase-revisions",
      changeNote,
      generatedAt: (page.aiProvenance as { generatedAt?: string } | undefined)?.generatedAt ?? now,
    };
    await client.query(
      `insert into wiki_page_revisions (id, tenant_id, page_id, revision_number, title, summary, body_markdown, change_note, ai_provenance, created_by, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        revisionId,
        input.tenantId,
        pageId,
        revisionNumber,
        page.title,
        page.summary,
        page.bodyMarkdown,
        changeNote,
        JSON.stringify(provenance),
        input.actor,
        now,
      ],
    );
    await client.query(
      `update wiki_pages set title = $3, summary = $4, body_markdown = $5, latest_revision_number = $6, status = 'published', updated_by = $8, updated_at = $7, published_at = coalesce(published_at, $7)
       where tenant_id = $1 and id = $2`,
      [input.tenantId, pageId, page.title, page.summary, page.bodyMarkdown, revisionNumber, now, input.actor],
    );
    if (page.category) {
      await client.query(
        `insert into wiki_page_categories (tenant_id, page_id, category_id)
         select $1, $2, id from wiki_categories where tenant_id = $1 and slug = $3
         on conflict do nothing`,
        [input.tenantId, pageId, page.category],
      );
    }
    if (created) result.created.push(page.slug);
    else result.updated.push(page.slug);
  }

  return result;
}

export function countUpdatedAndNew(existingSlugs: Iterable<string>, approvedSlugs: string[]) {
  const found = new Set(existingSlugs);
  let updatedCount = 0;
  let newCount = 0;
  for (const slug of approvedSlugs) {
    if (found.has(slug)) updatedCount += 1;
    else newCount += 1;
  }
  return { updatedCount, newCount };
}

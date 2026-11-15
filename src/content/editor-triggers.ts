/**
 * Everything that asks the AI editor to revisit a page goes through the refresh queue. The dedupe
 * key makes each trigger idempotent: re-running an ingest or approving the same note twice
 * enqueues nothing new.
 */
import type { Kysely } from "kysely";
import { sql } from "kysely";

import { CONTENT_SPECS, type SnapshotChange } from "./editor-store";
import type { PageSpec } from "./pipeline";
import { enqueueAiRefreshQueueItem, type AiRefreshQueueItem } from "@/src/ai/wiki-refresh-queue";
import { getDb } from "@/src/db/client";
import type { DB } from "@/src/db/types";

/** Pages that list the source in their plan or cite it in their latest published revision. */
export async function pagesUsingSource(
  input: { tenantId: string; sourceKey: string; specs?: PageSpec[] },
  db: Kysely<DB> = getDb(),
): Promise<Array<{ slug: string; title: string; pageId: string | null }>> {
  const specs = input.specs ?? CONTENT_SPECS;
  const citing = await db
    .selectFrom("wiki_pages as page")
    .innerJoin("wiki_page_revisions as revision", (join) =>
      join.onRef("revision.page_id", "=", "page.id").onRef("revision.revision_number", "=", "page.latest_revision_number"),
    )
    .select(["page.id as id", "page.slug as slug", "page.title as title"])
    .where("page.tenant_id", "=", input.tenantId)
    .where("page.status", "=", "published")
    .where(sql<boolean>`revision.ai_provenance->'sourceReferences' @> ${JSON.stringify([{ sourceKey: input.sourceKey }])}::jsonb`)
    .execute();
  const pages = new Map(citing.map((row) => [row.slug, { slug: row.slug, title: row.title, pageId: row.id as string | null }]));
  for (const spec of specs) {
    if (spec.preferredSources.includes(input.sourceKey) && !pages.has(spec.slug)) {
      pages.set(spec.slug, { slug: spec.slug, title: spec.title, pageId: null });
    }
  }
  return [...pages.values()];
}

/** A changed snapshot hash queues every page that uses that source. New sources queue nothing on their own. */
export async function enqueueSourceChangeRefreshes(
  input: { tenantId: string; changes: SnapshotChange[]; now?: Date; specs?: PageSpec[] },
  db: Kysely<DB> = getDb(),
): Promise<AiRefreshQueueItem[]> {
  const now = input.now ?? new Date();
  const items: AiRefreshQueueItem[] = [];
  for (const change of input.changes.filter((candidate) => candidate.kind === "changed")) {
    for (const page of await pagesUsingSource({ tenantId: input.tenantId, sourceKey: change.sourceKey, specs: input.specs }, db)) {
      items.push(
        await enqueueAiRefreshQueueItem(
          {
            tenantId: input.tenantId,
            pageId: page.pageId,
            targetSlug: page.slug,
            pageTitle: page.title,
            reason: "source_update",
            source: "snapshot_hash",
            scheduledFor: now,
            dedupeKey: `source_update:${input.tenantId}:${page.slug}:${change.sourceKey}:${(change.sha256 ?? "none").slice(0, 16)}`,
            metadata: { sourceKey: change.sourceKey, previousSha256: change.previousSha256, sha256: change.sha256 },
          },
          db,
        ),
      );
    }
  }
  return items;
}

/** An approved reader note queues its page; the revision is labelled "Prompted by a reader's note". */
export async function enqueueReaderNoteRefresh(
  input: { tenantId: string; noteId: string; pageId: string; pageSlug: string; pageTitle: string; now?: Date },
  db: Kysely<DB> = getDb(),
): Promise<AiRefreshQueueItem> {
  return enqueueAiRefreshQueueItem(
    {
      tenantId: input.tenantId,
      pageId: input.pageId,
      targetSlug: input.pageSlug,
      pageTitle: input.pageTitle,
      reason: "community_note",
      source: "reader_note",
      scheduledFor: input.now ?? new Date(),
      dedupeKey: `community_note:${input.tenantId}:${input.noteId}`,
      metadata: { noteId: input.noteId },
    },
    db,
  );
}

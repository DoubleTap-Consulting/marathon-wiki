/**
 * Database side of the AI editor:
 * - rendered snapshots are stored as wiki_sources rows (origin "rendered_snapshot") in the private
 *   database, because full source text cannot be committed to the public repo;
 * - runEditor regenerates one page from those rows and either publishes a new revision or files it
 *   for review, depending on the publish gate.
 */
import type { Kysely } from "kysely";
import { sql } from "kysely";

import pageSpecs from "@/content/marathon/pages.json";
import sourceRegistry from "@/content/marathon/sources.json";
import { buildCorpus, composePage, describeChanges, specForTitle, type PublishPolicy, type Snapshot, type StructuredCall } from "./editor";
import type { PageSpec, SourceRecord } from "./pipeline";
import { getDb } from "@/src/db/client";
import type { DB } from "@/src/db/types";
import {
  createWikiSuggestion,
  getPublishedWikiPageBySlug,
  listWikiCommunityNoteContextForPage,
  saveWikiPageWithRevision,
  type WikiPageDetail,
  type WikiPageRevisionAiProvenance,
  type WikiTenant,
} from "@/src/db/wiki";

export const SNAPSHOT_ORIGIN = "rendered_snapshot";
export const CONTENT_SPECS = pageSpecs as PageSpec[];
export const CONTENT_SOURCES = sourceRegistry as SourceRecord[];

export type SnapshotChange = { sourceKey: string; kind: "new" | "changed" | "unchanged"; previousSha256: string | null; sha256: string | null };

export function snapshotRowId(tenantId: string, sourceKey: string) {
  return `snap_${tenantId}_${sourceKey}`;
}

/** Idempotent: re-ingesting the same text is a no-op that reports "unchanged". */
export async function upsertRenderedSnapshots(
  input: { tenantId: string; snapshots: Snapshot[]; sources?: SourceRecord[] },
  db: Kysely<DB> = getDb(),
): Promise<SnapshotChange[]> {
  const registry = new Map((input.sources ?? CONTENT_SOURCES).map((source) => [source.sourceKey, source]));
  const changes: SnapshotChange[] = [];
  for (const snapshot of input.snapshots) {
    const source = registry.get(snapshot.sourceKey);
    if (!source) continue;
    const id = snapshotRowId(input.tenantId, snapshot.sourceKey);
    const existing = await db.selectFrom("wiki_sources").select(["metadata"]).where("id", "=", id).executeTakeFirst();
    const previousSha256 = ((existing?.metadata ?? null) as { sha256?: string } | null)?.sha256 ?? null;
    const kind: SnapshotChange["kind"] = !existing ? "new" : previousSha256 === snapshot.sha256 ? "unchanged" : "changed";
    changes.push({ sourceKey: snapshot.sourceKey, kind, previousSha256, sha256: snapshot.sha256 });
    if (kind === "unchanged") continue;
    const metadata = JSON.stringify({
      origin: SNAPSHOT_ORIGIN,
      sha256: snapshot.sha256,
      previousSha256,
      fetchedAt: snapshot.fetchedAt,
      authorityTier: source.authorityTier,
      authorityScore: source.authorityScore,
      publishedDate: source.publishedDate,
    });
    await db
      .insertInto("wiki_sources")
      .values({
        id,
        tenant_id: input.tenantId,
        page_id: null,
        source_key: source.sourceKey,
        source_type: source.sourceType,
        title: source.title,
        url: source.url,
        publisher: source.publisher,
        context_text: snapshot.text,
        topic_slugs: [],
        retrieved_at: snapshot.fetchedAt ? new Date(snapshot.fetchedAt) : new Date(),
        metadata: sql`${metadata}::jsonb`,
      })
      .onConflict((conflict) =>
        conflict.column("id").doUpdateSet({
          context_text: snapshot.text,
          retrieved_at: snapshot.fetchedAt ? new Date(snapshot.fetchedAt) : new Date(),
          metadata: sql`${metadata}::jsonb`,
          updated_at: sql`CURRENT_TIMESTAMP`,
        }),
      )
      .execute();
  }
  return changes;
}

export async function loadRenderedSnapshots(tenantId: string, db: Kysely<DB> = getDb()): Promise<Snapshot[]> {
  const rows = await db
    .selectFrom("wiki_sources")
    .select(["source_key", "context_text", "metadata", "retrieved_at"])
    .where("tenant_id", "=", tenantId)
    .where("page_id", "is", null)
    .where(sql<boolean>`metadata->>'origin' = ${SNAPSHOT_ORIGIN}`)
    .execute();
  return rows.flatMap((row) => {
    const metadata = (row.metadata ?? {}) as { sha256?: string | null; fetchedAt?: string | null };
    return row.source_key && row.context_text
      ? [{ sourceKey: row.source_key, text: row.context_text, sha256: metadata.sha256 ?? null, fetchedAt: metadata.fetchedAt ?? row.retrieved_at?.toISOString() ?? null }]
      : [];
  });
}

export type EditorOutcome =
  | { kind: "published"; page: WikiPageDetail; provenance: WikiPageRevisionAiProvenance; changeNote: string }
  | { kind: "needs_review"; suggestionId: string; reasons: string[]; changeNote: string };

/**
 * Regenerate one page: load the stored snapshots, compose with the shared pipeline, then publish
 * through the gate. Unsupported statements are never silently published: a page under the
 * threshold becomes a pending AI suggestion that an editor approves or rejects.
 */
export async function runEditor(
  input: {
    tenant: WikiTenant;
    targetSlug: string;
    pageTitle: string;
    refreshReason: string;
    call: StructuredCall;
    actorId: string;
    changedSources?: string[];
    specs?: PageSpec[];
    sources?: SourceRecord[];
    policy?: PublishPolicy;
    now?: Date;
  },
  db: Kysely<DB> = getDb(),
): Promise<EditorOutcome> {
  const specs = input.specs ?? CONTENT_SPECS;
  const spec = specs.find((candidate) => candidate.slug === input.targetSlug) ?? specForTitle(input.targetSlug, input.pageTitle);
  const snapshots = await loadRenderedSnapshots(input.tenant.id, db);
  if (snapshots.length === 0) throw new Error("No rendered source snapshots are stored for this wiki. Run the snapshot ingest first.");
  const corpus = buildCorpus(input.sources ?? CONTENT_SOURCES, snapshots);

  const existing = await getPublishedWikiPageBySlug(input.tenant.id, input.targetSlug, db);
  const notes = existing ? await listWikiCommunityNoteContextForPage({ tenantId: input.tenant.id, pageId: existing.id }, db) : [];
  const previousClaims = existing?.latestRevision?.aiProvenance?.claimSupport ?? null;
  const now = input.now ?? new Date();

  const composed = await composePage({
    spec,
    corpus,
    titles: new Map(specs.map((candidate) => [candidate.slug, candidate.title])),
    today: now.toLocaleDateString("en-US", { timeZone: "America/Chicago", year: "numeric", month: "long", day: "numeric" }),
    call: input.call,
    refreshReason: input.refreshReason,
    requestedBy: input.actorId,
    readerNotes: notes.flatMap((note) => (note.contextText ? [note.contextText] : [])),
    policy: input.policy,
    now,
  });
  const changeNote = describeChanges({ previous: previousClaims, next: composed.aiProvenance.claimSupport, refreshReason: existing ? input.refreshReason : "new_page", changedSources: input.changedSources });
  const provenance = { ...composed.aiProvenance, changeNote, readerNoteIds: notes.map((note) => note.id) } as unknown as WikiPageRevisionAiProvenance;

  if (composed.gate.decision === "needs_review") {
    const suggestion = await createWikiSuggestion(
      {
        tenantId: input.tenant.id,
        pageId: existing?.id ?? null,
        suggestionType: existing ? "edit_page" : "new_page",
        targetSlug: spec.slug,
        title: composed.title,
        summary: composed.summary,
        bodyMarkdown: composed.bodyMarkdown,
        actorId: input.actorId,
        metadata: { origin: "ai_generated", aiProvenance: provenance, publishGate: composed.gate, changeNote },
      },
      db,
    );
    return { kind: "needs_review", suggestionId: suggestion.id, reasons: composed.gate.reasons, changeNote };
  }

  const cited = new Map<string, string[]>();
  for (const extract of composed.citedExtracts) cited.set(extract.sourceKey, [...(cited.get(extract.sourceKey) ?? []), extract.text]);
  const page = await saveWikiPageWithRevision(
    {
      tenantId: input.tenant.id,
      slug: spec.slug,
      title: composed.title,
      summary: composed.summary,
      bodyMarkdown: composed.bodyMarkdown,
      status: "published",
      actorId: input.actorId,
      changeNote,
      aiProvenance: provenance,
      sourceReferences: composed.aiProvenance.sourceReferences.map((reference) => ({
        id: reference.sourceId,
        sourceKey: reference.sourceKey,
        sourceType: reference.sourceType,
        title: reference.title,
        url: reference.url,
        publisher: reference.publisher,
        contextText: (cited.get(reference.sourceKey) ?? []).join("\n\n") || null,
        topicSlugs: [spec.slug],
        retrievedAt: corpus.snapshots.get(reference.sourceKey)?.fetchedAt ? new Date(corpus.snapshots.get(reference.sourceKey)!.fetchedAt!) : null,
        metadata: {
          authorityTier: reference.authorityTier,
          authorityScore: reference.authorityScore,
          contentSha256: corpus.snapshots.get(reference.sourceKey)?.sha256 ?? null,
        },
      })),
    },
    db,
  );
  return { kind: "published", page, provenance, changeNote };
}

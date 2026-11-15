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
import { buildCorpus, composePage, specForTitle, type PreviousRevision, type PublishPolicy, type Snapshot, type StructuredCall } from "./editor";
import type { StoredClaim } from "./patch";
import type { PageSpec, Rejection, SourceRecord } from "./pipeline";
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
/** The tenant the curated Marathon sources and page specs belong to. */
export const CONTENT_TENANT_SLUG = "marathon";
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
    const fetchMethod = snapshot.fetchMethod ?? "rendered";
    const metadata = JSON.stringify({
      origin: SNAPSHOT_ORIGIN,
      fetchMethod,
      ...(fetchMethod === "http" ? { httpSha256: snapshot.sha256 } : {}),
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

/** `rejected` lists the model's sentences and edits that did not make it in, and why (an audit trail for the queue item). */
export type EditorOutcome = { changeNote: string; rejected: Rejection[] } & (
  | { kind: "published"; page: WikiPageDetail; provenance: WikiPageRevisionAiProvenance }
  | { kind: "needs_review"; suggestionId: string; reasons: string[] }
  | { kind: "unchanged" }
);

type ProvenanceWithClaims = { claimSupport?: StoredClaim[]; sourceHashes?: Record<string, string | null> } | null;

/**
 * The version a refresh edits: the latest published revision or, for a page that has never been
 * published, the newest pending AI suggestion (a thin hub waiting in Review, for example).
 */
async function loadPreviousRevision(
  input: { tenantId: string; slug: string; page: WikiPageDetail | null },
  db: Kysely<DB>,
): Promise<PreviousRevision | null> {
  if (input.page) {
    const provenance = input.page.latestRevision?.aiProvenance as ProvenanceWithClaims;
    if (!provenance?.claimSupport?.length) return null;
    // Older revisions did not record sourceHashes; their per-revision source rows did.
    const fromRows = Object.fromEntries(
      input.page.sources.flatMap((source) => {
        const sha256 = (source.metadata as { contentSha256?: string | null } | null)?.contentSha256;
        return source.sourceKey && sha256 ? [[source.sourceKey, sha256]] : [];
      }),
    );
    return { bodyMarkdown: input.page.bodyMarkdown, summary: input.page.summary ?? null, claims: provenance.claimSupport, sourceHashes: provenance.sourceHashes ?? fromRows };
  }
  const suggestion = await pendingAiSuggestions(input.tenantId, input.slug, db).executeTakeFirst();
  const provenance = (suggestion?.metadata as { aiProvenance?: ProvenanceWithClaims } | null)?.aiProvenance;
  if (!suggestion || !provenance?.claimSupport?.length) return null;
  return { bodyMarkdown: suggestion.body_markdown, summary: suggestion.summary, claims: provenance.claimSupport, sourceHashes: provenance.sourceHashes ?? {} };
}

function pendingAiSuggestions(tenantId: string, slug: string, db: Kysely<DB>) {
  return db
    .selectFrom("wiki_suggestions")
    .select(["id", "body_markdown", "summary", "metadata"])
    .where("tenant_id", "=", tenantId)
    .where("target_slug", "=", slug)
    .where("status", "=", "pending")
    .where(sql<boolean>`metadata->>'origin' = 'ai_generated'`)
    .orderBy("created_at", "desc");
}

/** Keeps at most one pending AI version per page: older ones are closed once a newer one exists. */
async function supersedePendingAiSuggestions(input: { tenantId: string; slug: string; keepId: string | null; actorId: string }, db: Kysely<DB>) {
  let query = db
    .updateTable("wiki_suggestions")
    .set({ status: "rejected", reviewed_by: input.actorId, reviewed_at: sql`CURRENT_TIMESTAMP`, review_note: "Superseded by a newer AI editor version.", updated_at: sql`CURRENT_TIMESTAMP` })
    .where("tenant_id", "=", input.tenantId)
    .where("target_slug", "=", input.slug)
    .where("status", "=", "pending")
    .where(sql<boolean>`metadata->>'origin' = 'ai_generated'`);
  if (input.keepId) query = query.where("id", "!=", input.keepId);
  await query.execute();
}

/**
 * Refresh or write one page: load the stored snapshots, compose with the shared pipeline, then
 * publish through the gate. An existing page is edited sentence by sentence, not rewritten.
 * Unsupported statements are never silently published: a page under the threshold, or one that
 * drops supported statements whose sources did not change, becomes a pending AI suggestion.
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
    /** Editor instructions carried on the queue item. Hints for the model, never sources. */
    instructions?: string[];
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
  const previous = await loadPreviousRevision({ tenantId: input.tenant.id, slug: spec.slug, page: existing }, db);
  const now = input.now ?? new Date();

  const composed = await composePage({
    spec,
    corpus,
    titles: new Map(specs.map((candidate) => [candidate.slug, candidate.title])),
    today: now.toLocaleDateString("en-US", { timeZone: "America/Chicago", year: "numeric", month: "long", day: "numeric" }),
    call: input.call,
    refreshReason: input.refreshReason,
    requestedBy: input.actorId,
    readerNotes: [...(input.instructions ?? []), ...notes.flatMap((note) => (note.contextText ? [note.contextText] : []))],
    previous,
    changedSources: input.changedSources,
    policy: input.policy,
    now,
  });
  const { rejected } = composed;
  // A version held for review that the editor leaves as it is publishes once it clears the gate
  // (the policy may have changed since it was held); anything else unchanged writes nothing.
  const releasesHeldVersion = composed.unchanged && !existing && composed.gate.decision === "publish";
  if (composed.unchanged && !releasesHeldVersion) return { kind: "unchanged", changeNote: composed.changeNote, rejected };
  const changeNote = releasesHeldVersion ? "Published the version held for review: it now clears the publish gate." : composed.changeNote;
  const provenance = { ...composed.aiProvenance, readerNoteIds: notes.map((note) => note.id) } as unknown as WikiPageRevisionAiProvenance;

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
    await supersedePendingAiSuggestions({ tenantId: input.tenant.id, slug: spec.slug, keepId: suggestion.id, actorId: input.actorId }, db);
    return { kind: "needs_review", suggestionId: suggestion.id, reasons: composed.gate.reasons, changeNote, rejected };
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
  await supersedePendingAiSuggestions({ tenantId: input.tenant.id, slug: spec.slug, keepId: null, actorId: input.actorId }, db);
  return { kind: "published", page, provenance, changeNote, rejected };
}

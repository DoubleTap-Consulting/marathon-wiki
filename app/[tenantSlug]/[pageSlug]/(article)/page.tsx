import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Toaster } from "@/components/ui/sonner";
import {
  listPublicWikiCommunityNotesForPage,
  type WikiCommunityNoteSummary,
  type WikiPageRevisionDetail,
} from "@/src/db/wiki";
import {
  authorityLabel,
  sourceDelta,
  sourceTypeLabel,
  triggerLabel,
  type ArticleContext,
  type ArticleSource,
} from "@/src/wiki/article";
import { getCachedWikiPage, getCachedWikiPageRevisions, getCachedWikiPages } from "@/src/wiki/cache";
import { buildWikiMetadata } from "@/src/wiki/metadata";
import { normalizeTenantSlug } from "@/src/wiki/tenant-routing";

import { MarkdownArticle, planArticle } from "../../_components/markdown";
import {
  ProvenanceTrigger,
  RelativeTime,
  RetrievedDate,
  type CitedSource,
} from "../../_components/trust-ui";
import { WikiChrome } from "../../_components/wiki-chrome";
import {
  AddNoteButton,
  AddNoteSheet,
  ContentsControl,
  TocNav,
  TrustOverflow,
} from "../article-chrome";
import { buildArticleSources, modelDisplayName, summarizeTrust, toIso, type TrustSummary } from "../article-data";
import { submitWikiCommunityNoteAction } from "../community-note-actions";

export const revalidate = 300;

const META = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const STRIP_LINK = "text-foreground underline-offset-4 outline-none hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring";

type ArticlePageProps = {
  params: Promise<{
    tenantSlug: string;
    pageSlug: string;
  }>;
};

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { tenantSlug, pageSlug } = await params;
  const snapshot = await getCachedWikiPage(normalizeTenantSlug(tenantSlug), normalizeTenantSlug(pageSlug));

  if (!snapshot) notFound();

  return buildWikiMetadata({
    title: snapshot.page.title,
    description: snapshot.page.summary,
    path: `/${snapshot.tenant.slug}/${snapshot.page.slug}`,
    siteName: snapshot.tenant.name,
  });
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { tenantSlug, pageSlug } = await params;
  const snapshot = await getCachedWikiPage(normalizeTenantSlug(tenantSlug), normalizeTenantSlug(pageSlug));

  if (!snapshot) {
    notFound();
  }

  const { tenant, page } = snapshot;
  const base = `/${tenant.slug}/${page.slug}`;

  // Trust metadata never blocks reading: if any of it fails, render the article with a plain date.
  const [revisions, notes, knownPages] = await Promise.all([
    getCachedWikiPageRevisions(tenant.slug, page.slug, tenant.id, page.id).catch(() => null),
    listPublicWikiCommunityNotesForPage({ tenantId: tenant.id, pageId: page.id }).catch(
      () => [] as WikiCommunityNoteSummary[],
    ),
    getCachedWikiPages(tenant.slug, tenant.id).catch(() => []),
  ]);

  const provenance = revisions ? page.latestRevision?.aiProvenance ?? null : null;
  const sources = buildArticleSources(page);
  const ctx: ArticleContext = {
    tenantSlug: tenant.slug,
    knownSlugs: new Set(knownPages.map((entry) => entry.slug)),
    sources,
    claims: provenance?.claimSupport ?? [],
    notes: notes.map((note) => ({ id: note.id, targetQuote: note.targetQuote })),
  };
  const { plan, toc } = planArticle(page.bodyMarkdown, ctx);

  if (plan.contradictedClaimIds.length > 0) {
    // Contradicted claims must never be published; surface legacy ones for Review.
    console.warn(
      `[wiki:trust] ${tenant.slug}/${page.slug} rev ${page.latestRevisionNumber} publishes contradicted claims: ${plan.contradictedClaimIds.join(", ")}`,
    );
  }

  const references = orderReferences(sources, plan.citedSourceIds);
  const cited = new Map<string, CitedSource>(
    references.map((source) => [source.id, source]),
  );
  for (const source of references) {
    source.claimText =
      ctx.claims.find((claim) => claim.status === "supported" && claim.matchedSourceIds.includes(source.id))
        ?.claimText ?? null;
  }

  const notesById = new Map(notes.map((note) => [note.id, note]));
  const unplacedNotes = notes.filter((note) => !plan.placedNoteIds.includes(note.id));
  const summary = summarizeTrust(page, revisions);
  const latestRevision = revisions?.[0] ?? null;
  const crumb = page.categories[0];

  return (
    <WikiChrome tenant={tenant} categories={snapshot.categories} width="article" skipTarget="article">
      <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
        <div className="hidden lg:block">{toc.length > 0 ? <TocNav toc={toc} /> : null}</div>

        <article id="article" className="min-w-0 max-w-[68ch]" tabIndex={-1}>
          <p className={META}>
            {crumb ? (
              <Link href={`/${tenant.slug}/categories/${crumb.slug}` as Route} className="hover:text-foreground">
                {crumb.name}
              </Link>
            ) : (
              tenant.name
            )}
          </p>
          <h1 className="mt-2 text-3xl leading-tight font-semibold tracking-tight text-foreground md:text-4xl">
            {page.title}
          </h1>
          <TrustStrip
            summary={summary}
            base={base}
            sourceCount={references.length}
            notes={notes}
            suggestHref={`/${tenant.slug}/suggest/${page.slug}`}
          />
          {page.summary ? <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{page.summary}</p> : null}

          <ContentsControl toc={toc} />

          <div className="mt-8">
            <MarkdownArticle
              markdown={page.bodyMarkdown}
              ctx={ctx}
              cited={cited}
              renderNote={(noteId) => {
                const note = notesById.get(noteId);
                return note ? <InlineNote note={note} /> : null;
              }}
            />
          </div>

          {latestRevision && provenance && latestRevision.aiProvenance ? (
            <WhatChanged revision={latestRevision} previous={revisions?.[1] ?? null} base={base} />
          ) : null}

          {unplacedNotes.length > 0 ? (
            <section aria-label="Community notes" className="mt-12 space-y-4">
              {unplacedNotes.map((note) => (
                <InlineNote key={note.id} note={note} />
              ))}
            </section>
          ) : null}

          {references.length > 0 ? <References references={references} /> : null}

          <div className="mt-12 border-t pt-6">
            <AddNoteButton />
          </div>
        </article>
      </div>

      <AddNoteSheet action={submitWikiCommunityNoteAction.bind(null, tenant.slug, page.slug)} />
      <Toaster position="bottom-center" />
    </WikiChrome>
  );
}

function orderReferences(sources: ArticleSource[], citedIds: string[]): CitedSource[] {
  const cited = citedIds.flatMap((id) => sources.filter((source) => source.id === id));
  const uncited = sources.filter((source) => !citedIds.includes(source.id));

  return [...cited, ...uncited].map((source, index) => ({ ...source, number: index + 1, claimText: null }));
}

function TrustStrip({
  summary,
  base,
  sourceCount,
  notes,
  suggestHref,
}: {
  summary: TrustSummary;
  base: string;
  sourceCount: number;
  notes: WikiCommunityNoteSummary[];
  suggestHref: string;
}) {
  const segments: React.ReactNode[] = [];
  const diffHref = `${base}/history/${summary.revisionNumber}`;

  if (summary.kind === "edited") {
    segments.push(
      <span key="when">
        {summary.hasAiHistory ? "Edited" : "Edited by the editors"}{" "}
        <Link href={diffHref as Route} className={STRIP_LINK}>
          <RelativeTime iso={summary.at} />
        </Link>
      </span>,
    );
  } else {
    const model = modelDisplayName(summary.provenance.modelId);
    const total = summary.provenance.sourceReferences?.length ?? sourceCount;
    segments.push(
      <span key="when">
        <ProvenanceTrigger
          label={summary.kind === "ai-checked" ? "Checked by AI" : "Updated by AI"}
          lines={[
            `Written by ${model} from ${total} ${total === 1 ? "source" : "sources"}.`,
            "Sources are re-checked daily; the page is revised when one changes.",
          ]}
          footnote={`Model ${summary.provenance.modelId}, prompt ${summary.provenance.promptVersion}.`}
        />{" "}
        <Link href={diffHref as Route} className={STRIP_LINK}>
          <RelativeTime iso={summary.at} />
        </Link>
      </span>,
    );
    if (summary.kind === "ai-checked") segments.push(<span key="nochange">no changes</span>);
  }

  if (sourceCount > 0) {
    segments.push(
      <a key="sources" href="#references" className={STRIP_LINK}>
        {sourceCount} {sourceCount === 1 ? "source" : "sources"}
      </a>,
    );
  }

  if (notes.length > 0) {
    segments.push(
      <a key="notes" href={`#note-${notes[0].id}`} className={STRIP_LINK}>
        {notes.length} community {notes.length === 1 ? "note" : "notes"}
      </a>,
    );
  }

  segments.push(
    <Link key="history" href={`${base}/history` as Route} className={STRIP_LINK}>
      History
    </Link>,
  );

  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 sm:gap-x-0 text-sm leading-6 text-muted-foreground">
      {segments.map((segment, index) => (
        <span key={index} className="inline-flex items-center whitespace-nowrap">
          {index > 0 ? (
            <span aria-hidden="true" className="mx-2 max-sm:hidden">
              ·
            </span>
          ) : null}
          {segment}
          {index === segments.length - 1 ? (
            <span className="ml-2 inline-flex">
              <TrustOverflow suggestHref={suggestHref} />
            </span>
          ) : null}
        </span>
      ))}
    </p>
  );
}

function InlineNote({ note }: { note: WikiCommunityNoteSummary }) {
  return (
    <aside
      id={`note-${note.id}`}
      aria-label="Community note"
      className="my-6 scroll-mt-20 border-l-2 border-primary/60 py-2 pl-4 text-[15px] leading-relaxed"
    >
      <p className={META}>Community note</p>
      <p className="mt-1 text-foreground">{note.bodyMarkdown}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {note.sourceUrl ? (
          <>
            <a
              href={note.sourceUrl}
              className="text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
            >
              Source
            </a>
            <span aria-hidden="true" className="mx-2">
              ·
            </span>
          </>
        ) : null}
        <RelativeTime iso={toIso(note.reviewedAt ?? note.createdAt)} />
      </p>
    </aside>
  );
}

function WhatChanged({
  revision,
  previous,
  base,
}: {
  revision: WikiPageRevisionDetail;
  previous: WikiPageRevisionDetail | null;
  base: string;
}) {
  const provenance = revision.aiProvenance;
  const delta = sourceDelta(previous?.aiProvenance?.sourceReferences, provenance?.sourceReferences);
  const titleFor = (id: string) =>
    [...(provenance?.sourceReferences ?? []), ...(previous?.aiProvenance?.sourceReferences ?? [])].find(
      (source) => source.sourceId === id,
    )?.title ?? id;

  return (
    <Collapsible className="mt-12 border-y">
      <CollapsibleTrigger className="group flex min-h-12 w-full items-center gap-2 text-left text-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="font-medium text-foreground">What changed in revision {revision.revisionNumber}</span>
        <span aria-hidden="true">·</span>
        <RelativeTime iso={toIso(revision.createdAt)} />
        <span aria-hidden="true" className="ml-auto transition-transform duration-200 ease-out group-data-[state=open]:rotate-90">
          ▸
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="space-y-3 pb-5 text-[15px] leading-relaxed">
          <p className="text-sm text-muted-foreground">{triggerLabel(provenance?.refreshReason)}</p>
          {revision.changeNote ? <p>{revision.changeNote}</p> : null}
          {delta.added.length > 0 ? (
            <p className="text-muted-foreground">Sources added: {delta.added.map(titleFor).join(", ")}</p>
          ) : null}
          {delta.removed.length > 0 ? (
            <p className="text-muted-foreground">Sources removed: {delta.removed.map(titleFor).join(", ")}</p>
          ) : null}
          <Link
            href={`${base}/history/${revision.revisionNumber}` as Route}
            className="inline-flex min-h-11 items-center text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
          >
            See full diff
          </Link>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function References({ references }: { references: CitedSource[] }) {
  return (
    <section id="references" aria-labelledby="references-heading" className="mt-12 scroll-mt-20">
      <h2 id="references-heading" className="text-2xl font-semibold tracking-tight">
        References
      </h2>
      <ol className="mt-4 space-y-3 text-[15px] leading-relaxed">
        {references.map((source) => (
          <li key={source.id} id={`ref-${source.number}`} className="grid grid-cols-[2.5ch_1fr] gap-2">
            <span className="text-muted-foreground tabular-nums">{source.number}.</span>
            <div>
              {source.url ? (
                <a
                  href={source.url}
                  className="text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
                >
                  {source.title}
                </a>
              ) : (
                <span className="font-medium">{source.title}</span>
              )}
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                {source.publisher ? <span>{source.publisher}</span> : null}
                <span className="inline-flex h-5 items-center rounded border px-1.5 text-xs font-medium text-foreground">
                  {sourceTypeLabel(source.sourceType)}
                </span>
                {source.authorityTier ? <span>{authorityLabel(source.authorityTier)}</span> : null}
                {source.retrievedAt ? (
                  <span>
                    retrieved <RetrievedDate iso={source.retrievedAt} />
                  </span>
                ) : null}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

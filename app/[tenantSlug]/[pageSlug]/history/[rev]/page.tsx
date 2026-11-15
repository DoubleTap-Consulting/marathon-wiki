import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { changesOnly, diffParagraphs, triggerLabel } from "@/src/wiki/article";

import { SiteDate } from "../../../_components/site-date";
import { WikiChrome } from "../../../_components/wiki-chrome";
import { toIso } from "../../article-data";
import { loadHistory } from "../history-data";
import { DiffView } from "./diff-view";

export const revalidate = 300;

type DiffPageProps = { params: Promise<{ tenantSlug: string; pageSlug: string; rev: string }> };

async function loadRevision(params: DiffPageProps["params"]) {
  const { rev } = await params;
  const history = await loadHistory(params);
  const number = /^\d+$/.test(rev) ? Number(rev) : NaN;
  const index = history.revisions.findIndex((revision) => revision.revisionNumber === number);

  if (index === -1) notFound();

  return { ...history, revision: history.revisions[index], previous: history.revisions[index + 1] ?? null, index };
}

export async function generateMetadata({ params }: DiffPageProps): Promise<Metadata> {
  const { snapshot, revision } = await loadRevision(params);
  return { title: `Revision ${revision.revisionNumber}: ${snapshot.page.title}`, robots: { index: false } };
}

export default async function DiffPage({ params }: DiffPageProps) {
  const { snapshot, revisions, revision, previous, index, base } = await loadRevision(params);
  const rows = diffParagraphs(previous?.bodyMarkdown ?? "", revision.bodyMarkdown);
  const newer = revisions[index - 1];

  return (
    <WikiChrome tenant={snapshot.tenant} categories={snapshot.categories} skipTarget="diff">
      <div id="diff" className="mx-auto max-w-3xl">
        <Link href={`${base}/history` as Route} className="inline-flex min-h-11 items-center text-small text-muted-foreground hover:text-foreground">
          ← History of {snapshot.page.title}
        </Link>
        <h1 className="mt-1 text-title font-display">
          Revision {revision.revisionNumber}
        </h1>
        <p className="mt-2 text-small text-muted-foreground">
          <SiteDate iso={toIso(revision.createdAt)} />
          <span aria-hidden="true" className="mx-2">·</span>
          {revision.aiProvenance ? `AI refresh · ${triggerLabel(revision.aiProvenance.refreshReason)}` : "Editor"}
          <span aria-hidden="true" className="mx-2">·</span>
          {previous ? `Compared with revision ${previous.revisionNumber}` : "First version"}
        </p>
        {revision.changeNote ? <p className="mt-4 text-body text-muted-foreground">{revision.changeNote}</p> : null}

        <DiffView full={rows} changes={changesOnly(rows)} />

        <nav aria-label="Revisions" className="mt-10 flex justify-between gap-4 border-t pt-4 text-ui">
          {previous ? (
            <Link href={`${base}/history/${previous.revisionNumber}` as Route} className="inline-flex min-h-11 items-center text-link hover:underline">
              ← Revision {previous.revisionNumber}
            </Link>
          ) : (
            <span />
          )}
          {newer ? (
            <Link href={`${base}/history/${newer.revisionNumber}` as Route} className="inline-flex min-h-11 items-center text-link hover:underline">
              Revision {newer.revisionNumber} →
            </Link>
          ) : (
            <Link href={base as Route} className="inline-flex min-h-11 items-center text-link hover:underline">
              Current page →
            </Link>
          )}
        </nav>
      </div>
    </WikiChrome>
  );
}

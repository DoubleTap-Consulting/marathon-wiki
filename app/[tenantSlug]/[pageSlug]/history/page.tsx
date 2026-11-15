import type { Metadata, Route } from "next";
import Link from "next/link";

import { sourceDelta, triggerLabel } from "@/src/wiki/article";

import { RelativeTime } from "../../_components/trust-ui";
import { WikiChrome } from "../../_components/wiki-chrome";
import { toIso } from "../article-data";
import { loadHistory } from "./history-data";

export const revalidate = 300;

type HistoryPageProps = { params: Promise<{ tenantSlug: string; pageSlug: string }> };

export async function generateMetadata({ params }: HistoryPageProps): Promise<Metadata> {
  const { snapshot } = await loadHistory(params);
  return { title: `History: ${snapshot.page.title}`, robots: { index: false } };
}

export default async function HistoryPage({ params }: HistoryPageProps) {
  const { snapshot, revisions, base } = await loadHistory(params);

  return (
    <WikiChrome tenant={snapshot.tenant} categories={snapshot.categories} skipTarget="history">
      <div id="history" className="mx-auto max-w-3xl">
        <Link href={base as Route} className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground">
          ← {snapshot.page.title}
        </Link>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">History</h1>
        <p className="mt-2 text-muted-foreground">Every change to this page, newest first.</p>

        {revisions.length <= 1 ? (
          <p className="mt-8 border-t pt-6 text-muted-foreground">This is the first version of the page.</p>
        ) : (
          <ol className="mt-8 border-t">
            {revisions.map((revision, index) => {
              const previous = revisions[index + 1];
              const delta = sourceDelta(
                previous?.aiProvenance?.sourceReferences,
                revision.aiProvenance?.sourceReferences,
              );
              const sourceChange = [
                delta.added.length > 0 ? `+${delta.added.length}` : null,
                delta.removed.length > 0 ? `−${delta.removed.length}` : null,
              ].filter(Boolean);
              const hasDiff = revision.revisionNumber > 1 && Boolean(previous);

              const row = (
                <div className="flex min-h-14 flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-3">
                  <span className="font-mono text-sm text-muted-foreground tabular-nums">r{revision.revisionNumber}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-muted-foreground">
                      <RelativeTime iso={toIso(revision.createdAt)} />
                      <span aria-hidden="true" className="mx-2">·</span>
                      {revision.aiProvenance ? "AI refresh" : "Editor"}
                      <span aria-hidden="true" className="mx-2">·</span>
                      {revision.aiProvenance ? triggerLabel(revision.aiProvenance.refreshReason) : "Manual edit"}
                      {sourceChange.length > 0 ? (
                        <>
                          <span aria-hidden="true" className="mx-2">·</span>
                          <span className="tabular-nums">
                            {sourceChange.join(" ")} {delta.added.length + delta.removed.length === 1 ? "source" : "sources"}
                          </span>
                        </>
                      ) : null}
                    </p>
                    {revision.changeNote ? <p className="mt-0.5 line-clamp-1 text-foreground">{revision.changeNote}</p> : null}
                  </div>
                  {hasDiff ? <span className="shrink-0 text-sm text-primary">View changes</span> : null}
                </div>
              );

              return (
                <li key={revision.id} className="border-b">
                  {hasDiff ? (
                    <Link
                      href={`${base}/history/${revision.revisionNumber}` as Route}
                      className="-mx-3 block rounded-md px-3 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {row}
                    </Link>
                  ) : (
                    row
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </WikiChrome>
  );
}

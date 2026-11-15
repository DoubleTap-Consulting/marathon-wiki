import type { OfficialSourceGaps } from "@/src/wiki/official-gaps";

import { RetrievedDate } from "../../_components/trust-ui";

/** Review section: official posts the editor still has to render and add, with when each was last ingested. */
export function OfficialSourceGapsSection({ gaps }: { gaps: OfficialSourceGaps }) {
  return (
    <section className="space-y-4" aria-labelledby="official-gaps">
      <div>
        <h2 id="official-gaps" className="text-2xl font-semibold leading-8">
          Official posts not yet sourced
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          The daily re-fetch cannot read these. Render each one on the box and run the snapshot ingest to bring it in.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-4 text-card-foreground sm:p-5">
        <h3 className="text-base font-semibold leading-7">
          Manual sources <span className="font-normal text-muted-foreground">({gaps.manual.length})</span>
        </h3>
        <p className="text-sm leading-6 text-muted-foreground">Cited, but re-checked only when an editor re-ingests them.</p>
        <ul className="mt-3 divide-y">
          {gaps.manual.map((source) => (
            <li key={source.sourceKey} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
              <a href={source.url} className="min-w-0 break-words text-sm font-medium leading-6 underline-offset-4 hover:underline" rel="noreferrer" target="_blank">
                {source.title}
              </a>
              <span className="shrink-0 text-sm leading-6 text-muted-foreground">
                {source.lastIngestedAt ? (
                  <>
                    Last ingested <RetrievedDate iso={source.lastIngestedAt} />
                  </>
                ) : (
                  "Never ingested"
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border bg-card p-4 text-card-foreground sm:p-5">
        <h3 className="text-base font-semibold leading-7">
          Bungie news posts no source covers{" "}
          {gaps.feed.ok ? <span className="font-normal text-muted-foreground">({gaps.feed.posts.length})</span> : null}
        </h3>
        <p className="text-sm leading-6 text-muted-foreground">From the Bungie news RSS feed, without Destiny posts.</p>
        {gaps.feed.ok ? (
          gaps.feed.posts.length > 0 ? (
            <ul className="mt-3 divide-y">
              {gaps.feed.posts.map((post) => (
                <li key={post.url} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <a href={post.url} className="min-w-0 break-words text-sm font-medium leading-6 underline-offset-4 hover:underline" rel="noreferrer" target="_blank">
                    {post.title}
                  </a>
                  <span className="shrink-0 text-sm leading-6 text-muted-foreground">
                    {post.publishedAt ? (
                      <>
                        Posted <RetrievedDate iso={post.publishedAt} />
                      </>
                    ) : (
                      "Date not given"
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm leading-6">Every post in the feed has a source.</p>
          )
        ) : (
          <p className="mt-3 text-sm leading-6">The feed could not be read just now ({gaps.feed.error}).</p>
        )}
      </div>
    </section>
  );
}

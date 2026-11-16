"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { Input } from "@/components/ui/input";
import { hitHref, searchPages, type SearchEntry } from "@/src/wiki/search";

function Results({ tenantSlug, entries }: { tenantSlug: string; entries: SearchEntry[] }) {
  const query = useSearchParams().get("q")?.trim() ?? "";
  const hits = searchPages(entries, query);
  const summaries = new Map(entries.map((entry) => [entry.slug, entry.summary]));

  return (
    <>
      <form action={`/${tenantSlug}/search`} role="search" className="max-w-xl" key={query}>
        <label htmlFor="search-page-input" className="sr-only">
          Search wiki pages
        </label>
        <Input id="search-page-input" name="q" type="search" defaultValue={query} placeholder="Search pages" enterKeyHint="search" />
      </form>
      {!query ? null : hits.length === 0 ? (
        <div className="border bg-card p-6 text-card-foreground">
          <h2 className="text-h3 font-semibold">No pages match “{query}”</h2>
          <p className="mt-2 text-ui text-muted-foreground">
            Check the spelling, or <a href={`/${tenantSlug}/suggest`}>suggest this page</a>.
          </p>
        </div>
      ) : (
        <>
          <p className="text-ui text-muted-foreground" role="status">
            {hits.length} {hits.length === 1 ? "page matches" : "pages match"} “{query}”
          </p>
          <ol className="divide-y border-y">
            {hits.map((hit) => (
              <li key={hit.slug} className="py-4">
                <a href={hitHref(tenantSlug, hit)} className="text-h3 font-semibold">
                  {hit.title}
                  {hit.heading ? ` › ${hit.heading.text}` : null}
                </a>
                {hit.category ? <p className="mt-1 text-small text-muted-foreground">{hit.category}</p> : null}
                {summaries.get(hit.slug) ? <p className="mt-1 max-w-3xl text-ui text-muted-foreground">{summaries.get(hit.slug)}</p> : null}
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  );
}

/** Full results for the header search; the query lives in ?q= so this page stays static. */
export function SearchResults({ tenantSlug, entries }: { tenantSlug: string; entries: SearchEntry[] }) {
  return (
    <section className="space-y-6">
      <h1 className="text-title font-display text-foreground">Search</h1>
      <Suspense fallback={<p className="text-ui text-muted-foreground">Loading…</p>}>
        <Results tenantSlug={tenantSlug} entries={entries} />
      </Suspense>
    </section>
  );
}

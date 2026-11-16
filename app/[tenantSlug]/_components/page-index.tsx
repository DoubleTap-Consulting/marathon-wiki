"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import type { WikiPageSummary, WikiTenant } from "@/src/db/wiki";

import { EmptyState, IndexTable } from "./index-ui";
import { Input } from "@/components/ui/input";

/** All pages: the index table with a filter field above it. */
export function PageIndex({
  tenant,
  pages,
}: {
  tenant: WikiTenant;
  pages: WikiPageSummary[];
}) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    setQuery(new URLSearchParams(window.location.search).get("q")?.trim() ?? "");
  }, []);

  const trimmed = query.trim();
  const filteredPages = useMemo(() => {
    const normalizedQuery = trimmed.toLowerCase();
    if (!normalizedQuery) return pages;
    return pages.filter((page) =>
      `${page.title} ${page.summary ?? ""} ${page.slug} ${page.category?.name ?? ""}`.toLowerCase().includes(normalizedQuery),
    );
  }, [pages, trimmed]);

  return (
    <div className="space-y-4">
      <form
        className="w-full max-w-xl"
        role="search"
        data-wiki-event="search_submit"
        data-wiki-event-label="page-index"
        data-wiki-tenant={tenant.slug}
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <label htmlFor="page-index-search" className="mb-1.5 block text-small font-medium">
          Filter pages
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="page-index-search"
            name="q"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder="Title, summary or category"
            className="px-9"
          />
        </div>
      </form>

      <p className="label" role="status" aria-live="polite">
        {trimmed ? `${filteredPages.length} ${filteredPages.length === 1 ? "result" : "results"} for ‘${trimmed}’` : ""}
      </p>

      {pages.length === 0 ? (
        <EmptyState themeSlug={tenant.slug} kicker="No pages" title="Nothing published yet" description="No pages yet. The AI editor publishes the first ones after its sources are checked." />
      ) : trimmed && filteredPages.length === 0 ? (
        <div className="border-t border-foreground">
          <EmptyState
            title={`No pages match ‘${trimmed}’.`}
            description="Try another word, or suggest the page."
            action={
              <a href={`/${tenant.slug}/suggest`} className="inline-flex min-h-6 items-center text-ui text-link underline underline-offset-4 pointer-coarse:min-h-11">
                Suggest a page →
              </a>
            }
          />
        </div>
      ) : (
        <IndexTable tenantSlug={tenant.slug} pages={filteredPages} caption={trimmed ? `Pages matching ${trimmed}` : "All published pages, A to Z"} />
      )}
    </div>
  );
}

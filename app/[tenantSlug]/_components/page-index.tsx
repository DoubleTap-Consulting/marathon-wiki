"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import type { WikiPageSummary, WikiTenant } from "@/src/db/wiki";

import { EmptyState, PageGrid } from "./wiki-chrome";

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

  const filteredPages = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return pages;
    }

    return pages.filter((page) =>
      `${page.title} ${page.summary ?? ""} ${page.slug}`
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [pages, query]);

  return (
    <div className="space-y-6">
      <form
        className="flex min-h-11 w-full max-w-xl gap-2"
        role="search"
        data-wiki-event="search_submit"
        data-wiki-event-label="page-index"
        data-wiki-tenant={tenant.slug}
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <label htmlFor="page-index-search" className="sr-only">
          Filter page index
        </label>
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="page-index-search"
            name="q"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder="Filter page index"
            className="min-h-11 w-full rounded-md border border-input bg-card px-9 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </form>

      {query ? (
        <div className="rounded-lg border bg-card p-4 text-card-foreground">
          <p className="text-sm leading-6 text-muted-foreground">
            Showing results for{" "}
            <span className="font-medium text-card-foreground">{query}</span>.
          </p>
        </div>
      ) : null}

      {query && filteredPages.length === 0 ? (
        <EmptyState
          title="No matching pages"
          description="Try a different page title, category term, or browse the full page index."
        />
      ) : (
        <PageGrid
          tenant={tenant}
          pages={filteredPages}
          emptyTitle="No published pages yet"
          emptyDescription="This tenant is active, but there are no published wiki pages to browse."
        />
      )}
    </div>
  );
}

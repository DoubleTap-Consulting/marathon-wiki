import { BookOpen, Search } from "lucide-react";

import type {
  WikiCategorySummary,
  WikiPageSummary,
  WikiTenant,
} from "@/src/db/wiki";

import { MenuSheet, SearchSheet } from "./header-sheets";

export function WikiChrome({
  tenant,
  categories,
  children,
  width = "default",
  skipTarget = "main",
}: {
  tenant: WikiTenant;
  categories: WikiCategorySummary[];
  children: React.ReactNode;
  /** "article" uses the 3-column reading layout width. */
  width?: "default" | "article";
  skipTarget?: string;
}) {
  const searchForm = (idSuffix: string) => (
    <form
      action={`/${tenant.slug}/pages`}
      className="flex w-full min-w-0 gap-2"
      role="search"
      data-wiki-event="search_submit"
      data-wiki-event-label="site-header"
      data-wiki-tenant={tenant.slug}
    >
      <label htmlFor={`wiki-search-${idSuffix}`} className="sr-only">
        Search wiki pages
      </label>
      <div className="relative min-w-0 flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          id={`wiki-search-${idSuffix}`}
          name="q"
          type="search"
          placeholder="Search pages"
          className="h-9 w-full rounded-md border border-input bg-background px-9 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm pointer-coarse:h-11"
        />
      </div>
    </form>
  );

  return (
    <div className="min-h-screen bg-background">
      <a
        href={`#${skipTarget}`}
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-2"
      >
        {skipTarget === "article" ? "Skip to article" : "Skip to content"}
      </a>
      <header className="sticky top-0 z-30 h-14 border-b bg-card/95 backdrop-blur">
        <div
          className={`mx-auto flex h-full w-full items-center gap-4 px-5 ${
            width === "article" ? "max-w-[1240px] lg:px-8" : "max-w-6xl sm:px-6 lg:px-8"
          }`}
        >
          <a
            href={`/${tenant.slug}`}
            className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-md text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <BookOpen className="size-4" aria-hidden="true" />
            </span>
            <span className="text-base font-semibold">{tenant.name}</span>
          </a>
          <div className="ml-auto hidden w-full max-w-xs md:block">{searchForm("header")}</div>
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <SearchSheet>{searchForm("sheet")}</SearchSheet>
            <MenuSheet>
              <nav className="grid gap-1" aria-label="Wiki sections">
                <NavPill href={`/${tenant.slug}`}>Home</NavPill>
                <NavPill href={`/${tenant.slug}/pages`}>All pages</NavPill>
                <NavPill
                  href={`/${tenant.slug}/suggest`}
                  eventName="suggestion_cta"
                  eventLabel="header"
                  tenantSlug={tenant.slug}
                >
                  Suggest page
                </NavPill>
                <NavPill href={`/${tenant.slug}/review`}>Review</NavPill>
                {categories.length > 0 ? (
                  <p className="mt-4 mb-1 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Categories
                  </p>
                ) : null}
                {categories.map((category) => (
                  <NavPill key={category.id} href={`/${tenant.slug}/categories/${category.slug}`}>
                    {category.name}
                  </NavPill>
                ))}
              </nav>
            </MenuSheet>
          </div>
        </div>
      </header>

      <main
        id="main"
        className={
          width === "article"
            ? "mx-auto w-full max-w-[1240px] px-5 pt-6 pb-16 md:px-8 lg:pt-10"
            : "mx-auto w-full max-w-6xl px-5 py-8 sm:px-6 lg:px-8"
        }
      >
        {children}
      </main>
    </div>
  );
}

export function PageGrid({
  tenant,
  pages,
  emptyTitle,
  emptyDescription,
}: {
  tenant: WikiTenant;
  pages: WikiPageSummary[];
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (pages.length === 0) {
    return (
      <EmptyState title={emptyTitle} description={emptyDescription} />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {pages.map((page) => (
        <a
          key={page.id}
          href={`/${tenant.slug}/${page.slug}`}
          className="block min-h-36 rounded-lg border bg-card p-5 text-card-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <div className="flex min-h-full flex-col justify-between gap-4">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold leading-7">{page.title}</h3>
              <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
                {page.summary ?? "No summary has been published for this page yet."}
              </p>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Updated {formatDate(page.updatedAt)}
            </p>
          </div>
        </a>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-6 text-card-foreground">
      <h2 className="text-lg font-semibold leading-7">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function NavPill({
  href,
  children,
  eventName,
  eventLabel,
  tenantSlug,
}: {
  href: string;
  children: React.ReactNode;
  eventName?: string;
  eventLabel?: string;
  tenantSlug?: string;
}) {
  return (
    <a
      href={href}
      className="flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      data-wiki-event={eventName}
      data-wiki-event-label={eventLabel}
      data-wiki-tenant={tenantSlug}
    >
      {children}
    </a>
  );
}

function formatDate(value: Date | string | null) {
  const date = value ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

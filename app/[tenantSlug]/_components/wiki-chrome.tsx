import { BookOpen, Search } from "lucide-react";

import type {
  WikiCategorySummary,
  WikiPageSummary,
  WikiTenant,
} from "@/src/db/wiki";

export function WikiChrome({
  tenant,
  categories,
  children,
}: {
  tenant: WikiTenant;
  categories: WikiCategorySummary[];
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-5 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <a
              href={`/${tenant.slug}`}
              className="flex min-h-11 items-center gap-3 rounded-md text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <BookOpen className="size-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-lg font-semibold leading-6">
                  {tenant.name}
                </span>
                <span className="block text-sm leading-5 text-muted-foreground">
                  {tenant.gameTitle}
                </span>
              </span>
            </a>

            <form
              action={`/${tenant.slug}/pages`}
              className="grid w-[calc(100vw-4rem)] max-w-[calc(100vw-4rem)] gap-2 sm:flex sm:min-h-11 sm:w-full sm:max-w-md"
              role="search"
              style={{ width: "calc(100vw - 4rem)", maxWidth: "28rem" }}
            >
              <label htmlFor="wiki-search" className="sr-only">
                Search wiki pages
              </label>
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  id="wiki-search"
                  name="q"
                  type="search"
                  placeholder="Search pages"
                  className="min-h-11 w-full rounded-md border border-input bg-background px-9 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <button
                type="submit"
                className="min-h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card sm:shrink-0"
              >
                Search
              </button>
            </form>
          </div>

          <nav
            className="flex w-[calc(100vw-4rem)] max-w-[calc(100vw-4rem)] flex-wrap gap-2 sm:w-full sm:max-w-full"
            aria-label="Wiki sections"
            style={{ width: "calc(100vw - 4rem)", maxWidth: "100%" }}
          >
            <NavPill href={`/${tenant.slug}`}>Home</NavPill>
            <NavPill href={`/${tenant.slug}/pages`}>All pages</NavPill>
            {categories.map((category) => (
              <NavPill
                key={category.id}
                href={`/${tenant.slug}/categories/${category.slug}`}
              >
                {category.name}
              </NavPill>
            ))}
          </nav>
        </div>
      </header>

      <div
        className="mx-auto w-full max-w-6xl overflow-hidden px-5 py-8 sm:px-6 lg:px-8"
      >
        {children}
      </div>
    </main>
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
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="flex min-h-11 items-center rounded-md border bg-background px-3 text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
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

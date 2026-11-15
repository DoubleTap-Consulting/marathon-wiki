import { BookOpen, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { networkBrand, type NetworkBrand } from "@/src/wiki/network";
import { themeFor } from "@/themes/registry";

import type {
  WikiCategorySummary,
  WikiPageSummary,
  WikiTenant,
} from "@/src/db/wiki";

import { MenuSheet, SchemeToggle, SearchSheet } from "./header-sheets";
import { SiteDate } from "./site-date";
import { Input } from "@/components/ui/input";

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
  const theme = themeFor(tenant.slug);
  const brand = networkBrand();
  const chrome = chromeProps(theme.slug, theme.chrome);
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
        <Input
          id={`wiki-search-${idSuffix}`}
          name="q"
          type="search"
          placeholder="Search pages"
          className="px-9"
        />
      </div>
    </form>
  );

  return (
    <div className="min-h-screen bg-background">
      <a
        href={`#${skipTarget}`}
        className="sr-only z-50 border border-foreground bg-primary px-4 hover:bg-primary-hover dark:border-transparent py-2 text-ui font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-2"
      >
        {skipTarget === "article" ? "Skip to article" : "Skip to content"}
      </a>
      <header {...chrome} className={cn(chrome.className, "sticky top-0 z-30 h-[59px] border-b-3 border-brand bg-background/95 backdrop-blur-md")}>
        <div
          className={`mx-auto flex h-full w-full items-center gap-4 px-5 ${
            width === "article" ? "max-w-[1240px] lg:px-8" : "max-w-6xl sm:px-6 lg:px-8"
          }`}
        >
          {brand ? (
            <a
              href={`/${tenant.slug}`}
              aria-label={`${brand.name}, ${theme.identity.descriptor}, home`}
              className="flex min-h-11 min-w-0 flex-col justify-center gap-1.5 text-foreground"
            >
              <span
                className={cn(
                  "self-start font-display text-base leading-none font-extrabold whitespace-nowrap sm:text-[1.25rem]",
                  brand.placeholder && "-mx-1.5 border border-dashed border-muted-foreground px-1.5 py-1",
                )}
              >
                {brand.name}
              </span>
              <span className="truncate text-small leading-none text-muted-foreground">{theme.identity.descriptor}</span>
            </a>
          ) : (
            <a href={`/${tenant.slug}`} className="flex min-h-11 shrink-0 items-center gap-2.5 text-foreground">
              <span className="flex size-8 items-center justify-center bg-foreground text-background">
                <BookOpen className="size-4" aria-hidden="true" />
              </span>
              <span className="text-ui font-semibold">{tenant.name}</span>
            </a>
          )}
          <div className="ml-auto hidden w-full max-w-xs md:block">{searchForm("header")}</div>
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <SearchSheet>{searchForm("sheet")}</SearchSheet>
            <SchemeToggle />
            <MenuSheet
              primary={
                <>
                  <NavPill href={`/${tenant.slug}`}>Home</NavPill>
                  <NavPill href={`/${tenant.slug}/pages`}>All pages</NavPill>
                </>
              }
              review={<NavPill href={`/${tenant.slug}/review`}>Review</NavPill>}
            >
              <>
                {categories.length > 0 ? (
                  <p className="mt-4 mb-1 px-3 text-label font-medium uppercase tracking-wide text-muted-foreground">
                    Categories
                  </p>
                ) : null}
                {categories.map((category) => (
                  <NavPill key={category.id} href={`/${tenant.slug}/categories/${category.slug}`}>
                    {category.name}
                  </NavPill>
                ))}
              </>
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

      <SiteFooter tenant={tenant} categories={categories} brand={brand} />
    </div>
  );
}

/** "ink" chrome resolves the dark tokens in both schemes; "surface" follows the page. */
function chromeProps(themeSlug: string, chrome: "ink" | "surface") {
  return { "data-theme": themeSlug, className: chrome === "ink" ? "dark text-foreground [color-scheme:dark]" : "text-foreground" };
}

export function SiteFooter({
  tenant,
  categories,
  brand = networkBrand(),
}: {
  tenant: Pick<WikiTenant, "slug" | "gameTitle">;
  categories: Array<Pick<WikiCategorySummary, "id" | "slug" | "name">>;
  brand?: NetworkBrand | null;
}) {
  const theme = themeFor(tenant.slug);
  const chrome = chromeProps(theme.slug, theme.chrome);
  const { developer } = theme.identity;
  const links = [
    { href: `/${tenant.slug}`, label: "Home" },
    { href: `/${tenant.slug}/pages`, label: "All pages" },
    ...categories.map((category) => ({ href: `/${tenant.slug}/categories/${category.slug}`, label: category.name })),
    { href: `/${tenant.slug}/review`, label: "Review" },
  ];

  return (
    <footer {...chrome} className={cn(chrome.className, "border-t bg-background")}>
      <div className="mx-auto w-full max-w-6xl space-y-6 px-5 py-10 sm:px-6 lg:px-8">
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-5 text-ui">
            {links.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="inline-flex min-h-6 items-center underline-offset-3 hover:underline pointer-coarse:min-h-11 pointer-coarse:min-w-11">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-[68ch] text-small text-muted-foreground">
            Unofficial fan wiki. Not affiliated with or endorsed by {developer}. {tenant.gameTitle} is a trademark of {developer}.
            Pages are written and updated by AI from cited sources; check the sources.
          </p>
          {brand ? <NetworkSlot brand={brand} /> : null}
        </div>
      </div>
    </footer>
  );
}

function NetworkSlot({ brand }: { brand: NetworkBrand }) {
  const text = `Part of ${brand.name}`;
  if (brand.placeholder) {
    return <p className="label shrink-0 self-start border border-dashed border-input px-2 py-1 sm:self-auto">{text}</p>;
  }
  return brand.href ? (
    <a href={brand.href} className="label-strong shrink-0 underline-offset-3 hover:underline">
      {text}
    </a>
  ) : (
    <p className="label shrink-0">{text}</p>
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
          className="block min-h-36 border bg-card p-5 text-card-foreground"
        >
          <div className="flex min-h-full flex-col justify-between gap-4">
            <div className="space-y-2">
              <h3 className="text-h3 font-semibold">{page.title}</h3>
              <p className="line-clamp-3 text-ui text-muted-foreground">
                {page.summary ?? "No summary has been published for this page yet."}
              </p>
            </div>
            <p className="text-label text-muted-foreground">
              Updated {page.updatedAt ? <SiteDate iso={new Date(page.updatedAt).toISOString()} /> : "Unknown"}
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
    <div className="border bg-card p-6 text-card-foreground">
      <h2 className="text-h3 font-semibold">{title}</h2>
      <p className="mt-2 max-w-2xl text-ui text-muted-foreground">
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
      className="flex min-h-11 items-center px-3 text-ui font-medium text-foreground hover:bg-muted"
      data-wiki-event={eventName}
      data-wiki-event-label={eventLabel}
      data-wiki-tenant={tenantSlug}
    >
      {children}
    </a>
  );
}

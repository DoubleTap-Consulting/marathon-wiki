import { BookOpen } from "lucide-react";

import { cn } from "@/lib/utils";
import { networkBrand } from "@/src/wiki/network";
import { themeFor } from "@/themes/registry";

import type { WikiCategorySummary, WikiTenant } from "@/src/db/wiki";

import { MenuSheet, SchemeToggle, SearchSheet } from "./header-sheets";
import { SiteFooter, chromeProps } from "./site-footer";
import { SiteSearch } from "./site-search";

export { SiteFooter };

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
              className="flex min-h-11 min-w-0 flex-col justify-center gap-1.5 text-foreground"
            >
              <span
                className={cn(
                  "self-start font-display text-ui leading-none font-extrabold uppercase whitespace-nowrap sm:text-h3 sm:leading-none",
                  brand.placeholder && "-mx-1.5 border border-dashed border-muted-foreground px-1.5 py-1",
                )}
              >
                {brand.name}
              </span>
              <span className="truncate text-small leading-none text-muted-foreground">
                {theme.identity.descriptor}
                <span className="sr-only">, home</span>
              </span>
            </a>
          ) : (
            <a href={`/${tenant.slug}`} className="flex min-h-11 shrink-0 items-center gap-2.5 text-foreground">
              <span className="flex size-8 items-center justify-center bg-foreground text-background">
                <BookOpen className="size-4" aria-hidden="true" />
              </span>
              <span className="text-ui font-semibold">{tenant.name}</span>
            </a>
          )}
          <div className="ml-auto hidden w-full max-w-xs md:block">
            <SiteSearch tenantSlug={tenant.slug} mode="popover" />
          </div>
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <SearchSheet tenantSlug={tenant.slug} />
            <SchemeToggle />
            <MenuSheet
              tenantSlug={tenant.slug}
              primary={
                <>
                  <NavPill href={`/${tenant.slug}`}>Home</NavPill>
                  <NavPill href={`/${tenant.slug}/pages`}>All pages</NavPill>
                </>
              }
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

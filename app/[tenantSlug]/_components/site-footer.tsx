import { cn } from "@/lib/utils";
import { networkBrand, type NetworkBrand } from "@/src/wiki/network";
import { themeFor } from "@/themes/registry";

import type { WikiCategorySummary, WikiTenant } from "@/src/db/wiki";

// Kept apart from wiki-chrome so the client error boundary can render the footer without
// pulling the header's search and sheet code into its own bundle.
/** "ink" chrome resolves the dark tokens in both schemes; "surface" follows the page. */
export function chromeProps(themeSlug: string, chrome: "ink" | "surface") {
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
    ...(theme.imagery ? [{ href: `/${tenant.slug}/credits`, label: "Image credits" }] : []),
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

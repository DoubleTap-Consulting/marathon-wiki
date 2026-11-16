import type { Metadata } from "next";

import { FigureBand } from "@/components/figure";
import { homeBandFor } from "@/src/wiki/imagery";
import { getCachedWikiHome } from "@/src/wiki/cache";
import { buildWikiMetadata } from "@/src/wiki/metadata";
import { normalizeTenantSlug } from "@/src/wiki/tenant-routing";
import { themeFor } from "@/themes/registry";

import { MissingWikiPage } from "./_components/missing-page";
import { WikiAdSlot, WikiPremiumHook } from "./_components/monetization";
import { CategoryGlyph, CropMarks, DitherBand, EmptyState, IndexTable, revisionCode } from "./_components/index-ui";
import { SiteDate } from "./_components/site-date";
import { WikiChrome } from "./_components/wiki-chrome";

export const revalidate = 300;
export const dynamic = "force-static";

type TenantHomeProps = {
  params: Promise<{
    tenantSlug: string;
  }>;
};

export async function generateMetadata({
  params,
}: TenantHomeProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const snapshot = await getCachedWikiHome(normalizeTenantSlug(tenantSlug));

  if (!snapshot) {
    return {
      title: "Wiki not found",
    };
  }

  return buildWikiMetadata({
    title: snapshot.tenant.name,
    description: `Browse ${snapshot.tenant.gameTitle} wiki pages, categories, and source-backed game references.`,
    path: `/${snapshot.tenant.slug}`,
    siteName: snapshot.tenant.name,
  });
}

export default async function TenantHome({ params }: TenantHomeProps) {
  const { tenantSlug } = await params;
  const normalizedTenantSlug = normalizeTenantSlug(tenantSlug);
  const snapshot = await getCachedWikiHome(normalizedTenantSlug);

  if (!snapshot) {
    return (
      <MissingWikiPage
        tenantSlug={normalizedTenantSlug}
        title="Wiki not found"
        description="This tenant is not active yet or does not have a public wiki."
      />
    );
  }

  const theme = themeFor(snapshot.tenant.slug);
  const homeBand = homeBandFor(snapshot.tenant.slug);
  const { tenant, categories, pages, recentChanges, sourcesCheckedAt } = snapshot;
  const meta = [
    theme.identity.kicker,
    `${pages.length} ${pages.length === 1 ? "page" : "pages"}`,
  ].filter(Boolean);

  return (
    <WikiChrome tenant={tenant} categories={categories}>
      <section aria-labelledby="wiki-home-title" className="relative border-b border-foreground px-1 pt-4 pb-6 sm:px-4 sm:pt-6">
        <CropMarks />
        <div className="space-y-3">
          <p className="label">
            {meta.join(" · ")}
            {sourcesCheckedAt ? (
              <>
                {" · "}Sources checked <SiteDate iso={new Date(sourcesCheckedAt).toISOString()} />
              </>
            ) : null}
          </p>
          <h1 id="wiki-home-title" className="max-w-3xl text-title font-display text-foreground">
            {theme.identity.descriptor}
          </h1>
          <p className="max-w-[56ch] text-body text-muted-foreground">
            {theme.identity.tagline ??
              `Source-backed pages on ${tenant.gameTitle}'s weapons, maps, factions and systems, kept current by AI and checked by readers.`}
          </p>
        </div>
        {homeBand ? (
          <FigureBand image={homeBand} slot="home-band" className="mt-6" />
        ) : (
          <DitherBand themeSlug={theme.slug} region="masthead" className="mt-6" />
        )}
      </section>

      {pages.length === 0 ? (
        <EmptyState
          themeSlug={theme.slug}
          kicker="No pages"
          title="Nothing published yet"
          description="No pages yet. The AI editor publishes the first ones after its sources are checked."
        />
      ) : (
        <>
          <div className="grid gap-x-10 gap-y-10 border-b border-foreground py-8 lg:grid-cols-12">
            {recentChanges.length > 0 ? (
              <section aria-labelledby="recently-changed" className="lg:col-span-8">
                <h2 id="recently-changed" className="label-strong pb-2">Recently changed</h2>
                <ol className="border-t">
                  {recentChanges.map((change) => (
                    <li key={change.slug} className="relative border-b py-3 hover:bg-muted">
                      <div className="flex items-baseline justify-between gap-4 px-1">
                        <a
                          href={`/${tenant.slug}/${change.slug}`}
                          className="text-ui font-medium text-foreground after:absolute after:inset-0 after:content-['']"
                        >
                          {change.title}
                        </a>
                        <span className="label shrink-0">
                          {revisionCode(change.revisionNumber)} · <SiteDate iso={new Date(change.createdAt).toISOString()} />
                        </span>
                      </div>
                      {change.changeNote ? (
                        <p className="mt-1 line-clamp-1 px-1 text-small text-muted-foreground">{change.changeNote.split("\n")[0]}</p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            <aside aria-label="Browse and support" className={recentChanges.length > 0 ? "space-y-6 lg:col-span-4" : "space-y-6 lg:col-span-12"}>
              <nav aria-labelledby="browse-categories">
                <h2 id="browse-categories" className="label-strong pb-2">Browse</h2>
                {categories.length > 0 ? (
                  <ul className="border-t">
                    {categories.map((category) => (
                      <li key={category.id} className="border-b">
                        <a
                          href={`/${tenant.slug}/categories/${category.slug}`}
                          className="flex min-h-11 items-center gap-3 px-1 text-ui text-foreground hover:bg-muted"
                        >
                          <CategoryGlyph slug={category.slug} />
                          <span className="flex-1">{category.name}</span>
                          <span className="label">
                            {category.pageCount}
                            <span className="sr-only"> {category.pageCount === 1 ? "page" : "pages"}</span>
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="border-t pt-3 text-small text-muted-foreground">No categories yet.</p>
                )}
              </nav>
              <WikiPremiumHook tenantSlug={tenant.slug} />
              <WikiAdSlot placement="sidebar" tenantSlug={tenant.slug} />
            </aside>
          </div>

          <section aria-labelledby="all-pages" className="py-8">
            <div className="flex items-baseline justify-between gap-4 pb-3">
              <h2 id="all-pages" className="label-strong">
                All pages <span className="text-muted-foreground">A–Z</span>
              </h2>
              <a href={`/${tenant.slug}/pages`} className="inline-flex min-h-6 items-center text-ui text-link underline underline-offset-4 pointer-coarse:min-h-11">
                Filter all pages
              </a>
            </div>
            <IndexTable tenantSlug={tenant.slug} pages={pages} caption={`All ${pages.length} published pages, A to Z`} />
          </section>
        </>
      )}
    </WikiChrome>
  );
}

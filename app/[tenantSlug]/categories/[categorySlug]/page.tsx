import { FigureBand } from "@/components/figure";
import { hubBandFor } from "@/src/wiki/imagery";
import type { Metadata } from "next";

import { getCachedWikiCategory } from "@/src/wiki/cache";
import { buildWikiMetadata } from "@/src/wiki/metadata";
import { normalizeTenantSlug } from "@/src/wiki/tenant-routing";
import { themeFor } from "@/themes/registry";

import { MissingWikiPage } from "../../_components/missing-page";
import { WikiAdSlot } from "../../_components/monetization";
import { CategoryGlyph, EmptyState, IndexTable } from "../../_components/index-ui";
import { SiteDate } from "../../_components/site-date";
import { WikiChrome } from "../../_components/wiki-chrome";

export const revalidate = 300;
export const dynamic = "force-static";

type CategoryPageProps = {
  params: Promise<{
    tenantSlug: string;
    categorySlug: string;
  }>;
};

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const { tenantSlug, categorySlug } = await params;
  const snapshot = await getCachedWikiCategory(
    normalizeTenantSlug(tenantSlug),
    normalizeTenantSlug(categorySlug),
  );

  if (!snapshot) {
    return {
      title: "Category not found",
    };
  }

  return buildWikiMetadata({
    title: snapshot.category.name,
    description: snapshot.category.description,
    path: `/${snapshot.tenant.slug}/categories/${snapshot.category.slug}`,
    siteName: snapshot.tenant.name,
  });
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { tenantSlug, categorySlug } = await params;
  const normalizedTenantSlug = normalizeTenantSlug(tenantSlug);
  const snapshot = await getCachedWikiCategory(
    normalizedTenantSlug,
    normalizeTenantSlug(categorySlug),
  );

  if (!snapshot) {
    return (
      <MissingWikiPage
        tenantSlug={normalizedTenantSlug}
        title="Category not found"
        description="This category may not exist yet, may be empty, or may belong to a different tenant."
      />
    );
  }

  const { tenant, category, pages, sourcesCheckedAt } = snapshot;
  const theme = themeFor(tenant.slug);
  const hubBand = hubBandFor(tenant.slug, category.slug);

  return (
    <WikiChrome tenant={tenant} categories={snapshot.categories}>
      <section aria-labelledby="category-title">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <p className="label">Category</p>
          <p className="label">
            {category.pageCount} {category.pageCount === 1 ? "page" : "pages"}
            {sourcesCheckedAt ? (
              <>
                {" · "}Sources checked <SiteDate iso={new Date(sourcesCheckedAt).toISOString()} />
              </>
            ) : null}
          </p>
        </div>
        <h1 id="category-title" className="mt-2 flex items-center gap-3 text-title font-display text-foreground">
          <CategoryGlyph slug={category.slug} className="size-6" />
          {category.name}
        </h1>
        {category.description ? <p className="mt-3 max-w-[68ch] text-body text-muted-foreground">{category.description}</p> : null}

        {hubBand ? <FigureBand image={hubBand} slot="hub-band" className="mt-6" /> : null}

        <div className="mt-6">
          {pages.length > 0 ? (
            <IndexTable tenantSlug={tenant.slug} pages={pages} showCategory={false} caption={`Pages in ${category.name}, A to Z`} />
          ) : (
            <div className="border-t border-foreground">
              <EmptyState themeSlug={theme.slug} kicker={category.name} title={`No pages in ${category.name} yet.`} description="Pages filed under this category appear here once they are published." />
            </div>
          )}
        </div>

        <WikiAdSlot placement="footer" tenantSlug={tenant.slug} className="mt-10 block" />
      </section>
    </WikiChrome>
  );
}

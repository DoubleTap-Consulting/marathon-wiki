import type { Metadata } from "next";

import { getCachedWikiHome } from "@/src/wiki/cache";
import { buildWikiMetadata } from "@/src/wiki/metadata";
import { normalizeTenantSlug } from "@/src/wiki/tenant-routing";

import { MissingWikiPage } from "./_components/missing-page";
import { WikiAdSlot, WikiPremiumHook } from "./_components/monetization";
import { PageGrid, WikiChrome } from "./_components/wiki-chrome";

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

  return (
    <WikiChrome tenant={snapshot.tenant} categories={snapshot.categories}>
      <section className="grid gap-8 lg:grid-cols-[1fr_18rem] lg:items-start">
        <div className="space-y-8">
          <div className="space-y-3">
            <p className="text-label font-medium uppercase tracking-normal text-muted-foreground">
              Public wiki
            </p>
            <h1 className="max-w-3xl text-display font-semibold text-foreground">
              {snapshot.tenant.gameTitle}
            </h1>
            <p className="max-w-3xl text-body text-muted-foreground">
              Source-backed pages on {snapshot.tenant.gameTitle}&apos;s weapons, maps,
              factions and systems, kept current by AI and checked by readers.
            </p>
          </div>

          <section className="space-y-4" aria-labelledby="featured-pages">
            <div className="flex items-center justify-between gap-4">
              <h2
                id="featured-pages"
                className="text-h2 font-semibold text-foreground"
              >
                Published pages
              </h2>
              <a
                href={`/${snapshot.tenant.slug}/pages`}
                className="inline-flex min-h-11 items-center rounded-md border bg-card px-3 text-ui font-medium text-card-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                View all
              </a>
            </div>
            <PageGrid
              tenant={snapshot.tenant}
              pages={snapshot.pages}
              emptyTitle="No published pages yet"
              emptyDescription="This tenant is active, but there are no published wiki pages to browse."
            />
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border bg-card p-5 text-card-foreground">
            <h2 className="text-h3 font-semibold">Categories</h2>
            {snapshot.categories.length > 0 ? (
              <div className="mt-4 space-y-3">
                {snapshot.categories.map((category) => (
                  <a
                    key={category.id}
                    href={`/${snapshot.tenant.slug}/categories/${category.slug}`}
                    className="block min-h-16 rounded-md border bg-background p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                  >
                    <span className="block text-ui font-medium text-foreground">
                      {category.name}
                    </span>
                    <span className="mt-1 block text-small text-muted-foreground">
                      {category.pageCount} published{" "}
                      {category.pageCount === 1 ? "page" : "pages"}
                    </span>
                  </a>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-small text-muted-foreground">
                Categories will appear here once seeded for this tenant.
              </p>
            )}
          </section>
          <WikiPremiumHook tenantSlug={snapshot.tenant.slug} />
          <WikiAdSlot placement="sidebar" tenantSlug={snapshot.tenant.slug} />
        </aside>
      </section>
    </WikiChrome>
  );
}

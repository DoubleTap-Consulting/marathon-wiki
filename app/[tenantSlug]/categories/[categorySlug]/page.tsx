import type { Metadata } from "next";

import { getCachedWikiCategory } from "@/src/wiki/cache";
import { normalizeTenantSlug } from "@/src/wiki/tenant-routing";

import { MissingWikiPage } from "../../_components/missing-page";
import { PageGrid, WikiChrome } from "../../_components/wiki-chrome";

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

  return {
    title: snapshot
      ? `${snapshot.category.name} | ${snapshot.tenant.name}`
      : "Category not found",
    description: snapshot?.category.description ?? undefined,
  };
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

  return (
    <WikiChrome tenant={snapshot.tenant} categories={snapshot.categories}>
      <section className="space-y-6">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-normal text-muted-foreground">
            Category
          </p>
          <h1 className="text-4xl font-semibold leading-tight text-foreground">
            {snapshot.category.name}
          </h1>
          <p className="max-w-3xl text-base leading-8 text-muted-foreground">
            {snapshot.category.description ??
              "Published pages grouped under this wiki category."}
          </p>
        </div>

        <PageGrid
          tenant={snapshot.tenant}
          pages={snapshot.pages}
          emptyTitle="No pages in this category yet"
          emptyDescription="This category exists, but no published pages are assigned to it yet."
        />
      </section>
    </WikiChrome>
  );
}

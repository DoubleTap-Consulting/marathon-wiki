import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getCachedWikiHome, getCachedWikiPages } from "@/src/wiki/cache";
import { normalizeTenantSlug } from "@/src/wiki/tenant-routing";

import { PageIndex } from "../_components/page-index";
import { WikiChrome } from "../_components/wiki-chrome";

export const revalidate = 300;
export const dynamic = "force-static";

type TenantPagesProps = {
  params: Promise<{
    tenantSlug: string;
  }>;
};

export async function generateMetadata({
  params,
}: TenantPagesProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const snapshot = await getCachedWikiHome(normalizeTenantSlug(tenantSlug));

  return {
    title: snapshot ? `All pages | ${snapshot.tenant.name}` : "Wiki not found",
  };
}

export default async function TenantPages({
  params,
}: TenantPagesProps) {
  const { tenantSlug } = await params;
  const snapshot = await getCachedWikiHome(normalizeTenantSlug(tenantSlug));

  if (!snapshot) {
    notFound();
  }

  const pages = await getCachedWikiPages(snapshot.tenant.slug, snapshot.tenant.id);

  return (
    <WikiChrome tenant={snapshot.tenant} categories={snapshot.categories}>
      <section className="space-y-6">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-normal text-muted-foreground">
            Page index
          </p>
          <h1 className="text-4xl font-semibold leading-tight text-foreground">
            All pages
          </h1>
          <p className="max-w-3xl text-base leading-8 text-muted-foreground">
            Browse every published page for this tenant. The search box filters
            the current page index by title, slug, and summary.
          </p>
        </div>

        <PageIndex tenant={snapshot.tenant} pages={pages} />
      </section>
    </WikiChrome>
  );
}

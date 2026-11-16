import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getCachedWikiHome, getCachedWikiPages } from "@/src/wiki/cache";
import { buildWikiMetadata } from "@/src/wiki/metadata";
import { normalizeTenantSlug } from "@/src/wiki/tenant-routing";

import { WikiAdSlot } from "../_components/monetization";
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

  if (!snapshot) {
    return {
      title: "Wiki not found",
    };
  }

  return buildWikiMetadata({
    title: "All pages",
    description: `Browse every published ${snapshot.tenant.gameTitle} wiki page.`,
    path: `/${snapshot.tenant.slug}/pages`,
    siteName: snapshot.tenant.name,
  });
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
      <section aria-labelledby="all-pages-title">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <p className="label">Index</p>
          <p className="label">
            {pages.length} {pages.length === 1 ? "page" : "pages"}
          </p>
        </div>
        <h1 id="all-pages-title" className="mt-2 text-title font-display text-foreground">
          All pages
        </h1>

        <div className="mt-6">
          <PageIndex tenant={snapshot.tenant} pages={pages} />
        </div>

        <WikiAdSlot placement="footer" tenantSlug={snapshot.tenant.slug} className="mt-10 block" />
      </section>
    </WikiChrome>
  );
}

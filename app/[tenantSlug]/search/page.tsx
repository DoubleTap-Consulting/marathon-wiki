import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getCachedWikiHome, getCachedWikiSearchIndex } from "@/src/wiki/cache";
import { buildWikiMetadata } from "@/src/wiki/metadata";
import { normalizeTenantSlug } from "@/src/wiki/tenant-routing";

import { SearchResults } from "../_components/search-results";
import { WikiChrome } from "../_components/wiki-chrome";

type SearchPageProps = {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
};

export async function generateMetadata({ params }: SearchPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const snapshot = await getCachedWikiHome(normalizeTenantSlug(tenantSlug));
  if (!snapshot) return { title: "Wiki not found" };
  return {
    ...buildWikiMetadata({
      title: "Search",
      description: `Search every published ${snapshot.tenant.gameTitle} wiki page.`,
      path: `/${snapshot.tenant.slug}/search`,
      siteName: snapshot.tenant.name,
    }),
    robots: { index: false, follow: true },
  };
}

// Rendered per request so results are in the first paint; the index itself comes from the cache.
export default async function SearchPage({ params, searchParams }: SearchPageProps) {
  const [{ tenantSlug }, { q }] = await Promise.all([params, searchParams]);
  const snapshot = await getCachedWikiHome(normalizeTenantSlug(tenantSlug));
  if (!snapshot) notFound();
  const entries = await getCachedWikiSearchIndex(snapshot.tenant.slug, snapshot.tenant.id);

  return (
    <WikiChrome tenant={snapshot.tenant} categories={snapshot.categories}>
      <SearchResults tenantSlug={snapshot.tenant.slug} entries={entries} query={(Array.isArray(q) ? q[0] : q)?.trim() ?? ""} />
    </WikiChrome>
  );
}

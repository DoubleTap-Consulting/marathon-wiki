import { revalidateTag, unstable_cache } from "next/cache";

import {
  getWikiCategorySnapshot,
  getWikiHomeSnapshot,
  getWikiPageSnapshot,
  listPublishedWikiPagesByTenant,
  listWikiPageRevisions,
  listWikiSearchSources,
} from "@/src/db/wiki";

import { buildSearchEntry } from "./search-index";

export const WIKI_REVALIDATE_SECONDS = Number(
  process.env.WIKI_REVALIDATE_SECONDS ?? 300,
);

/**
 * Vercel keeps unstable_cache entries across deployments, and every Preview deployment shares one
 * cache while each reads its own database branch. Without the deployment in the key, one preview
 * (and even its build) serves pages another preview cached. Each deployment gets its own entries.
 */
export function wikiCacheScope(env: Partial<NodeJS.ProcessEnv> = process.env) {
  return env.VERCEL_DEPLOYMENT_ID || env.NEXT_DEPLOYMENT_ID || "local";
}

export function wikiTenantTag(tenantSlug: string) {
  return `wiki:tenant:${tenantSlug}`;
}

export function wikiTenantHomeTag(tenantSlug: string) {
  return `${wikiTenantTag(tenantSlug)}:home`;
}

export function wikiTenantPagesTag(tenantSlug: string) {
  return `${wikiTenantTag(tenantSlug)}:pages`;
}

export function wikiPageTag(tenantSlug: string, pageSlug: string) {
  return `${wikiTenantTag(tenantSlug)}:page:${pageSlug}`;
}

export function wikiCategoryTag(tenantSlug: string, categorySlug: string) {
  return `${wikiTenantTag(tenantSlug)}:category:${categorySlug}`;
}

export async function revalidateWikiTenant(tenantSlug: string) {
  revalidateTag(wikiTenantTag(tenantSlug), "max");
}

export async function revalidateWikiPage(tenantSlug: string, pageSlug: string) {
  revalidateTag(wikiTenantTag(tenantSlug), "max");
  revalidateTag(wikiTenantPagesTag(tenantSlug), "max");
  revalidateTag(wikiPageTag(tenantSlug, pageSlug), "max");
}

export async function revalidateWikiCategory(
  tenantSlug: string,
  categorySlug: string,
) {
  revalidateTag(wikiTenantTag(tenantSlug), "max");
  revalidateTag(wikiTenantPagesTag(tenantSlug), "max");
  revalidateTag(wikiCategoryTag(tenantSlug, categorySlug), "max");
}

export async function getCachedWikiHome(tenantSlug: string) {
  return unstable_cache(
    () => getWikiHomeSnapshot(tenantSlug),
    ["wiki-home", wikiCacheScope(), tenantSlug],
    {
      revalidate: WIKI_REVALIDATE_SECONDS,
      tags: [
        wikiTenantTag(tenantSlug),
        wikiTenantHomeTag(tenantSlug),
        wikiTenantPagesTag(tenantSlug),
      ],
    },
  )();
}

export async function getCachedWikiPages(tenantSlug: string, tenantId: string) {
  return unstable_cache(
    () => listPublishedWikiPagesByTenant(tenantId, undefined, 100),
    ["wiki-pages", wikiCacheScope(), tenantSlug],
    {
      revalidate: WIKI_REVALIDATE_SECONDS,
      tags: [wikiTenantTag(tenantSlug), wikiTenantPagesTag(tenantSlug)],
    },
  )();
}

export async function getCachedWikiCategory(
  tenantSlug: string,
  categorySlug: string,
) {
  return unstable_cache(
    () => getWikiCategorySnapshot(tenantSlug, categorySlug),
    ["wiki-category", wikiCacheScope(), tenantSlug, categorySlug],
    {
      revalidate: WIKI_REVALIDATE_SECONDS,
      tags: [
        wikiTenantTag(tenantSlug),
        wikiTenantPagesTag(tenantSlug),
        wikiCategoryTag(tenantSlug, categorySlug),
      ],
    },
  )();
}

export async function getCachedWikiPage(tenantSlug: string, pageSlug: string) {
  return unstable_cache(
    () => getWikiPageSnapshot(tenantSlug, pageSlug),
    ["wiki-page", wikiCacheScope(), tenantSlug, pageSlug],
    {
      revalidate: WIKI_REVALIDATE_SECONDS,
      tags: [
        wikiTenantTag(tenantSlug),
        wikiTenantPagesTag(tenantSlug),
        wikiPageTag(tenantSlug, pageSlug),
      ],
    },
  )();
}


export async function getCachedWikiPageRevisions(
  tenantSlug: string,
  pageSlug: string,
  tenantId: string,
  pageId: string,
) {
  return unstable_cache(
    () => listWikiPageRevisions(tenantId, pageId),
    ["wiki-page-revisions", wikiCacheScope(), tenantSlug, pageSlug],
    {
      revalidate: WIKI_REVALIDATE_SECONDS,
      tags: [wikiTenantTag(tenantSlug), wikiPageTag(tenantSlug, pageSlug)],
    },
  )();
}

/** The tenant's search index; a page publish revalidates it through the tenant's pages tag. */
export async function getCachedWikiSearchIndex(tenantSlug: string, tenantId: string) {
  return unstable_cache(
    async () => (await listWikiSearchSources(tenantId)).map(buildSearchEntry),
    ["wiki-search-index", wikiCacheScope(), tenantSlug],
    {
      revalidate: WIKI_REVALIDATE_SECONDS,
      tags: [wikiTenantTag(tenantSlug), wikiTenantPagesTag(tenantSlug)],
    },
  )();
}

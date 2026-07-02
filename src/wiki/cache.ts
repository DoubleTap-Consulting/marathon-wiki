import { revalidateTag, unstable_cache } from "next/cache";

import {
  getWikiCategorySnapshot,
  getWikiHomeSnapshot,
  getWikiPageSnapshot,
  listPublishedWikiPagesByTenant,
} from "@/src/db/wiki";

export const WIKI_REVALIDATE_SECONDS = Number(
  process.env.WIKI_REVALIDATE_SECONDS ?? 300,
);

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
    ["wiki-home", tenantSlug],
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
    ["wiki-pages", tenantSlug],
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
    ["wiki-category", tenantSlug, categorySlug],
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
    ["wiki-page", tenantSlug, pageSlug],
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


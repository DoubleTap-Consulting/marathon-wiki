import type { MetadataRoute } from "next";

import { listWikiSitemapEntries, MARATHON_TENANT_SLUG } from "@/src/db/wiki";
import { getWikiSiteBaseUrl } from "@/src/wiki/launch-config";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getWikiSiteBaseUrl();

  try {
    const entries = await listWikiSitemapEntries();

    if (entries.length > 0) {
      return entries.map((entry) => ({
        url: new URL(getSitemapPath(entry), baseUrl).toString(),
        lastModified: entry.updatedAt ?? new Date(),
        changeFrequency: entry.routeType === "page" ? "weekly" : "daily",
        priority: getSitemapPriority(entry.routeType),
      }));
    }
  } catch (error) {
    console.warn("wiki_sitemap_generation_failed", error);
  }

  return [
    {
      url: new URL(`/${MARATHON_TENANT_SLUG}`, baseUrl).toString(),
      changeFrequency: "daily",
      priority: 0.9,
    },
  ];
}

function getSitemapPath(entry: Awaited<ReturnType<typeof listWikiSitemapEntries>>[number]) {
  if (entry.routeType === "pages") {
    return `/${entry.tenantSlug}/pages`;
  }

  if (entry.routeType === "category") {
    return `/${entry.tenantSlug}/categories/${entry.categorySlug}`;
  }

  if (entry.routeType === "page") {
    return `/${entry.tenantSlug}/${entry.pageSlug}`;
  }

  return `/${entry.tenantSlug}`;
}

function getSitemapPriority(routeType: string) {
  if (routeType === "tenant") {
    return 0.9;
  }

  if (routeType === "page") {
    return 0.8;
  }

  return 0.6;
}

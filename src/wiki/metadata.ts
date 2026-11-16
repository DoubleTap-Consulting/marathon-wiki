import type { Metadata } from "next";

import { themeFor } from "@/themes/registry";

import { getWikiSiteBaseUrl } from "./launch-config";
import { networkBrand, type NetworkBrand } from "./network";

type WikiMetadataInput = {
  title: string;
  description?: string | null;
  path: string;
  siteName?: string;
};

/**
 * "<title> | <site name>", or the site name alone on the site's home page. Returned as an absolute
 * title so the root layout's "%s | Marathon Wiki" template cannot append a second site name.
 * Under a network brand it is "<title> · <network>", and the home page names the game in words
 * ("An unofficial guide to Marathon · <network>").
 */
export function composeWikiTitle(title: string, siteName: string, descriptor?: string, brand: NetworkBrand | null = networkBrand()) {
  const trimmed = title.trim();
  if (brand) {
    const page = trimmed.endsWith(` | ${siteName}`) ? trimmed.slice(0, -` | ${siteName}`.length) : trimmed;
    if (page.endsWith(` · ${brand.name}`)) return page;
    return `${page === siteName ? (descriptor ?? siteName) : page} · ${brand.name}`;
  }
  if (trimmed === siteName || trimmed.endsWith(` | ${siteName}`)) {
    return trimmed;
  }
  return `${trimmed} | ${siteName}`;
}

export function buildWikiMetadata({
  title,
  description,
  path,
  siteName = "Marathon Wiki",
}: WikiMetadataInput): Metadata {
  const canonicalUrl = new URL(path, getWikiSiteBaseUrl());
  const normalizedDescription =
    description?.trim() ||
    "Fast, source-backed Marathon wiki pages built for clean reading and community suggestions.";

  const brand = networkBrand();
  const fullTitle = composeWikiTitle(title, siteName, themeFor(path.split("/")[1] ?? "").identity.descriptor, brand);

  return {
    title: { absolute: fullTitle },
    description: normalizedDescription,
    alternates: {
      canonical: canonicalUrl.toString(),
    },
    openGraph: {
      type: "article",
      siteName: brand?.name ?? siteName,
      title: fullTitle,
      description: normalizedDescription,
      url: canonicalUrl.toString(),
    },
    twitter: {
      card: "summary",
      title: fullTitle,
      description: normalizedDescription,
    },
  };
}

import type { Metadata } from "next";

import { getWikiSiteBaseUrl } from "./launch-config";

type WikiMetadataInput = {
  title: string;
  description?: string | null;
  path: string;
  siteName?: string;
};

/**
 * "<title> | <site name>", or the site name alone on the site's home page. Returned as an absolute
 * title so the root layout's "%s | Marathon Wiki" template cannot append a second site name.
 */
export function composeWikiTitle(title: string, siteName: string) {
  const trimmed = title.trim();
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

  const fullTitle = composeWikiTitle(title, siteName);

  return {
    title: { absolute: fullTitle },
    description: normalizedDescription,
    alternates: {
      canonical: canonicalUrl.toString(),
    },
    openGraph: {
      type: "article",
      siteName,
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

import type { Metadata } from "next";

import { getWikiSiteBaseUrl } from "./launch-config";

type WikiMetadataInput = {
  title: string;
  description?: string | null;
  path: string;
  siteName?: string;
};

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

  return {
    title,
    description: normalizedDescription,
    alternates: {
      canonical: canonicalUrl.toString(),
    },
    openGraph: {
      type: "article",
      siteName,
      title,
      description: normalizedDescription,
      url: canonicalUrl.toString(),
    },
    twitter: {
      card: "summary",
      title,
      description: normalizedDescription,
    },
  };
}

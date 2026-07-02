import type { MetadataRoute } from "next";

import {
  getWikiSiteBaseUrl,
  isWikiIndexingEnabled,
} from "@/src/wiki/launch-config";

export default function robots(): MetadataRoute.Robots {
  return buildWikiRobots();
}

export function buildWikiRobots(
  env: Record<string, string | undefined> = process.env,
): MetadataRoute.Robots {
  const baseUrl = getWikiSiteBaseUrl(env);

  if (!isWikiIndexingEnabled(env)) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
      sitemap: new URL("/sitemap.xml", baseUrl).toString(),
      host: baseUrl.origin,
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/*/review", "/*/suggest"],
    },
    sitemap: new URL("/sitemap.xml", baseUrl).toString(),
    host: baseUrl.origin,
  };
}

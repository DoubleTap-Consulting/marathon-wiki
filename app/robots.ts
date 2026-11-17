import type { MetadataRoute } from "next";

import {
  getWikiSiteBaseUrl,
  isWikiIndexingEnabled,
} from "@/src/wiki/launch-config";
import { isTenantPubliclyEnabled } from "@/src/wiki/tenant-routing";

export const dynamic = "force-dynamic";

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

  const disallow = ["/api/", "/*/review", "/*/suggest", "/*/sign-in", "/*/sign-out"];
  if (!isTenantPubliclyEnabled("gta6", env)) disallow.push("/gta6", "/gta6/");

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow,
    },
    sitemap: new URL("/sitemap.xml", baseUrl).toString(),
    host: baseUrl.origin,
  };
}

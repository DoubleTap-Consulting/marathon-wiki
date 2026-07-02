import { describe, expect, it } from "vitest";

import { buildWikiRobots } from "./robots";

describe("wiki robots policy", () => {
  it("allows public pages while blocking private surfaces in production", () => {
    expect(
      buildWikiRobots({
        NEXT_PUBLIC_SITE_URL: "https://wiki.example.com",
        VERCEL_ENV: "production",
      }),
    ).toEqual({
      rules: {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/*/review", "/*/suggest"],
      },
      sitemap: "https://wiki.example.com/sitemap.xml",
      host: "https://wiki.example.com",
    });
  });

  it("blocks indexing for preview deployments unless explicitly enabled", () => {
    expect(
      buildWikiRobots({
        VERCEL_URL: "marathon-wiki-preview.vercel.app",
        VERCEL_ENV: "preview",
      }).rules,
    ).toEqual({
      userAgent: "*",
      disallow: "/",
    });

    expect(
      buildWikiRobots({
        VERCEL_ENV: "preview",
        WIKI_ROBOTS_INDEXING_ENABLED: "true",
      }).rules,
    ).toMatchObject({
      allow: "/",
    });
  });
});

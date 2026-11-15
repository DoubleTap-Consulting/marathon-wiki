import { afterEach, describe, expect, it } from "vitest";

import { buildWikiMetadata } from "./metadata";

const originalEnv = {
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  WIKI_PUBLIC_BASE_URL: process.env.WIKI_PUBLIC_BASE_URL,
  VERCEL_ENV: process.env.VERCEL_ENV,
  VERCEL_URL: process.env.VERCEL_URL,
};

describe("wiki metadata", () => {
  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("builds canonical and share metadata from the configured public URL", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://wiki.example.com";

    const metadata = buildWikiMetadata({
      title: "Overrun AR | Marathon Wiki",
      description: "Automatic rifle details for Marathon.",
      path: "/marathon/overrun-ar",
      siteName: "Marathon Wiki",
    });

    expect(metadata).toMatchObject({
      title: { absolute: "Overrun AR | Marathon Wiki" },
      description: "Automatic rifle details for Marathon.",
      alternates: {
        canonical: "https://wiki.example.com/marathon/overrun-ar",
      },
      openGraph: {
        type: "article",
        siteName: "Marathon Wiki",
        title: "Overrun AR | Marathon Wiki",
        description: "Automatic rifle details for Marathon.",
        url: "https://wiki.example.com/marathon/overrun-ar",
      },
      twitter: {
        card: "summary",
        title: "Overrun AR | Marathon Wiki",
        description: "Automatic rifle details for Marathon.",
      },
    });
  });

  it("names the site once on its home page and on every other page", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://wiki.example.com";

    expect(buildWikiMetadata({ title: "Marathon Wiki", path: "/marathon", siteName: "Marathon Wiki" }).title).toEqual({ absolute: "Marathon Wiki" });
    expect(buildWikiMetadata({ title: "All pages", path: "/marathon/pages", siteName: "Marathon Wiki" }).title).toEqual({ absolute: "All pages | Marathon Wiki" });
    expect(buildWikiMetadata({ title: "Weapons", path: "/marathon/weapons", siteName: "Marathon Wiki" }).title).toEqual({ absolute: "Weapons | Marathon Wiki" });
  });

  it("uses launch-safe fallback descriptions for pages without summaries", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://wiki.example.com";

    expect(
      buildWikiMetadata({
        title: "Marathon Wiki",
        path: "/marathon",
      }).description,
    ).toContain("source-backed Marathon wiki");
  });

  it("does not use a preview deployment host as the canonical or share URL", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.WIKI_PUBLIC_BASE_URL;
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "some-preview.vercel.app";

    const home = buildWikiMetadata({
      title: "Marathon Wiki",
      path: "/marathon",
      siteName: "Marathon Wiki",
    });
    const article = buildWikiMetadata({
      title: "Ranked",
      path: "/marathon/ranked",
      siteName: "Marathon Wiki",
    });

    expect(home.alternates?.canonical).toBe(
      "https://marathon-wiki.vercel.app/marathon",
    );
    expect(home.openGraph?.url).toBe("https://marathon-wiki.vercel.app/marathon");
    expect(article.alternates?.canonical).toBe(
      "https://marathon-wiki.vercel.app/marathon/ranked",
    );
    expect(article.openGraph?.url).toBe(
      "https://marathon-wiki.vercel.app/marathon/ranked",
    );
  });
});

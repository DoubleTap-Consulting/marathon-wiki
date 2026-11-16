import { afterEach, describe, expect, it } from "vitest";

import { buildWikiMetadata } from "./metadata";
import { NETWORK_PLACEHOLDER } from "./network";

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
    process.env.VERCEL_ENV = "production";

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
    process.env.VERCEL_ENV = "production";

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

  it("keeps production naming unchanged while the network has no name", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://wiki.example.com";
    process.env.VERCEL_ENV = "production";

    const home = buildWikiMetadata({ title: "Marathon Wiki", path: "/marathon", siteName: "Marathon Wiki" });
    const article = buildWikiMetadata({ title: "Ranked", path: "/marathon/ranked", siteName: "Marathon Wiki" });

    expect(home.title).toEqual({ absolute: "Marathon Wiki" });
    expect(article.title).toEqual({ absolute: "Ranked | Marathon Wiki" });
    expect(article.openGraph).toMatchObject({ siteName: "Marathon Wiki", title: "Ranked | Marathon Wiki" });
    expect(JSON.stringify([home, article])).not.toContain(NETWORK_PLACEHOLDER);
  });

  it("titles previews '<Page> · <Network>', naming the game in words on the home page", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://wiki.example.com";
    process.env.VERCEL_ENV = "preview";

    const home = buildWikiMetadata({ title: "Marathon Wiki", path: "/marathon", siteName: "Marathon Wiki" });
    const article = buildWikiMetadata({ title: "Overrun AR | Marathon Wiki", path: "/marathon/overrun-ar", siteName: "Marathon Wiki" });

    expect(home.title).toEqual({ absolute: `An unofficial guide to Marathon · ${NETWORK_PLACEHOLDER}` });
    expect(article.title).toEqual({ absolute: `Overrun AR · ${NETWORK_PLACEHOLDER}` });
    expect(article.openGraph).toMatchObject({ siteName: NETWORK_PLACEHOLDER });
  });
});

import { afterEach, describe, expect, it } from "vitest";

import { buildWikiMetadata } from "./metadata";

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

describe("wiki metadata", () => {
  afterEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
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
      title: "Overrun AR | Marathon Wiki",
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

  it("uses launch-safe fallback descriptions for pages without summaries", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://wiki.example.com";

    expect(
      buildWikiMetadata({
        title: "Marathon Wiki",
        path: "/marathon",
      }).description,
    ).toContain("source-backed Marathon wiki");
  });
});

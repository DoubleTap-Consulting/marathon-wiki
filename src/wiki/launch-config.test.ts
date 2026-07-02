import { describe, expect, it } from "vitest";

import {
  getWikiAdsConfig,
  getWikiPremiumConfig,
  getWikiSiteBaseUrl,
  isWikiIndexingEnabled,
  readBoolean,
} from "./launch-config";

describe("launch config", () => {
  it("normalizes booleans without treating invalid values as enabled", () => {
    expect(readBoolean("true")).toBe(true);
    expect(readBoolean("1")).toBe(true);
    expect(readBoolean("false", true)).toBe(false);
    expect(readBoolean("surprise")).toBe(false);
  });

  it("builds a public site URL from deployment env without leaking secrets", () => {
    expect(
      getWikiSiteBaseUrl({
        VERCEL_URL: "marathon-wiki.vercel.app",
      }).toString(),
    ).toBe("https://marathon-wiki.vercel.app/");

    expect(
      getWikiSiteBaseUrl({
        NEXT_PUBLIC_SITE_URL: "https://wiki.example.com/marathon/",
      }).toString(),
    ).toBe("https://wiki.example.com/marathon");
  });

  it("keeps ads disabled unless the feature flag, client id, and slot exist", () => {
    expect(getWikiAdsConfig({})).toBeNull();
    expect(
      getWikiAdsConfig({
        WIKI_ADS_ENABLED: "true",
        WIKI_ADSENSE_CLIENT_ID: "ca-pub-123",
      }),
    ).toBeNull();

    expect(
      getWikiAdsConfig({
        WIKI_ADS_ENABLED: "true",
        WIKI_ADSENSE_CLIENT_ID: "ca-pub-123",
        WIKI_AD_SLOT_SIDEBAR: "111",
      }),
    ).toEqual({
      enabled: true,
      provider: "adsense",
      clientId: "ca-pub-123",
      slots: [
        {
          placement: "sidebar",
          slotId: "111",
          minHeight: 280,
        },
      ],
    });
  });

  it("keeps premium hooks disabled unless a valid URL is configured", () => {
    expect(
      getWikiPremiumConfig({
        WIKI_PREMIUM_ENABLED: "true",
      }),
    ).toBeNull();

    expect(
      getWikiPremiumConfig({
        WIKI_PREMIUM_ENABLED: "true",
        WIKI_PREMIUM_URL: "https://example.com/support",
        WIKI_PREMIUM_LABEL: "Go premium",
      }),
    ).toMatchObject({
      enabled: true,
      url: "https://example.com/support",
      label: "Go premium",
    });
  });

  it("keeps Vercel previews out of search indexes by default", () => {
    expect(isWikiIndexingEnabled({ VERCEL_ENV: "production" })).toBe(true);
    expect(isWikiIndexingEnabled({ VERCEL_ENV: "preview" })).toBe(false);
    expect(
      isWikiIndexingEnabled({
        VERCEL_ENV: "preview",
        WIKI_ROBOTS_INDEXING_ENABLED: "true",
      }),
    ).toBe(true);
  });
});

import { afterEach, describe, expect, it } from "vitest";

import {
  getTenantSlugFromHost,
  isPublicFilePath,
  normalizeTenantSlug,
  normalizeWikiSlug,
} from "./tenant-routing";

const originalWikiRootDomain = process.env.WIKI_ROOT_DOMAIN;

afterEach(() => {
  if (originalWikiRootDomain === undefined) {
    delete process.env.WIKI_ROOT_DOMAIN;
  } else {
    process.env.WIKI_ROOT_DOMAIN = originalWikiRootDomain;
  }
});

describe("tenant routing helpers", () => {
  it("normalizes tenant and wiki slugs for user-entered values", () => {
    expect(normalizeTenantSlug(" Marathon ")).toBe("marathon");
    expect(normalizeWikiSlug(" Overrun AR ")).toBe("overrun-ar");
    expect(normalizeWikiSlug("MIDA + MA-75/B")).toBe("mida-ma-75-b");
  });

  it("extracts tenant slugs from configured wiki subdomains", () => {
    process.env.WIKI_ROOT_DOMAIN = "example.com";

    expect(getTenantSlugFromHost("marathon.example.com")).toBe("marathon");
    expect(getTenantSlugFromHost("example.com")).toBeNull();
    expect(getTenantSlugFromHost("127.0.0.1:3102")).toBeNull();
  });

  it("keeps framework and asset paths out of tenant routing", () => {
    expect(isPublicFilePath("/api/health")).toBe(true);
    expect(isPublicFilePath("/__clerk/some-proxy-path")).toBe(true);
    expect(isPublicFilePath("/trpc/wiki.bySlug")).toBe(true);
    expect(isPublicFilePath("/_next/static/chunk.js")).toBe(true);
    expect(isPublicFilePath("/favicon.ico")).toBe(true);
    expect(isPublicFilePath("/marathon/weapons")).toBe(false);
  });
});

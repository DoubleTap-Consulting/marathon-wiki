import { afterEach, describe, expect, it } from "vitest";

import {
  GTA6_TENANT_SLUG,
  getTenantSlugFromHost,
  isPublicFilePath,
  isGta6Path,
  isTenantPubliclyEnabled,
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

  it("keeps framework, asset, and network legal paths out of tenant routing", () => {
    expect(isPublicFilePath("/api/health")).toBe(true);
    expect(isPublicFilePath("/__clerk/some-proxy-path")).toBe(true);
    expect(isPublicFilePath("/trpc/wiki.bySlug")).toBe(true);
    expect(isPublicFilePath("/_next/static/chunk.js")).toBe(true);
    expect(isPublicFilePath("/favicon.ico")).toBe(true);
    expect(isPublicFilePath("/privacy")).toBe(true);
    expect(isPublicFilePath("/terms")).toBe(true);
    expect(isPublicFilePath("/marathon/weapons")).toBe(false);
    expect(isPublicFilePath("/privacy-policy")).toBe(false);
  });
});


describe("GTA 6 production flag", () => {
  it("hides /gta6 only in Vercel production, unless GTA6_ENABLED=1", () => {
    expect(isTenantPubliclyEnabled("gta6", {})).toBe(true);
    expect(isTenantPubliclyEnabled("gta6", { VERCEL_ENV: "preview" })).toBe(true);
    expect(isTenantPubliclyEnabled("gta6", { VERCEL_ENV: "development" })).toBe(true);
    expect(isTenantPubliclyEnabled("gta6", { VERCEL_ENV: "production" })).toBe(false);
    expect(isTenantPubliclyEnabled("gta6", { VERCEL_ENV: "production", GTA6_ENABLED: "0" })).toBe(false);
    expect(isTenantPubliclyEnabled("gta6", { VERCEL_ENV: "production", GTA6_ENABLED: "1" })).toBe(true);
    expect(isTenantPubliclyEnabled("GTA6", { VERCEL_ENV: "production" })).toBe(false);
    expect(isTenantPubliclyEnabled("marathon", { VERCEL_ENV: "production" })).toBe(true);
    expect(GTA6_TENANT_SLUG).toBe("gta6");
  });

  it("matches /gta6 and its subroutes only", () => {
    expect(isGta6Path("/gta6")).toBe(true);
    expect(isGta6Path("/gta6/")).toBe(true);
    expect(isGta6Path("/gta6/lucia-caminos")).toBe(true);
    expect(isGta6Path("/gta6/search-index.json")).toBe(true);
    expect(isGta6Path("/gta60")).toBe(false);
    expect(isGta6Path("/gta6-extra")).toBe(false);
    expect(isGta6Path("/marathon")).toBe(false);
    expect(isGta6Path("/")).toBe(false);
  });
});

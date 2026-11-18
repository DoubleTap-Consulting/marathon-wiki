import { NextRequest, type NextFetchEvent } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CANONICAL_SITE_ORIGIN,
  LEGACY_PRODUCTION_ALIAS_HOST,
  proxy,
  redirectLegacyProductionAlias,
} from "../../proxy";

afterEach(() => {
  vi.unstubAllEnvs();
});

function request(path: string, host: string) {
  return new NextRequest(new URL(path, `https://${host.split(":")[0]}`), {
    headers: { host },
  });
}

function unusedEvent() {
  return {} as NextFetchEvent;
}

describe("redirectLegacyProductionAlias", () => {
  it("returns a 308 to wikiden.gg that keeps the path", () => {
    for (const path of ["/", "/marathon/ranked", "/gta6"]) {
      const response = redirectLegacyProductionAlias(request(path, LEGACY_PRODUCTION_ALIAS_HOST));
      expect(response).not.toBeNull();
      expect(response!.status).toBe(308);
      expect(response!.headers.get("location")).toBe(`${CANONICAL_SITE_ORIGIN}${path}`);
    }
  });

  it("keeps the query string and ignores a port on the Host header", () => {
    const response = redirectLegacyProductionAlias(
      request("/gta6/release-date?ref=alias", `${LEGACY_PRODUCTION_ALIAS_HOST}:443`),
    );
    expect(response?.status).toBe(308);
    expect(response?.headers.get("location")).toBe(
      "https://wikiden.gg/gta6/release-date?ref=alias",
    );
  });

  it("does not redirect the canonical host, preview aliases, or localhost", () => {
    const otherHosts = [
      "wikiden.gg",
      "marathon-wiki-git-main-michael-flores-projects-acc295a3.vercel.app",
      "marathon-wiki-abc123-michael-flores-projects-acc295a3.vercel.app",
      "marathon-wiki-michael-flores-projects-acc295a3.vercel.app",
      "localhost",
      "127.0.0.1",
    ];
    for (const host of otherHosts) {
      expect(redirectLegacyProductionAlias(request("/marathon/ranked", host))).toBeNull();
    }
  });

  it("does not redirect /api/cron/wiki-update on the production alias", () => {
    expect(redirectLegacyProductionAlias(request("/api/cron/wiki-update", LEGACY_PRODUCTION_ALIAS_HOST))).toBeNull();
    expect(redirectLegacyProductionAlias(request("/api/cron/source-refetch", LEGACY_PRODUCTION_ALIAS_HOST))).toBeNull();
  });
});

function asResponse(result: Awaited<ReturnType<typeof proxy>>): Response {
  if (!(result instanceof Response)) {
    throw new Error("expected proxy() to return a Response");
  }
  return result;
}

describe("proxy applies the alias redirect before Clerk", () => {
  it("redirects the production alias even when Clerk keys are present", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test");
    const response = asResponse(await proxy(request("/marathon/ranked", LEGACY_PRODUCTION_ALIAS_HOST), unusedEvent()));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://wikiden.gg/marathon/ranked");
  });

  it("leaves preview deployments and wikiden.gg alone", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    const preview = asResponse(
      await proxy(
        request("/gta6", "marathon-wiki-git-forge-alias-michael-flores-projects-acc295a3.vercel.app"),
        unusedEvent(),
      ),
    );
    expect(preview.status).not.toBe(308);
    expect(preview.headers.get("location")).toBeNull();

    const canonical = asResponse(await proxy(request("/gta6", "wikiden.gg"), unusedEvent()));
    expect(canonical.status).not.toBe(308);
    expect(canonical.headers.get("location")).toBeNull();
  });
});

import { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  HIDDEN_TENANT_HTML,
  HIDDEN_TENANT_ROBOTS_TAG,
  hiddenTenantResponse,
  isJsonPath,
} from "./hidden-tenant-response";
import { applyTenantRouting } from "../../proxy";

afterEach(() => {
  vi.unstubAllEnvs();
});

function request(path: string, host = "wikiden.gg") {
  return new NextRequest(new URL(path, `https://${host}`), {
    headers: { host },
  });
}

async function readBody(response: Response) {
  return response.text();
}

describe("hidden tenant response", () => {
  it("is a self-contained page: inline styles only, a WikiDen wordmark and a link to the Marathon guide", async () => {
    const body = await readBody(hiddenTenantResponse("/gta6/anything"));
    expect(body).toBe(HIDDEN_TENANT_HTML);
    expect(body).toMatch(/<a href="\/marathon">Browse the Marathon guide<\/a>/);
    expect(body).toMatch(/>WikiDen</);
    expect(body).toMatch(/<style>[\s\S]+<\/style>/);
    // No external resources: no stylesheets, scripts, images, fonts, frames or url() fetches.
    expect(body).not.toMatch(/<link\b|<script\b|<img\b|<iframe\b|@import|url\(|src=/i);
    expect(body.match(/href="([^"]+)"/g)).toEqual(['href="/marathon"']);
  });

  it("returns a direct HTML 404 with a noindex robots tag, not a rewrite", async () => {
    const response = hiddenTenantResponse("/gta6");

    expect(response.status).toBe(404);
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get("X-Robots-Tag")).toBe(HIDDEN_TENANT_ROBOTS_TAG);
    expect(response.headers.get("content-type")).toMatch(/text\/html/);

    const body = await readBody(response);
    expect(body).toMatch(/<title[^>]*>Page not found<\/title>/i);
    expect(body).toMatch(/<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*noindex/i);
  });

  it("returns a JSON 404 with a noindex robots tag for .json paths", async () => {
    const response = hiddenTenantResponse("/gta6/search-index.json");

    expect(response.status).toBe(404);
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get("X-Robots-Tag")).toBe(HIDDEN_TENANT_ROBOTS_TAG);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    expect(JSON.parse(await readBody(response))).toEqual({ error: "Not Found" });
  });

  it("treats only .json paths as JSON", () => {
    expect(isJsonPath("/gta6/search-index.json")).toBe(true);
    expect(isJsonPath("/gta6/search-index.json?cb=1")).toBe(true);
    expect(isJsonPath("/gta6/pages")).toBe(false);
    expect(isJsonPath("/gta6")).toBe(false);
  });
});

describe("rewrite to /_not-found is not a reliable 404", () => {
  it("defaults to HTTP 200 and sets a rewrite header, which Vercel may serve as a prerendered 200", () => {
    const rewritten = NextResponse.rewrite(new URL("/_not-found", "https://wikiden.gg/gta6"));

    expect(rewritten.status).toBe(200);
    expect(rewritten.headers.get("x-middleware-rewrite")).toBeTruthy();
    expect(rewritten.headers.get("X-Robots-Tag")).toBeNull();
  });

  it("still defaults to a rewrite even when status 404 is passed, so the destination page can replace it", () => {
    const rewritten = NextResponse.rewrite(new URL("/_not-found", "https://wikiden.gg/gta6"), {
      status: 404,
    });

    expect(rewritten.headers.get("x-middleware-rewrite")).toBeTruthy();
  });
});

describe("applyTenantRouting hides GTA 6 with a direct 404 in production", () => {
  it("returns the hidden-tenant 404 for /gta6 paths when the flag is off", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("GTA6_ENABLED", "");

    for (const path of ["/gta6", "/gta6/lucia-caminos", "/gta6/pages"]) {
      const response = applyTenantRouting(request(path));
      expect(response.status, path).toBe(404);
      expect(response.headers.get("x-middleware-rewrite"), path).toBeNull();
      expect(response.headers.get("X-Robots-Tag"), path).toBe(HIDDEN_TENANT_ROBOTS_TAG);
      expect(response.headers.get("content-type"), path).toMatch(/text\/html/);
      expect(await readBody(response), path).toMatch(/page not found/i);
    }

    const json = applyTenantRouting(request("/gta6/search-index.json"));
    expect(json.status).toBe(404);
    expect(json.headers.get("x-middleware-rewrite")).toBeNull();
    expect(json.headers.get("X-Robots-Tag")).toBe(HIDDEN_TENANT_ROBOTS_TAG);
    expect(json.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("does not hide /gta6 on preview, or in production when GTA6_ENABLED=1, and never hides /marathon", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(applyTenantRouting(request("/gta6")).status).toBe(200);
    expect(applyTenantRouting(request("/gta6")).headers.get("x-middleware-rewrite")).toBeNull();

    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("GTA6_ENABLED", "1");
    expect(applyTenantRouting(request("/gta6")).status).toBe(200);

    vi.stubEnv("GTA6_ENABLED", "");
    const marathon = applyTenantRouting(request("/marathon"));
    expect(marathon.status).toBe(200);
    expect(marathon.headers.get("x-middleware-rewrite")).toBeNull();
  });
});

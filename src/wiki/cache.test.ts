import { describe, expect, it, vi } from "vitest";

const revalidateTag = vi.fn();
const unstableCache = vi.fn(
  (
    _callback: () => unknown,
    keys: string[],
    options: { revalidate: number; tags: string[] },
  ) => {
    return async () => ({ keys, options });
  },
);

vi.mock("next/cache", () => ({
  revalidateTag,
  unstable_cache: unstableCache,
}));

describe("wiki cache tags", () => {
  it("builds stable tenant, page, and category tags", async () => {
    const cache = await import("./cache");

    expect(cache.wikiTenantTag("marathon")).toBe("wiki:tenant:marathon");
    expect(cache.wikiTenantHomeTag("marathon")).toBe("wiki:tenant:marathon:home");
    expect(cache.wikiTenantPagesTag("marathon")).toBe("wiki:tenant:marathon:pages");
    expect(cache.wikiPageTag("marathon", "weapons")).toBe(
      "wiki:tenant:marathon:page:weapons",
    );
    expect(cache.wikiCategoryTag("marathon", "lore")).toBe(
      "wiki:tenant:marathon:category:lore",
    );
  });

  it("revalidates tenant and page tags on page edits", async () => {
    const cache = await import("./cache");

    revalidateTag.mockClear();
    await cache.revalidateWikiPage("marathon", "weapons");

    expect(revalidateTag).toHaveBeenCalledWith("wiki:tenant:marathon", "max");
    expect(revalidateTag).toHaveBeenCalledWith("wiki:tenant:marathon:pages", "max");
    expect(revalidateTag).toHaveBeenCalledWith(
      "wiki:tenant:marathon:page:weapons",
      "max",
    );
  });

  it("scopes cache keys to the deployment, so previews never read each other's pages", async () => {
    const cache = await import("./cache");

    expect(cache.wikiCacheScope({ VERCEL_DEPLOYMENT_ID: "dpl_a" })).toBe("dpl_a");
    expect(cache.wikiCacheScope({})).toBe("local");
  });

  it("in production, adds only the deployment id to each key and keeps revalidate and tags as on main", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_DEPLOYMENT_ID", "dpl_prod123");
    try {
      const cache = await import("./cache");
      unstableCache.mockClear();
      await cache.getCachedWikiHome("marathon");
      await cache.getCachedWikiPages("marathon", "tenant_123");
      await cache.getCachedWikiCategory("marathon", "weapons");
      await cache.getCachedWikiPage("marathon", "weapons");
      await cache.getCachedWikiPageRevisions("marathon", "weapons", "tenant_123", "page_1");
      const calls = unstableCache.mock.calls.map(([, keys, options]) => ({ keys, options }));
      // main's keys, options and tags (origin/main src/wiki/cache.ts), with the deployment id as the second key part.
      expect(calls).toEqual([
        { keys: ["wiki-home", "dpl_prod123", "marathon"], options: { revalidate: 300, tags: ["wiki:tenant:marathon", "wiki:tenant:marathon:home", "wiki:tenant:marathon:pages"] } },
        { keys: ["wiki-pages", "dpl_prod123", "marathon"], options: { revalidate: 300, tags: ["wiki:tenant:marathon", "wiki:tenant:marathon:pages"] } },
        { keys: ["wiki-category", "dpl_prod123", "marathon", "weapons"], options: { revalidate: 300, tags: ["wiki:tenant:marathon", "wiki:tenant:marathon:pages", "wiki:tenant:marathon:category:weapons"] } },
        { keys: ["wiki-page", "dpl_prod123", "marathon", "weapons"], options: { revalidate: 300, tags: ["wiki:tenant:marathon", "wiki:tenant:marathon:pages", "wiki:tenant:marathon:page:weapons"] } },
        { keys: ["wiki-page-revisions", "dpl_prod123", "marathon", "weapons"], options: { revalidate: 300, tags: ["wiki:tenant:marathon", "wiki:tenant:marathon:page:weapons"] } },
      ]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("passes ISR windows and tags to cached public readers", async () => {
    const cache = await import("./cache");

    unstableCache.mockClear();
    await cache.getCachedWikiHome("marathon");
    await cache.getCachedWikiPages("marathon", "tenant_123");
    await cache.getCachedWikiCategory("marathon", "weapons");
    await cache.getCachedWikiPage("marathon", "weapons");

    expect(unstableCache).toHaveBeenNthCalledWith(
      1,
      expect.any(Function),
      ["wiki-home", "local", "marathon"],
      {
        revalidate: 300,
        tags: [
          "wiki:tenant:marathon",
          "wiki:tenant:marathon:home",
          "wiki:tenant:marathon:pages",
        ],
      },
    );
    expect(unstableCache).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      ["wiki-pages", "local", "marathon"],
      {
        revalidate: 300,
        tags: ["wiki:tenant:marathon", "wiki:tenant:marathon:pages"],
      },
    );
    expect(unstableCache).toHaveBeenNthCalledWith(
      3,
      expect.any(Function),
      ["wiki-category", "local", "marathon", "weapons"],
      {
        revalidate: 300,
        tags: [
          "wiki:tenant:marathon",
          "wiki:tenant:marathon:pages",
          "wiki:tenant:marathon:category:weapons",
        ],
      },
    );
    expect(unstableCache).toHaveBeenNthCalledWith(
      4,
      expect.any(Function),
      ["wiki-page", "local", "marathon", "weapons"],
      {
        revalidate: 300,
        tags: [
          "wiki:tenant:marathon",
          "wiki:tenant:marathon:pages",
          "wiki:tenant:marathon:page:weapons",
        ],
      },
    );
  });
});

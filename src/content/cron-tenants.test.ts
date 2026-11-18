import { describe, expect, it } from "vitest";

import {
  contentPackForTenant,
  cronContentPacksFor,
  cronContentPlan,
  cronTenantRank,
  sortCronTenants,
} from "@/src/content/cron-tenants";

describe("cron tenant order and content packs", () => {
  it("puts Marathon first, then GTA 6, then any other enabled tenant", () => {
    expect(cronTenantRank("marathon")).toBe(0);
    expect(cronTenantRank("gta6")).toBe(1);
    expect(cronTenantRank("other")).toBeGreaterThan(1);
    expect(sortCronTenants([{ slug: "gta6" }, { slug: "zeta" }, { slug: "marathon" }]).map((row) => row.slug)).toEqual([
      "marathon",
      "gta6",
      "zeta",
    ]);
  });

  it("uses the same GTA6_ENABLED gate as the public site, and always includes Marathon", () => {
    const tenants = [
      { id: "m", slug: "marathon" },
      { id: "g", slug: "gta6" },
    ];
    const preview = cronContentPacksFor(tenants, { VERCEL_ENV: "preview" });
    expect(preview.map((row) => row.slug)).toEqual(["marathon", "gta6"]);
    const prodOff = cronContentPacksFor(tenants, { VERCEL_ENV: "production" });
    expect(prodOff.map((row) => row.slug)).toEqual(["marathon"]);
    const prodOn = cronContentPacksFor(tenants, { VERCEL_ENV: "production", GTA6_ENABLED: "1" });
    expect(prodOn.map((row) => row.slug)).toEqual(["marathon", "gta6"]);
  });

  it("exposes GTA 6 sources and page specs so the refetch can check them", () => {
    const pack = contentPackForTenant("gta6");
    expect(pack).not.toBeNull();
    expect(pack!.sources.length).toBeGreaterThan(0);
    expect(pack!.specs.length).toBeGreaterThan(0);
    expect(pack!.sources.some((source) => source.sourceKey === "gta6-official-site")).toBe(true);
    const plan = cronContentPlan(
      [
        { id: "m", slug: "marathon" },
        { id: "g", slug: "gta6" },
      ],
      { VERCEL_ENV: "preview" },
    );
    expect(plan).toEqual([
      expect.objectContaining({ slug: "marathon", bungieNewsFeed: true }),
      expect.objectContaining({ slug: "gta6", bungieNewsFeed: false, sourceCount: pack!.sources.length }),
    ]);
    expect(plan[0].sourceCount).toBeGreaterThan(0);
  });
});

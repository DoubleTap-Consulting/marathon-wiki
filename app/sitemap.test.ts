import { describe, expect, it } from "vitest";

import { legalSitemapEntries } from "./sitemap";

describe("legal sitemap entries", () => {
  it("lists the network privacy and terms URLs", () => {
    expect(legalSitemapEntries(new URL("https://wikiden.gg"))).toEqual([
      { url: "https://wikiden.gg/privacy", changeFrequency: "yearly", priority: 0.3 },
      { url: "https://wikiden.gg/terms", changeFrequency: "yearly", priority: 0.3 },
    ]);
  });
});

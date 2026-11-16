import { describe, expect, it } from "vitest";

import { planArticle } from "@/app/[tenantSlug]/_components/markdown";

import { buildSearchEntry } from "./search-index";
import { fold, hitHref, searchPages, type SearchEntry } from "./search";

const entries: SearchEntry[] = [
  buildSearchEntry({
    slug: "contracts",
    title: "Contracts",
    summary: "Faction contracts, their rewards and the Cryo Archive weekly set.",
    bodyMarkdown: "## Faction contracts\n\nText.\n\n## Cryo Archive contracts {{cite:bungie-1}}\n\nText.\n\n### Rewards\n",
    category: "Systems",
    tags: [],
  }),
  buildSearchEntry({
    slug: "cryo-archive",
    title: "Cryo Archive",
    summary: "The endgame zone on Tau Ceti IV.",
    bodyMarkdown: "## Access\n\n## Vault\n",
    category: "Locations",
    tags: ["Vault Key"],
  }),
  buildSearchEntry({ slug: "runners", title: "Runners", summary: "Playable shells.", bodyMarkdown: "", category: "Runners", tags: [] }),
  buildSearchEntry({ slug: "perimeter", title: "Perimeter", summary: "Zone near the archive.", bodyMarkdown: "", category: "Locations", tags: ["Écran"] }),
];

describe("searchPages", () => {
  it("puts Cryo Archive first for 'cryo', from the first character", () => {
    expect(searchPages(entries, "c")[0].slug).toBe("contracts");
    const hits = searchPages(entries, "cryo");
    expect(hits.map((hit) => hit.slug)).toEqual(["cryo-archive", "contracts"]);
    expect(hits[0]).toMatchObject({ heading: null, range: [0, 4] });
  });

  it("allows one typo from four characters", () => {
    expect(searchPages(entries, "crio")[0].slug).toBe("cryo-archive");
    expect(searchPages(entries, "cyro")[0].slug).toBe("cryo-archive");
    expect(searchPages(entries, "cri")).toEqual([]);
  });

  it("links heading hits to the article's anchor", () => {
    const [hit] = searchPages(entries, "rewards");
    expect(hit.heading).toEqual({ id: "rewards", text: "Rewards" });
    expect(hitHref("marathon", hit)).toBe("/marathon/contracts#rewards");
    expect(searchPages(entries, "faction")[0].heading?.id).toBe("faction-contracts");
    const markdown = "## Cryo Archive contracts {{cite:bungie-1}}\n\n## [[Runners|Runner]] kits[^1]\n\n## Rewards\n\n## Rewards";
    const ctx = { tenantSlug: "marathon", knownSlugs: new Set(["runners"]), sources: [{ id: "s1", sourceKey: "bungie-1", sourceType: "official", title: "Bungie", url: null, publisher: null, authorityTier: null, retrievedAt: null }], claims: [], notes: [] };
    const rendered = planArticle(markdown, ctx).toc.map((entry) => entry.id);
    expect(buildSearchEntry({ slug: "x", title: "X", summary: null, bodyMarkdown: markdown, category: null, tags: [] }).headings.map((heading) => heading.id)).toEqual(rendered);
  });

  it("ranks title prefix, then title word or alias, then heading, then summary or category", () => {
    expect(searchPages(entries, "archive").map((hit) => hit.slug)).toEqual(["cryo-archive", "contracts", "perimeter"]);
    expect(searchPages(entries, "vault")[0].slug).toBe("cryo-archive");
  });

  it("ignores case and diacritics", () => {
    expect(fold("Écran")).toBe("ecran");
    expect(searchPages(entries, "ECRAN")[0].slug).toBe("perimeter");
    expect(searchPages(entries, "CRYO ARCHIVE")[0].slug).toBe("cryo-archive");
  });

  it("caps the list", () => {
    expect(searchPages(entries, "e", 2)).toHaveLength(2);
  });
});

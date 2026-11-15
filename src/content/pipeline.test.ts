import { describe, expect, it } from "vitest";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

import { remarkArticle, type ArticleContext, type ArticlePlan } from "@/src/wiki/article";

import { liftInlineCitations,
  assembleMarkdown,
  buildProvenance,
  chunkSnapshot,
  draftSchema,
  parseWeaponTable,
  quoteOccursIn,
  resolveClaims,
  selectExtracts,
  validateDraft,
  validateSentence,
  type Draft,
  type Extract,
  type PageSpec,
  type SourceRecord,
} from "./pipeline";

const source = (sourceKey: string, authorityTier: SourceRecord["authorityTier"]): SourceRecord => ({
  sourceKey,
  sourceId: `src_${sourceKey}`,
  sourceType: authorityTier === "official" ? "official" : authorityTier,
  authorityTier,
  authorityScore: 50,
  title: `Title ${sourceKey}`,
  publisher: `Publisher ${sourceKey}`,
  url: `https://example.com/${sourceKey}`,
  publishedDate: null,
});

const SOURCES = new Map<string, SourceRecord>([
  ["bungie", source("bungie", "official")],
  ["press", source("press", "reputable_editorial")],
  ["wiki", source("wiki", "community_wiki")],
]);

const EXTRACTS: Extract[] = [
  { id: "bungie#1", sourceKey: "bungie", text: "The UESC Marathon ship left Mars for the Tau Ceti solar system in 2472. It arrived 300 years later." },
  { id: "bungie#2", sourceKey: "bungie", text: "No one knows what happened a century ago when the Marathon expedition went dark." },
  { id: "press#1", sourceKey: "press", text: "Marathon takes place in the year 2893, when runners fight for scraps on Tau Ceti IV." },
  { id: "wiki#1", sourceKey: "wiki", text: "The Assassin (also known by the codename Void) is a stealth shell." },
];
const BY_ID = new Map(EXTRACTS.map((extract) => [extract.id, extract]));
const KNOWN = new Set(BY_ID.keys());

function draft(partial: Partial<Draft> = {}): Draft {
  return draftSchema.parse({
    title: "UESC Marathon",
    summary: "The colony ship.",
    sections: [
      {
        heading: "Journey",
        paragraphs: [
          {
            sentences: [
              { text: "The UESC Marathon left Mars for Tau Ceti in 2472.", extractIds: ["bungie#1"], patchRef: null },
              { text: "The Assassin shell was once codenamed Void.", extractIds: ["wiki#1"], patchRef: null },
              { text: "The ship carried ten thousand robots.", extractIds: ["press#1"], patchRef: null },
            ],
          },
        ],
      },
    ],
    conflicts: [
      {
        heading: "Journey",
        sentence: "Sources disagree on when the expedition went dark.",
        positions: [
          { extractId: "bungie#2", quote: "what happened a century ago" },
          { extractId: "press#1", quote: "takes place in the year 2893" },
        ],
      },
    ],
    ...partial,
  });
}

describe("validateSentence", () => {
  it("rejects a claim with no source", () => {
    expect(validateSentence({ text: "Marathon has six factions.", extractIds: [], patchRef: null }, KNOWN)).toBe("no source cited");
  });

  it("rejects citations to extracts the model was never given", () => {
    expect(validateSentence({ text: "Marathon has six factions.", extractIds: ["made-up#9"], patchRef: null }, KNOWN)).toMatch(/not provided/);
  });

  it("rejects markup that would break sentence matching", () => {
    expect(validateSentence({ text: "See [[factions]] for more.", extractIds: ["bungie#1"], patchRef: null }, KNOWN)).toBe("markup inside sentence text");
  });

  it("accepts an abbreviated month in the update date", () => {
    expect(
      validateSentence({ extractIds: ["bungie#1"], patchRef: "1.1.9.2", text: "In Update 1.1.9.2 (Oct 6, 2026), schema wares began costing Credits." }, KNOWN),
    ).toBeNull();
  });

  it("moves citations a model copied into the sentence text to its extract ids", () => {
    expect(liftInlineCitations({ text: "Outpost has a Heat Cascade event (pcgamer-review#16).", extractIds: [], patchRef: null })).toEqual({
      text: "Outpost has a Heat Cascade event.",
      extractIds: ["pcgamer-review#16"],
      patchRef: null,
    });
    expect(liftInlineCitations({ text: 'Rook joins matches in progress. extractIds:["bungie#5","bungie#6"]', extractIds: ["bungie#5"], patchRef: null })).toEqual({
      text: "Rook joins matches in progress.",
      extractIds: ["bungie#5", "bungie#6"],
      patchRef: null,
    });
    expect(liftInlineCitations({ text: "See [[factions]] (bungie#1).", extractIds: [], patchRef: null }).text).toBe("See [[factions]].");
  });

  it("requires patch-sensitive sentences to name the update and its date", () => {
    const base = { extractIds: ["bungie#1"], patchRef: "1.1.9.7" };
    expect(validateSentence({ ...base, text: "The Synapse Cube is limited to one in total." }, KNOWN)).toMatch(/update and its date/);
    expect(
      validateSentence({ ...base, text: "As of Update 1.1.9.7 (November 10, 2026), the Synapse Cube is limited to one in total." }, KNOWN),
    ).toBeNull();
  });
});

describe("validateDraft", () => {
  it("drops invalid sentences and a single-source conflict, and records why", () => {
    const result = validateDraft(
      draft({
        conflicts: [{ heading: "Journey", sentence: "Dates differ.", positions: [{ extractId: "bungie#1", quote: "x" }, { extractId: "bungie#2", quote: "y" }] }],
        sections: [
          {
            heading: "Journey",
            paragraphs: [{ sentences: [{ text: "Unsourced statement here.", extractIds: [], patchRef: null }, { text: "The ship left Mars in 2472.", extractIds: ["bungie#1"], patchRef: null }] }],
          },
        ],
      }),
      KNOWN,
    );
    expect(result.sections[0].paragraphs[0]).toHaveLength(1);
    expect(result.conflicts).toHaveLength(0);
    expect(result.rejected.map((entry) => entry.reason)).toEqual(["no source cited", "a disagreement needs two different sources"]);
  });

  it("throws when nothing sourced remains", () => {
    expect(() =>
      validateDraft(draft({ conflicts: [], sections: [{ heading: "A", paragraphs: [{ sentences: [{ text: "Nothing to see here.", extractIds: [], patchRef: null }] }] }] }), KNOWN),
    ).toThrow(/no valid/);
  });
});

describe("quoteOccursIn", () => {
  it("matches verbatim quotes ignoring case, whitespace and curly quotes", () => {
    expect(quoteOccursIn("left  Mars for the Tau Ceti", EXTRACTS[0].text)).toBe(true);
    expect(quoteOccursIn("left Venus for the Tau Ceti", EXTRACTS[0].text)).toBe(false);
    expect(quoteOccursIn("Mars", EXTRACTS[0].text)).toBe(false);
    expect(quoteOccursIn(null, EXTRACTS[0].text)).toBe(false);
  });
});

describe("resolveClaims", () => {
  const valid = validateDraft(draft(), KNOWN);
  const checks = [
    { claimId: "claim_ship_1", verdict: "supported" as const, extractId: "bungie#1", quote: "left Mars for the Tau Ceti solar system in 2472", reason: "" },
    { claimId: "claim_ship_2", verdict: "supported" as const, extractId: "wiki#1", quote: "also known by the codename Void", reason: "" },
    // The model claims support with a quote that is not in the extract: must not count.
    { claimId: "claim_ship_3", verdict: "supported" as const, extractId: "press#1", quote: "ten thousand robots", reason: "" },
  ];
  const { claims, dropped } = resolveClaims(valid, checks, BY_ID, SOURCES, "ship");

  it("supports a claim only with a verified quote from a trusted source", () => {
    expect(claims.find((claim) => claim.claimId === "claim_ship_1")?.status).toBe("supported");
  });

  it("marks community-only support as unsupported", () => {
    const claim = claims.find((entry) => entry.claimId === "claim_ship_2");
    expect(claim?.status).toBe("unsupported");
    expect(claim?.reason).toMatch(/^community-only/);
  });

  it("drops a claim whose quote cannot be found (never published)", () => {
    expect(claims.some((claim) => claim.claimText.includes("robots"))).toBe(false);
    expect(dropped.map((entry) => entry.text)).toContain("The ship carried ten thousand robots.");
  });

  it("publishes a verified disagreement as contradicted, attributed to each source", () => {
    const conflict = claims.find((claim) => claim.status === "contradicted");
    expect(conflict?.sourceKeys).toEqual(["bungie", "press"]);
    expect(conflict?.reason).toContain('Publisher bungie (Title bungie) says: "what happened a century ago"');
    expect(conflict?.reason).toContain('Publisher press (Title press) says: "takes place in the year 2893"');
  });

  it("drops a disagreement when a quote is not verifiable", () => {
    const bad = validateDraft(
      draft({ conflicts: [{ heading: "Journey", sentence: "Sources disagree on the year.", positions: [{ extractId: "bungie#2", quote: "a century ago" }, { extractId: "press#1", quote: "the year 3000 exactly" }] }] }),
      KNOWN,
    );
    const result = resolveClaims(bad, [], BY_ID, SOURCES, "ship");
    expect(result.claims.some((claim) => claim.status === "contradicted")).toBe(false);
  });

  it("produces markdown whose claims the reader view marks and cites", () => {
    const markdown = assembleMarkdown({ claims, sectionOrder: ["Journey"], hubLinks: [{ slug: "cryo-archive", title: "Cryo Archive" }] });
    const provenance = buildProvenance({ claims, sources: SOURCES, modelId: "openai/gpt-5-mini", checkModelId: "openai/gpt-5-mini", responseId: null, generatedAt: "2026-11-14T00:00:00.000Z", extractCount: 4 });

    expect(provenance.claimSupport.every((claim) => claim.matchedSourceIds.length > 0)).toBe(true);
    expect(provenance.sourceReferences.map((reference) => reference.authorityTier)).toEqual(["official", "community_wiki", "reputable_editorial"]);
    expect(provenance.modelId).toBe("openai/gpt-5-mini");

    const ctx: ArticleContext = {
      tenantSlug: "marathon",
      knownSlugs: new Set(["cryo-archive"]),
      sources: provenance.sourceReferences.map((reference) => ({ id: reference.sourceId, sourceKey: reference.sourceKey, sourceType: reference.sourceType, title: reference.title, url: reference.url, publisher: reference.publisher, authorityTier: reference.authorityTier, retrievedAt: null })),
      claims: provenance.claimSupport,
      notes: [],
    };
    const plan: ArticlePlan = { citedSourceIds: [], placedNoteIds: [], contradictedClaimIds: [] };
    const processor = unified().use(remarkParse).use(remarkGfm).use(remarkArticle, { ctx, plan });
    processor.runSync(processor.parse(markdown));

    expect(plan.contradictedClaimIds).toEqual([claims.find((claim) => claim.status === "contradicted")?.claimId]);
    expect(plan.citedSourceIds).toEqual(["src_bungie", "src_wiki", "src_press"]);
    expect(markdown).toContain("- [[cryo-archive|Cryo Archive]]");
  });
});

describe("extract selection", () => {
  it("chunks on line boundaries with stable ids and picks relevant extracts in source order", () => {
    const chunks = chunkSnapshot("bungie", Array.from({ length: 40 }, (_, i) => `Line ${i} about Cryo Archive vaults and keys.`).join("\n\n"), 200);
    expect(chunks[0].id).toBe("bungie#1");
    expect(chunks.every((chunk) => chunk.text.length < 400)).toBe(true);

    const spec = { slug: "cryo-archive", title: "Cryo Archive", keywords: ["Vault"], preferredSources: ["bungie"] } as PageSpec;
    const picked = selectExtracts(spec, new Map([["press", [{ id: "press#1", sourceKey: "press", text: "Unrelated text." }]], ["bungie", chunks]]), { perSource: 3 });
    expect(picked.map((extract) => extract.id)).toEqual(["bungie#1", "bungie#2", "bungie#3"]);
  });
});

describe("chunkSnapshot", () => {
  it("keeps a line that introduces a list in the same chunk as the list", () => {
    const filler = "Filler sentence about season resets and starting gear. ".repeat(3).trim();
    const text = [filler, filler, "You get care packages depending on your rank at the end of season 1:", "Runner Level 10: Enhanced kit", "Runner Level 50: Deluxe kit"].join("\n");
    const chunks = chunkSnapshot("kotaku", text, 200);
    const list = chunks.find((chunk) => chunk.text.includes("Runner Level 10"))!;
    expect(list.text).toContain("depending on your rank at the end of season 1:");
  });
});

describe("parseWeaponTable", () => {
  it("reads class headings and name/ammo pairs from a rendered table", () => {
    const text = ["ASSAULT RIFLES", "Versatile rifles.", "Weapon name", "Ammo type", "Impact", "Heavy Rounds", "M77", "Light Rounds", "PISTOLS", "Weapon name", "Ammo type", "V11 Punch", "Volt Battery"].join("\n\n");
    expect(parseWeaponTable(text)).toEqual([
      { name: "Impact", weaponClass: "Assault rifle", ammo: "Heavy Rounds" },
      { name: "M77", weaponClass: "Assault rifle", ammo: "Light Rounds" },
      { name: "V11 Punch", weaponClass: "Pistol", ammo: "Volt Battery" },
    ]);
  });
});

describe("quotesAgreeNumerically", () => {
  it("treats rounded prices as agreement and leaves wording conflicts alone", async () => {
    const { quotesAgreeNumerically } = await import("./pipeline");
    expect(quotesAgreeNumerically(["Expect to pay $40/£30", "priced it at $39.99"])).toBe(true);
    expect(quotesAgreeNumerically(["went dark a century ago", "Decades later, the Marathon ship"])).toBe(false);
    expect(quotesAgreeNumerically(["launches March 5", "launches March 12"])).toBe(false);
    expect(quotesAgreeNumerically(["30,000 colonists", "30000 people"])).toBe(true);
  });
});

describe("editor-flagged disagreements", () => {
  it("shows a disagreement only when both quotes still appear in their sources", async () => {
    const { buildCorpus, resolveKnownConflicts } = await import("./editor");
    const sources = [
      { sourceKey: "a", sourceId: "src_a", sourceType: "official", authorityTier: "official" as const, authorityScore: 95, title: "Site", publisher: "Bungie", url: "https://a.test", publishedDate: null },
      { sourceKey: "b", sourceId: "src_b", sourceType: "official", authorityTier: "official" as const, authorityScore: 95, title: "Post", publisher: "Bungie", url: "https://b.test", publishedDate: null },
    ];
    const corpus = buildCorpus(sources, [
      { sourceKey: "a", text: "No one knows what happened a century ago.", sha256: "1", fetchedAt: null },
      { sourceKey: "b", text: "Decades later, the ship still hangs in orbit.", sha256: "2", fetchedAt: null },
    ]);
    const spec = {
      slug: "lore", title: "Lore", category: "lore", group: "lore", scope: "", keywords: [], preferredSources: [], hubChildren: [], related: [], table: null,
      knownConflicts: [{ heading: "Timeline", sentence: "Sources give different spans.", positions: [{ sourceKey: "a", quote: "what happened a century ago" }, { sourceKey: "b", quote: "Decades later, the ship" }] }],
    };
    const ok = resolveKnownConflicts(spec, corpus);
    expect(ok.claims.map((claim) => claim.status)).toEqual(["contradicted"]);
    expect(ok.claims[0].reason).toBe('Bungie (Site) says: "what happened a century ago" Bungie (Post) says: "Decades later, the ship"');

    const stale = resolveKnownConflicts({ ...spec, knownConflicts: [{ ...spec.knownConflicts[0], positions: [spec.knownConflicts[0].positions[0], { sourceKey: "b", quote: "Two centuries later" }] }] }, corpus);
    expect(stale.claims).toEqual([]);
    expect(stale.dropped[0].reason).toMatch(/no longer appears/);
  });
});

describe("datePatchClaims", () => {
  it("names the update and date for claims that rest only on patch notes", async () => {
    const { datePatchClaims } = await import("./pipeline");
    const sources = new Map([
      ["patch", { sourceKey: "patch", sourceId: "src_patch", sourceType: "patch_notes", authorityTier: "official" as const, authorityScore: 95, title: "Marathon Update 1.1.9.2", publisher: "Bungie", url: "https://p.test", publishedDate: "2026-10-06" }],
      ["site", { sourceKey: "site", sourceId: "src_site", sourceType: "official", authorityTier: "official" as const, authorityScore: 95, title: "Site", publisher: "Bungie", url: "https://s.test", publishedDate: null }],
    ]);
    const base = { claimId: "c", status: "supported" as const, extractIds: [], quotes: [], reason: "", patchRef: null, heading: "h", paragraph: 0 };
    const [patched, mixed] = datePatchClaims(
      [
        { ...base, claimText: "The Echo Pulse range was reduced.", sourceKeys: ["patch"] },
        { ...base, claimText: "Recon tracks enemies.", sourceKeys: ["patch", "site"] },
      ],
      sources,
    );
    expect(patched.claimText).toBe("The Echo Pulse range was reduced (Update 1.1.9.2, October 6, 2026).");
    expect(mixed.claimText).toBe("Recon tracks enemies.");
    const [named] = datePatchClaims([{ ...base, claimText: "Kit ammo rose in Update 1.1.9.2.", sourceKeys: ["patch"] }], sources);
    expect(named.claimText).toBe("Kit ammo rose in Update 1.1.9.2 (October 6, 2026).");
  });
});

describe("isTableShapedExtract", () => {
  it("flags raw table text so a page can read the parsed rows instead", async () => {
    const { isTableShapedExtract } = await import("./pipeline");
    expect(isTableShapedExtract("Impact\nHeavy Rounds\nM77\nLight Rounds\nOverrun\nLight Rounds")).toBe(true);
    expect(isTableShapedExtract("Marathon has ballistic light and heavy rounds and energy-based batteries.")).toBe(false);
  });
});

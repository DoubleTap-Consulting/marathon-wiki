import { describe, expect, it } from "vitest";

import { findRegressions, parseRevision, planPatch, reverifyClaim, tryParseRevision, type StoredClaim } from "./patch";
import { assembleMarkdown, type ResolvedClaim, type SourceRecord } from "./pipeline";

const source = (sourceKey: string, authorityTier: SourceRecord["authorityTier"]): SourceRecord => ({
  sourceKey,
  sourceId: `src_${sourceKey}`,
  sourceType: "official",
  authorityTier,
  authorityScore: 1,
  title: sourceKey,
  publisher: "Bungie",
  url: `https://example.test/${sourceKey}`,
  publishedDate: null,
});
const SOURCES = new Map([
  ["bungie-ranked", source("bungie-ranked", "official")],
  ["wiki", source("wiki", "community_wiki")],
]);
const RANKED_TEXT = [
  "Each Holotag sets a run's score target and loss penalty.",
  "Bronze Holotags have a score target of 3,000 and a loss penalty of 600.",
  "Silver Holotags have a score target of 5,000 and a loss penalty of 2,000.",
  "Loss penalties are decided by your team's combined Holotag value.",
].join("\n");
const EXTRACTS = new Map([["bungie-ranked", [{ id: "bungie-ranked#1", sourceKey: "bungie-ranked", text: RANKED_TEXT }]]]);

function claim(id: number, text: string, heading: string, paragraph = 0, quote = text): ResolvedClaim {
  return {
    claimId: `claim_ranked_${id}`,
    claimText: text,
    status: "supported",
    sourceKeys: ["bungie-ranked"],
    extractIds: ["bungie-ranked#1"],
    quotes: [{ extractId: "bungie-ranked#1", quote }],
    reason: "Verified.",
    patchRef: null,
    heading,
    paragraph,
  };
}

const CLAIMS = [
  claim(1, "Each Holotag sets a run's score target and loss penalty.", "Holotags"),
  claim(2, "Bronze Holotags have a score target of 3,000 and a loss penalty of 600.", "Holotags", 1),
  claim(3, "Silver Holotags have a score target of 5,000 and a loss penalty of 2,000.", "Holotags", 1),
  claim(4, "Loss penalties equal your team's combined Holotag value.", "Scoring", 0, "decided by your team's combined Holotag value"),
];
const stored = (claims: ResolvedClaim[]): StoredClaim[] =>
  claims.map((entry) => ({ claimId: entry.claimId, claimText: entry.claimText, status: entry.status, matchedSourceKeys: entry.sourceKeys, quotes: entry.quotes, reason: entry.reason }));
const BODY = assembleMarkdown({ claims: CLAIMS, sectionOrder: ["Holotags", "Scoring"], hubLinks: [{ slug: "recon", title: "Recon" }], related: [{ slug: "rarity-tiers", title: "Rarity tiers" }] });
const SENTENCES = parseRevision(BODY, stored(CLAIMS))!;

function edit(op: "keep" | "replace" | "add" | "remove", sentenceId: string | null, text: string | null = null, heading: string | null = null) {
  return { op, sentenceId, heading, text, extractIds: text ? ["bungie-ranked#1"] : [], patchRef: null, reason: "test" };
}

function plan(edits: ReturnType<typeof edit>[]) {
  let next = 4;
  return planPatch({ sentences: SENTENCES, edits, knownExtractIds: new Set(["bungie-ranked#1"]), nextClaimId: () => `claim_ranked_${(next += 1)}` });
}

describe("reading a revision back into sentences", () => {
  it("finds every sentence with its section and paragraph, and skips generated link lists", () => {
    expect(SENTENCES.map((sentence) => [sentence.id, sentence.heading, sentence.paragraph, sentence.claim.claimId])).toEqual([
      ["s1", "Holotags", 0, "claim_ranked_1"],
      ["s2", "Holotags", 1, "claim_ranked_2"],
      ["s3", "Holotags", 1, "claim_ranked_3"],
      ["s4", "Scoring", 0, "claim_ranked_4"],
    ]);
  });

  it("gives up on a body that was not written from claims, so the caller rewrites it", () => {
    expect(tryParseRevision("## Overview\n\nHand-written text without citations.", stored(CLAIMS))).toBeNull();
    expect(tryParseRevision(BODY, stored(CLAIMS).slice(1))).toBeNull();
  });
});

describe("planning a sentence patch", () => {
  it("keeps every sentence it does not touch, in place", () => {
    const result = plan([edit("keep", "s1"), edit("replace", "s4", "Loss penalties are decided by your team's combined Holotag value.")]);
    expect(result.order.map((entry) => [entry.kind, entry.kind === "add" ? null : entry.sentence.id])).toEqual([
      ["kept", "s1"],
      ["kept", "s2"],
      ["kept", "s3"],
      ["replace", "s4"],
    ]);
    expect(result.rejected).toEqual([]);
  });

  it("adds after a named sentence or as a new paragraph under a heading, and removes on request", () => {
    const result = plan([
      edit("add", "s3", "Gold Holotags have a score target of 7,000 and a loss penalty of 4,200."),
      edit("add", null, "Ranked returned in Season 2 on June 14 with new rewards.", "Season 2"),
      edit("remove", "s1"),
    ]);
    expect(result.order.map((entry) => (entry.kind === "add" ? `add:${entry.heading}:${entry.paragraph}` : entry.sentence.id))).toEqual([
      "s2",
      "s3",
      "add:Holotags:1",
      "s4",
      "add:Season 2:0",
    ]);
    expect(result.removed.map((sentence) => sentence.id)).toEqual(["s1"]);
  });

  it("rejects bad edits without touching the page", () => {
    const result = plan([
      edit("replace", "s9", "Ranked has six ranks with three tiers each."),
      edit("replace", "s2", "Bronze [Holotags] cost 3,000."),
      edit("add", null, "Each Holotag sets the score target and the loss penalty of a run."),
      edit("add", null, "Ranked has six ranks with three tiers each."),
    ]);
    expect(result.order.map((entry) => entry.kind)).toEqual(["kept", "kept", "kept", "kept"]);
    expect(result.rejected.map((entry) => entry.reason)).toEqual([
      "replace names an unknown sentence s9",
      "markup inside sentence text",
      `repeats a statement the page already makes: "Each Holotag sets a run's score target and loss penalty."`,
      "add needs a sentence to follow or a section heading",
    ]);
  });
});

describe("re-verifying kept sentences", () => {
  it("re-points a kept claim at the extract that still holds its quote", () => {
    const moved = new Map([["bungie-ranked", [{ id: "bungie-ranked#1", sourceKey: "bungie-ranked", text: "New intro." }, { id: "bungie-ranked#2", sourceKey: "bungie-ranked", text: RANKED_TEXT }]]]);
    expect(reverifyClaim({ sentence: SENTENCES[1], extractsBySource: moved, sources: SOURCES })).toMatchObject({
      claimText: SENTENCES[1].claim.claimText,
      extractIds: ["bungie-ranked#2"],
      status: "supported",
      heading: "Holotags",
      paragraph: 1,
    });
  });

  it("drops a kept claim whose quote is gone from its source", () => {
    const changed = new Map([["bungie-ranked", [{ id: "bungie-ranked#1", sourceKey: "bungie-ranked", text: "Bronze Holotags were removed." }]]]);
    expect(reverifyClaim({ sentence: SENTENCES[1], extractsBySource: changed, sources: SOURCES })).toBeNull();
    expect(reverifyClaim({ sentence: SENTENCES[1], extractsBySource: EXTRACTS, sources: SOURCES })).not.toBeNull();
  });
});

describe("the regression check", () => {
  const previous = stored(CLAIMS);
  const without = (index: number) => CLAIMS.filter((_, position) => position !== index);

  it("flags a supported statement the revision drops while its source is unchanged", () => {
    expect(findRegressions({ previous, next: without(1), changedSources: new Set() })).toEqual([
      { claimId: "claim_ranked_2", claimText: "Bronze Holotags have a score target of 3,000 and a loss penalty of 600." },
    ]);
  });

  it("allows the drop when the statement's source changed", () => {
    expect(findRegressions({ previous, next: without(1), changedSources: new Set(["bungie-ranked"]) })).toEqual([]);
  });

  it("does not count a verified replacement or a reworded statement as a drop", () => {
    expect(findRegressions({ previous, next: without(3), superseded: new Set(["claim_ranked_4"]), changedSources: new Set() })).toEqual([]);
    const reworded = [...without(0), { claimText: "Each Holotag sets the run's score target and its loss penalty." }];
    expect(findRegressions({ previous, next: reworded, changedSources: new Set() })).toEqual([]);
  });

  it("ignores statements that were not supported before", () => {
    const community = previous.map((entry, index) => (index === 1 ? { ...entry, status: "unsupported" as const } : entry));
    expect(findRegressions({ previous: community, next: without(1), changedSources: new Set() })).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import { DEFAULT_PUBLISH_POLICY, evaluatePublishGate } from "./editor";
import { evaluateQuotePolicy, findSourceOverlaps, normalizeWords, sourceOverlapReason, unquotedProse } from "./source-overlap";

const luciaSource = {
  sourceKey: "gta6-people-lucia",
  text: "Lucia’s father taught her to fight as soon as she could walk. Life has been coming at her swinging ever since. Sheer luck got her out.",
};

const supported = Array.from({ length: 5 }, () => ({ status: "supported" as const }));

describe("source overlap gate", () => {
  it("flags an unquoted run of 8 or more consecutive words from a cited source", () => {
    const body =
      "## Overview\n\nLife has been coming at her swinging ever since, official materials say.{{cite:gta6-people-lucia}}";
    const hits = findSourceOverlaps(body, [luciaSource]);
    expect(hits[0]?.phrase).toBe("life has been coming at her swinging ever since");
    expect(hits[0]?.wordCount).toBe(9);
    const gate = evaluatePublishGate(supported, DEFAULT_PUBLISH_POLICY, {
      hub: false,
      words: 20,
      sourceOverlaps: hits,
    });
    expect(gate.decision).toBe("needs_review");
    expect(gate.reasons[0]).toContain("copies 8+ consecutive words");
    expect(gate.reasons[0]).toContain("life has been coming at her swinging ever since");
  });

  it("allows the same distinctive phrase when it is a short quotation", () => {
    const body =
      "## Overview\n\nRockstar writes that \"Life has been coming at her swinging ever since.\"{{cite:gta6-people-lucia}}";
    expect(findSourceOverlaps(body, [luciaSource])).toEqual([]);
    const typographic =
      "## Overview\n\nRockstar writes that “Life has been coming at her swinging ever since.”{{cite:gta6-people-lucia}}";
    expect(findSourceOverlaps(typographic, [luciaSource])).toEqual([]);
  });

  it("does not flag a 7-word run", () => {
    const source = { sourceKey: "s", text: "alpha beta gamma delta epsilon zeta eta theta iota" };
    const body = "## Overview\n\nAlpha beta gamma delta epsilon zeta eta, the page notes.{{cite:s}}";
    expect(normalizeWords("Alpha beta gamma delta epsilon zeta eta")).toHaveLength(7);
    expect(findSourceOverlaps(body, [source])).toEqual([]);
  });

  it("ignores citation markers when comparing word runs", () => {
    const body =
      "## Overview\n\nLife has been{{cite:gta6-people-lucia}} coming at her swinging ever since today.{{cite:gta6-people-lucia}}";
    const hits = findSourceOverlaps(body, [luciaSource]);
    expect(hits.some((hit) => hit.phrase.includes("life has been coming at her swinging ever since"))).toBe(true);
  });

  it("treats typographic apostrophes as the same word as ASCII apostrophes", () => {
    expect(normalizeWords("Lucia’s father")).toEqual(normalizeWords("Lucia's father"));
  });

  it("strips quoted spans from unquoted prose", () => {
    expect(normalizeWords(unquotedProse('He said "Life has been coming at her swinging ever since" later.'))).toEqual([
      "he",
      "said",
      "later",
    ]);
  });

  it("summarizes several overlaps in the gate reason", () => {
    const reason = sourceOverlapReason([
      { phrase: "one two three four five six seven eight", wordCount: 8 },
      { phrase: "a b c d e f g h", wordCount: 8 },
      { phrase: "i j k l m n o p", wordCount: 8 },
      { phrase: "q r s t u v w x", wordCount: 8 },
    ]);
    expect(reason).toContain("and 1 more");
  });
});

describe("quotation budget", () => {
  const filler = "Official materials describe the setting, the characters, and the release in measured terms that stay well clear of marketing copy while remaining accurate to the cited sources. " + "Further context names platforms, editions, and the dates already confirmed by those same materials without repeating their wording.";

  it("fails a section that contains more than one quotation", () => {
    const body = `## Overview\n\nRockstar says "sheer luck got her out" and later "fresh out of prison."{{cite:s}}\n\n${filler}`;
    const policy = evaluateQuotePolicy(body);
    expect(policy.reasons.some((reason) => reason.includes('section "Overview" has 2 quotations'))).toBe(true);
    const gate = evaluatePublishGate(supported, DEFAULT_PUBLISH_POLICY, { hub: false, words: 40, quotePolicy: policy });
    expect(gate.decision).toBe("needs_review");
    expect(gate.reasons.join(" ")).toContain("2 quotations");
  });

  it("allows one short quotation in each of two sections", () => {
    const body = `## Overview\n\nRockstar writes that "sheer luck got her out."{{cite:s}} ${filler}\n\n## Ambition\n\nThe biography also uses the phrase "half-baked fantasies."{{cite:s}} ${filler}`;
    const policy = evaluateQuotePolicy(body);
    expect(policy.reasons).toEqual([]);
    expect(policy.quotes).toHaveLength(2);
  });

  it("fails a quotation longer than 15 words and allows one of 15 words", () => {
    const sixteen = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen";
    const fifteen = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen";
    const over = evaluateQuotePolicy(`## Overview\n\nRockstar writes "${sixteen}."{{cite:s}} ${filler} ${filler}`);
    expect(over.reasons.some((reason) => reason.includes("16 words"))).toBe(true);
    const allowed = evaluateQuotePolicy(`## Overview\n\nRockstar writes "${fifteen}."{{cite:s}} ${filler} ${filler}`);
    expect(allowed.reasons.filter((reason) => reason.includes("words (max 15)"))).toEqual([]);
    expect(allowed.quotes[0]?.wordCount).toBe(15);
  });

  it("fails when quoted words are more than 10% of page prose, and allows 10%", () => {
    const quote = "one two three four five six seven eight nine ten"; // 10 words
    // 10 / 100 = 10% exactly should pass; add 90 non-quote words.
    const ninety = Array.from({ length: 90 }, (_, i) => `w${i}`).join(" ");
    const atCap = evaluateQuotePolicy(`## Overview\n\n"${quote}." ${ninety}`);
    expect(atCap.quotedWords).toBe(10);
    expect(atCap.proseWords).toBe(100);
    expect(atCap.quotedRatio).toBeCloseTo(0.1);
    expect(atCap.reasons.filter((reason) => reason.includes("quoted words"))).toEqual([]);

    const eightyNine = Array.from({ length: 89 }, (_, i) => `w${i}`).join(" ");
    const over = evaluateQuotePolicy(`## Overview\n\n"${quote}." ${eightyNine}`);
    expect(over.proseWords).toBe(99);
    expect(over.quotedRatio).toBeGreaterThan(0.1);
    expect(over.reasons.some((reason) => reason.includes("quoted words are"))).toBe(true);
  });
});

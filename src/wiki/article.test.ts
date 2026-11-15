import { describe, expect, it } from "vitest";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

import {
  changesOnly,
  diffParagraphs,
  findNormalizedRange,
  remarkArticle,
  type ArticleContext,
  type ArticlePlan,
} from "./article";

function plan(markdown: string, ctx: Partial<ArticleContext>) {
  const full: ArticleContext = {
    tenantSlug: "marathon",
    knownSlugs: new Set(),
    sources: [],
    claims: [],
    notes: [],
    ...ctx,
  };
  const result: ArticlePlan = { citedSourceIds: [], placedNoteIds: [], contradictedClaimIds: [] };
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkArticle, { ctx: full, plan: result });
  const tree = processor.runSync(processor.parse(markdown));
  return { plan: result, tree: JSON.stringify(tree) };
}

const source = (id: string, sourceKey: string) => ({
  id,
  sourceKey,
  sourceType: "official",
  title: id,
  url: null,
  publisher: null,
  authorityTier: "official",
  retrievedAt: null,
});

const claim = (claimText: string, status: "supported" | "unsupported" | "contradicted", matchedSourceIds: string[] = []) => ({
  claimId: claimText.slice(0, 8),
  claimText,
  status,
  supportScore: 0,
  matchedTerms: [],
  missingTerms: [],
  matchedSourceIds,
  matchedSourceKeys: [],
  matchedSourceTitles: [],
  reason: "",
});

describe("findNormalizedRange", () => {
  it("matches across case, whitespace and curly quotes, keeping the full stop", () => {
    const text = "Intro.  Marathon’s  setting HAS factions. Outro.";
    const range = findNormalizedRange(text, "Marathon's setting has factions");
    expect(range && text.slice(...range)).toBe("Marathon’s  setting HAS factions.");
  });

  it("returns null when the claim is not in the text", () => {
    expect(findNormalizedRange("Nothing here at all.", "Faction names are final for launch.")).toBeNull();
  });
});

describe("remarkArticle", () => {
  it("numbers citations by first appearance, not by source order", () => {
    const { plan: result } = plan("One.{{cite:b}} Two.{{cite:a}} Three.{{cite:b}}", {
      sources: [source("A", "a"), source("B", "b")],
    });
    expect(result.citedSourceIds).toEqual(["B", "A"]);
  });

  it("resolves [^n] footnotes to the n-th source and drops unknown keys", () => {
    const { plan: result } = plan("Fact.[^2] Other.{{cite:missing}}\n\n[^2]: ignored", {
      sources: [source("A", "a"), source("B", "b")],
    });
    expect(result.citedSourceIds).toEqual(["B"]);
  });

  it("adds markers for supported claims and flags only contradicted claims present in the body", () => {
    const { plan: result, tree } = plan("Names follow official spelling. Relationships may shift.", {
      sources: [source("A", "a")],
      claims: [
        claim("Names follow official spelling.", "supported", ["A"]),
        claim("Relationships may shift.", "unsupported"),
        claim("Faction names are final for launch.", "contradicted"),
      ],
    });
    expect(result.citedSourceIds).toEqual(["A"]);
    expect(tree).toContain('"hName":"claim-mark"');
    expect(result.contradictedClaimIds).toEqual([]);
  });

  it("places a community note after the block that quotes it", () => {
    const { tree, plan: result } = plan("## Heading\n\nFirst paragraph.\n\nSecond paragraph with the quote here.\n\nThird.", {
      notes: [{ id: "n1", targetQuote: "with the quote here" }, { id: "n2", targetQuote: "not anywhere in the text" }],
    });
    const parsed = JSON.parse(tree);
    const index = parsed.children.findIndex((node: { type: string }) => node.type === "communityNote");
    expect(parsed.children[index - 1].children[0].value).toContain("Second paragraph");
    expect(result.placedNoteIds).toEqual(["n1"]);
  });
});

describe("diffParagraphs", () => {
  it("word-diffs an edited paragraph and keeps one paragraph of context", () => {
    const before = "A.\n\nB.\n\nC old text.\n\nD.\n\nE.";
    const after = "A.\n\nB.\n\nC new text.\n\nD.\n\nE.\n\nF added.";
    const rows = diffParagraphs(before, after);
    expect(rows.map((row) => row.kind)).toEqual(["same", "same", "changed", "same", "same", "added"]);
    const changed = rows[2];
    expect(changed.kind === "changed" && changed.parts.some((part) => part.added && part.value === "new")).toBe(true);
    expect(changesOnly(rows).map((row) => row.kind)).toEqual(["gap", "same", "changed", "same", "same", "added"]);
  });
});

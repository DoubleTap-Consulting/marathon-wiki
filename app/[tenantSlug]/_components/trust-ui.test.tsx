import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { DiffRow } from "@/src/wiki/article";

import { DiffView } from "../[pageSlug]/history/[rev]/diff-view";
import { ClaimMark, ProvenanceTrigger } from "./trust-ui";

/** Each trust-state label: its icon and its words, read from the server render. */
function labels(html: string) {
  return [...html.matchAll(/<(?:span(?=[^>]*data-trust-label)|button)[^>]*>\s*<svg[^>]*aria-hidden="true"[^>]*>.*?<\/svg>([^<]+)</g)].map((match) => match[1].trim());
}

describe("trust states show an icon and a label, never color alone", () => {
  it("unverified claim", () => {
    const html = renderToStaticMarkup(<ClaimMark status="unsupported" reason="No source yet." sources={[]}>The colony fell.</ClaimMark>);
    expect(labels(html)).toEqual(["Unconfirmed"]);
  });

  it("conflicting sources", () => {
    const html = renderToStaticMarkup(<ClaimMark status="contradicted" reason="A says x." sources={[]}>The colony fell.</ClaimMark>);
    expect(labels(html)).toEqual(["Sources disagree"]);
  });

  it("AI-edited page", () => {
    const html = renderToStaticMarkup(<ProvenanceTrigger label="Updated by AI" lines={["Written by a model."]} footnote={null} className="" />);
    expect(labels(html)).toEqual(["Updated by AI"]);
  });

  it("diff added, removed and changed, with fill and strikethrough kept", () => {
    const rows: DiffRow[] = [
      { kind: "added", text: "New line." },
      { kind: "removed", text: "Old line." },
      { kind: "changed", parts: [{ value: "Kept " }, { value: "new", added: true }, { value: "old", removed: true }] },
    ];
    const html = renderToStaticMarkup(<DiffView full={rows} changes={rows} />);
    expect(labels(html)).toEqual(["Added", "Removed", "Changed"]);
    expect(html).toMatch(/class="[^"]*bg-diff-added-surface[^"]*"><span[^>]*data-trust-label/);
    expect(html).toMatch(/class="[^"]*line-through[^"]*"><span[^>]*data-trust-label/);
    expect(html).toMatch(/<ins class="bg-diff-added-surface[^"]*">/);
    expect(html).toContain("<del ");
  });
});

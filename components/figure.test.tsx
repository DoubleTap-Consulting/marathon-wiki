import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { licenseInfo } from "@/content/imagery-schema";
import { figureAlt, figureSpecs } from "@/src/wiki/figure-data";
import { imagesFor } from "@/src/wiki/imagery";

import { TierBPlate } from "./figures";

const generated: Array<{ slug: string; aiProvenance: { claimSupport: never[] } }> = JSON.parse(
  readFileSync(new URL("../content/marathon/generated/pages.json", import.meta.url), "utf8"),
);
const claimsFor = (slug: string) => generated.find((page) => page.slug === slug)?.aiProvenance.claimSupport ?? [];
const escape = (text: string) => renderToStaticMarkup(<>{text}</>);

/** The markup of the one <figure>, so every assertion is about what sits inside it. */
function figureOf(html: string) {
  const match = html.match(/<figure[\s\S]*<\/figure>/);
  expect(match).not.toBeNull();
  return match![0];
}

describe("Figure, for every diagram in the registry", () => {
  for (const image of imagesFor("marathon").filter((entry) => entry.tier === "B")) {
    it(`${image.id}: credit and license link sit inside its figure`, () => {
      const html = renderToStaticMarkup(
              <TierBPlate image={image} number={1} claims={claimsFor(image.generator!.page)} citation={() => ({ number: 1, title: "Ranked in Marathon", url: "https://www.bungie.net/7/en/News/Article/ranked_in_marathon" })} showGaps={false} />,
            );
      const figure = figureOf(html);
      expect(figure).toContain(escape(image.credit));
      expect(figure).toContain(`href="${image.licenseUrl}"`);
      expect(figure).toContain(escape(licenseInfo[image.license].short));
      {
        const spec = figureSpecs[image.generator!.kind];
        expect(figure).toContain("Chart data");
        expect(figure).toContain(escape(`Fig. 1. ${spec.title}.`));
        expect(figure).toMatch(/Source: <span><a href="https:\/\/www\.bungie\.net\/7\/en\/News\/Article\/ranked_in_marathon"[^>]*>Ranked in Marathon<\/a>/);
        expect(figure).toMatch(/href="#ref-1"/);
        const svgs = [...figure.matchAll(/<svg[^>]*role="img"[^>]*>/g)].map((match) => match[0]);
        expect(svgs.length).toBe(2);
        for (const svg of svgs) {
          expect(svg).toContain(`aria-label="${escape(figureAlt(spec))}"`);
          const describedBy = svg.match(/aria-describedby="([^"]+)"/)?.[1];
          expect(figure).toContain(`<table id="${describedBy}"`);
        }
        expect(figureAlt(spec)).toMatch(/^[^.;]+; the full .+ are in the data table below\.$/);
      }
    });
  }

  it("hides a Tier B plate when its claims aren't on the revision (gap only on previews)", () => {
    const image = imagesFor("marathon").find((entry) => entry.id === "ranked-run-flow")!;
    expect(renderToStaticMarkup(<TierBPlate image={image} number={1} claims={[]} citation={() => ({ number: 1, title: "Ranked in Marathon", url: "https://www.bungie.net/7/en/News/Article/ranked_in_marathon" })} showGaps={false} />)).toBe("");
    expect(renderToStaticMarkup(<TierBPlate image={image} number={1} claims={[]} citation={() => ({ number: 1, title: "Ranked in Marathon", url: "https://www.bungie.net/7/en/News/Article/ranked_in_marathon" })} showGaps />)).toContain("figure-gap");
    expect(
      renderToStaticMarkup(<TierBPlate image={image} number={1} claims={claimsFor("ranked")} citation={() => null} showGaps={false} />),
    ).toBe("");
  });
});

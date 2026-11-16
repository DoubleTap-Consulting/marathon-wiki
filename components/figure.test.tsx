import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { licenseInfo } from "@/content/imagery-schema";
import { imagesFor } from "@/src/wiki/imagery";

import { FigureBand, ILLUSTRATIVE_BADGE } from "./figure";
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

describe("Figure, for every registry entry", () => {
  for (const image of imagesFor("marathon")) {
    it(`${image.id}: badge, credit and license link sit inside its figure`, () => {
      const html =
        image.tier === "C"
          ? renderToStaticMarkup(<FigureBand image={image} slot={image.usedOn[0].slot === "home-band" ? "home-band" : "hub-band"} />)
          : renderToStaticMarkup(
              <TierBPlate image={image} number={1} claims={claimsFor(image.generator!.page)} citationNumber={() => 1} showGaps={false} />,
            );
      const figure = figureOf(html);
      expect(figure).toContain(escape(image.credit));
      expect(figure).toContain(`href="${image.licenseUrl}"`);
      expect(figure).toContain(escape(licenseInfo[image.license].short));
      if (image.tier === "C") {
        expect(figure).toContain(escape(ILLUSTRATIVE_BADGE));
        expect(figure).toContain(`href="${image.sourceUrl}"`);
        expect(figure).not.toMatch(/src="https?:/);
        expect(figure).toMatch(/loading="eager"/);
        expect(figure.toLowerCase()).toMatch(/fetchpriority="high"/);
      } else {
        expect(figure).toContain("Chart data");
        expect(figure).toMatch(/href="#ref-1"/);
        expect(figure).toMatch(/<svg[^>]*role="img"/);
      }
    });
  }

  it("hides a Tier B plate when its claims aren't on the revision (gap only on previews)", () => {
    const image = imagesFor("marathon").find((entry) => entry.id === "ranked-run-flow")!;
    expect(renderToStaticMarkup(<TierBPlate image={image} number={1} claims={[]} citationNumber={() => 1} showGaps={false} />)).toBe("");
    expect(renderToStaticMarkup(<TierBPlate image={image} number={1} claims={[]} citationNumber={() => 1} showGaps />)).toContain("figure-gap");
    expect(
      renderToStaticMarkup(<TierBPlate image={image} number={1} claims={claimsFor("ranked")} citationNumber={() => null} showGaps={false} />),
    ).toBe("");
  });
});

import type { ComponentType } from "react";

import { FigureGap, FigurePlate, type FigureCite } from "@/components/figure";
import type { ImageAsset } from "@/content/imagery-schema";
import { figureSpecs, resolveFigureRows, type ClaimLike, type ResolvedRow } from "@/src/wiki/figure-data";

import { RankedRunFlow } from "./ranked-run-flow";
import { RarityNamedTiers } from "./rarity-named-tiers";

const generators: Record<string, ComponentType<{ rows: ResolvedRow[]; label: string }>> = {
  "ranked-run-flow": RankedRunFlow,
  "rarity-named-tiers": RarityNamedTiers,
};

/**
 * A page's Tier B plate, or nothing: it renders only when every value it draws is a supported claim on
 * this revision with a numbered reference. Preview builds show the gap instead of hiding it.
 */
export function TierBPlate({
  image,
  number,
  claims,
  citationNumber,
  showGaps,
}: {
  image: ImageAsset;
  number: number;
  claims: ClaimLike[];
  /** The reference number for a source id on this page, if it is cited. */
  citationNumber: (sourceId: string) => number | null;
  showGaps: boolean;
}) {
  const spec = image.generator ? figureSpecs[image.generator.kind] : undefined;
  const Generator = image.generator ? generators[image.generator.kind] : undefined;
  const rows = spec ? resolveFigureRows(spec, claims) : null;
  const citeFor = (row: ResolvedRow): FigureCite | null => {
    for (const id of row.claim.matchedSourceIds) {
      const cited = citationNumber(id);
      if (cited) return { number: cited, href: `#ref-${cited}` };
    }
    return null;
  };
  const cited = rows?.every((row) => citeFor(row) !== null) ?? false;

  if (!spec || !Generator || !rows || !cited) {
    return showGaps ? <FigureGap label={`Figure hidden · ${image.id} · claims not on this revision`} /> : null;
  }

  return (
    <FigurePlate image={image} number={number} rows={rows} columns={spec.columns} citeFor={(row) => citeFor(row) as FigureCite}>
      <Generator rows={rows} label={image.alt} />
    </FigurePlate>
  );
}

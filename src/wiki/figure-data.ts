/**
 * Tier B figure data. Every value a diagram draws is a row here, tied to the page claim that states it.
 * The build gate (scripts/images/check.ts) checks each row against the page's generated claims, and the
 * page renders the figure only when every row still matches a supported claim on the live revision.
 * Plain TypeScript with relative imports only: the gate runs it with Node's type stripping.
 */

export type FigureRow = {
  key: string;
  /** What the diagram shows for this row. */
  label: string;
  /** The value in the Chart data table. */
  value: string;
  /** Terms that must all appear in one supported claim on the page (case-insensitive). */
  match: string[];
  /** The claim the row was drawn from in the generated content (checked by the build gate). */
  claimId: string;
};

export type FigureSpec = {
  kind: string;
  page: string;
  /** The caption title: "Fig. N. {title}." */
  title: string;
  /** What kind of chart it is and what it shows, for the alt text: "{structure}; the full {contents} are in the data table below." */
  structure: string;
  contents: string;
  columns: [string, string];
  rows: FigureRow[];
};

/** The diagram's caption title, numbered per page in order. */
export function figureCaptionTitle(spec: FigureSpec, number: number) {
  return `Fig. ${number}. ${spec.title}.`;
}

/** One sentence naming the structure and pointing at the data table, which holds every value. */
export function figureAlt(spec: FigureSpec) {
  return `${spec.structure}; the full ${spec.contents} are in the data table below.`;
}

export const figureSpecs: Record<string, FigureSpec> = {
  "ranked-run-flow": {
    kind: "ranked-run-flow",
    page: "ranked",
    title: "How a ranked run is scored",
    structure: "Flow diagram of ranked scoring",
    contents: "steps",
    columns: ["Step", "Rule"],
    rows: [
      {
        key: "target",
        label: "Score target",
        value: "The team's combined Holotag value sets the run's score target",
        match: ["combined Holotag value", "score target"],
        claimId: "claim_ranked_9",
      },
      {
        key: "meet",
        label: "Exfil at or above target",
        value: "Earns Ranked Points",
        match: ["at or above the score target", "Ranked Points"],
        claimId: "claim_ranked_11",
      },
      {
        key: "below",
        label: "Exfil below target",
        value: "No RP change",
        match: ["below", "no RP change"],
        claimId: "claim_ranked_11",
      },
      {
        key: "fail",
        label: "Fail to exfil",
        value: "Loss penalty, set by the combined Holotag value",
        match: ["fail", "exfil", "penalt", "combined Holotag value"],
        claimId: "claim_ranked_13",
      },
    ],
  },
  "rarity-named-tiers": {
    kind: "rarity-named-tiers",
    page: "rarity-tiers",
    title: "Named rarity tiers and their sourced colours",
    structure: "Swatch chart of the named rarity tiers",
    contents: "tiers and colours",
    columns: ["Tier", "Colour named by a source"],
    rows: [
      { key: "standard", label: "Standard", value: "Not sourced", match: ["Standard"], claimId: "claim_rarity-tiers_3" },
      { key: "enhanced", label: "Enhanced", value: "Green", match: ["Enhanced", "Green"], claimId: "claim_rarity-tiers_4" },
      { key: "deluxe", label: "Deluxe", value: "Blue", match: ["Deluxe", "Blue"], claimId: "claim_rarity-tiers_5" },
      {
        key: "superior",
        label: "Superior",
        value: "Not sourced; ranks above Deluxe (items were reduced from Superior to Deluxe)",
        match: ["Superior", "Deluxe", "reduced"],
        claimId: "claim_rarity-tiers_8",
      },
    ],
  },
};

export type ClaimLike = { claimId: string; claimText: string; status: string; matchedSourceIds: string[] };

const fold = (text: string) => text.toLowerCase().replace(/[\u2018\u2019\u02bc]/g, "'");

/** True when the claim is supported and states every term. */
export function claimStates(claim: ClaimLike, terms: string[]) {
  if (claim.status !== "supported") return false;
  const text = fold(claim.claimText);
  return terms.every((term) => text.includes(fold(term)));
}

export type ResolvedRow = FigureRow & { claim: ClaimLike };

/**
 * Each row paired with the live claim that states it, or null when any row is unsupported on this
 * revision: a diagram never shows a value the page itself doesn't cite.
 */
export function resolveFigureRows(spec: FigureSpec, claims: ClaimLike[]): ResolvedRow[] | null {
  const resolved: ResolvedRow[] = [];
  for (const row of spec.rows) {
    const byId = claims.find((claim) => claim.claimId === row.claimId && claimStates(claim, row.match));
    const claim = byId ?? claims.find((claim) => claimStates(claim, row.match));
    if (!claim) return null;
    resolved.push({ ...row, claim });
  }
  return resolved;
}

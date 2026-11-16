import type { ResolvedRow } from "@/src/wiki/figure-data";

import { Diagram } from "./svg";

/** The colour a source names, drawn as a swatch; never the only cue (the name is always printed beside it). */
const NAMED_COLOUR: Record<string, string> = { Green: "oklch(0.62 0.15 145)", Blue: "oklch(0.58 0.15 255)" };

function Swatch({ x, y, size, colour, id }: { x: number; y: number; size: number; colour: string | null; id: string }) {
  return colour ? (
    <rect x={x + 0.5} y={y + 0.5} width={size - 1} height={size - 1} fill={NAMED_COLOUR[colour]} stroke="currentColor" />
  ) : (
    <>
      <defs>
        <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="1" />
        </pattern>
      </defs>
      <rect x={x + 0.5} y={y + 0.5} width={size - 1} height={size - 1} fill={`url(#${id})`} stroke="currentColor" />
    </>
  );
}

/** Named rarity tiers, each with its sourced colour or a hatched "Colour not sourced" swatch. */
export function RarityNamedTiers({ rows, label, describedBy }: { rows: ResolvedRow[]; label: string; describedBy: string }) {
  const tiers = rows.map((row) => ({ key: row.key, name: row.label, colour: row.value in NAMED_COLOUR ? row.value : null }));
  if (tiers.length === 0) return null;
  const note = "Listed in the order this page names them. Sources rank only Superior above Deluxe.";

  return (
    <>
      <Diagram label={label} describedBy={describedBy} viewBox="0 0 720 200" className="hidden sm:block">
        {tiers.map((tier, index) => {
          const x = index * 180;
          return (
            <g key={tier.key}>
              <Swatch x={x} y={0} size={64} colour={tier.colour} id={`rnt-w-${tier.key}`} />
              <text x={x} y={92} fontSize="13" fontWeight="700" letterSpacing="0.06em" fill="currentColor">
                {tier.name.toUpperCase()}
              </text>
              <text x={x} y={112} fontSize="14" className="fill-muted-foreground">
                {tier.colour ?? "Colour not sourced"}
              </text>
            </g>
          );
        })}
        <path d="M376 140H548" fill="none" stroke="currentColor" />
        <text x={376} y={160} fontSize="13" className="fill-muted-foreground">
          Deluxe &lt; Superior
        </text>
        <text x={0} y={192} fontSize="13" className="fill-muted-foreground">
          {note}
        </text>
      </Diagram>
      <Diagram label={label} describedBy={describedBy} viewBox="0 0 340 300" className="sm:hidden">
        {tiers.map((tier, index) => {
          const y = index * 60;
          return (
            <g key={tier.key}>
              <Swatch x={0} y={y} size={44} colour={tier.colour} id={`rnt-n-${tier.key}`} />
              <text x={60} y={y + 18} fontSize="13" fontWeight="700" letterSpacing="0.06em" fill="currentColor">
                {tier.name.toUpperCase()}
              </text>
              <text x={60} y={y + 38} fontSize="14" className="fill-muted-foreground">
                {tier.colour ?? "Colour not sourced"}
                {tier.key === "superior" ? " · ranks above Deluxe" : ""}
              </text>
            </g>
          );
        })}
        <text x={0} y={262} fontSize="13" className="fill-muted-foreground">
          Listed in the order this page names them.
        </text>
        <text x={0} y={282} fontSize="13" className="fill-muted-foreground">
          Sources rank only Superior above Deluxe.
        </text>
      </Diagram>
    </>
  );
}

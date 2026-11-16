import type { ReactNode } from "react";

/** Shared SVG pieces for Tier B diagrams: currentColor strokes and token fills, so they follow the scheme. */
export function Arrowhead({ id }: { id: string }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M0 0 8 4 0 8z" fill="currentColor" />
      </marker>
    </defs>
  );
}

export function Box({
  x,
  y,
  w,
  h,
  title,
  lines = [],
  strong = false,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  lines?: string[];
  strong?: boolean;
}) {
  return (
    <g>
      <rect x={x + 0.5} y={y + 0.5} width={w - 1} height={h - 1} fill="none" stroke="currentColor" strokeWidth={strong ? 2 : 1} />
      <text x={x + 12} y={y + 22} fontSize="13" fontWeight="700" letterSpacing="0.06em" fill="currentColor">
        {title.toUpperCase()}
      </text>
      {lines.map((line, index) => (
        <text key={index} x={x + 12} y={y + 42 + index * 18} fontSize="14" className="fill-muted-foreground">
          {line}
        </text>
      ))}
    </g>
  );
}

export function Diagram({
  label,
  describedBy,
  viewBox,
  className,
  children,
}: {
  label: string;
  /** The id of the figure's Chart data table. */
  describedBy: string;
  viewBox: string;
  className?: string;
  children: ReactNode;
}) {
  const [, , width] = viewBox.split(" ").map(Number);
  return (
    <svg role="img" aria-label={label} aria-describedby={describedBy} viewBox={viewBox} className={className} width="100%" style={{ maxWidth: width, maxHeight: 480 }} fontFamily="inherit">
      {children}
    </svg>
  );
}

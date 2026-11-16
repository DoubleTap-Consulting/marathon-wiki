import type { ResolvedRow } from "@/src/wiki/figure-data";

import { Arrowhead, Box, Diagram } from "./svg";

/** Ranked run flow: Holotags set the target, then the run ends one of three ways. Each box is a row in Chart data. */
export function RankedRunFlow({ rows, label }: { rows: ResolvedRow[]; label: string }) {
  const has = (key: string) => rows.some((row) => row.key === key);
  if (!["target", "meet", "below", "fail"].every(has)) return null;

  const outcomes = [
    { title: "Exfil ≥ target", line: "Earns Ranked Points" },
    { title: "Exfil < target", line: "No RP change" },
    { title: "No exfil", line: "Loss penalty = tag value" },
  ];

  return (
    <>
      <Diagram label={label} viewBox="0 0 720 210" className="hidden sm:block">
        <Arrowhead id="rrf-w" />
        <Box x={0} y={60} w={200} h={90} title="Holotags" lines={["Combined value sets", "the score target"]} strong />
        <line x1={200} y1={105} x2={244} y2={105} stroke="currentColor" markerEnd="url(#rrf-w)" />
        <Box x={246} y={80} w={100} h={50} title="Run" />
        <path d="M346 105H384M384 35V175" fill="none" stroke="currentColor" />
        {outcomes.map((outcome, index) => {
          const y = 10 + index * 70;
          return (
            <g key={outcome.title}>
              <line x1={384} y1={y + 25} x2={428} y2={y + 25} stroke="currentColor" markerEnd="url(#rrf-w)" />
              <Box x={430} y={y} w={290} h={50} title={outcome.title} />
              <text x={710} y={y + 31} fontSize="14" textAnchor="end" fill="currentColor">
                {outcome.line}
              </text>
            </g>
          );
        })}
      </Diagram>
      <Diagram label={label} viewBox="0 0 340 400" className="sm:hidden">
        <Arrowhead id="rrf-n" />
        <Box x={0} y={0} w={340} h={70} title="Holotags" lines={["Combined value sets the score target"]} strong />
        <line x1={170} y1={70} x2={170} y2={96} stroke="currentColor" markerEnd="url(#rrf-n)" />
        <Box x={0} y={98} w={340} h={40} title="Run" />
        <path d="M20 138V354" fill="none" stroke="currentColor" />
        {outcomes.map((outcome, index) => {
          const y = 160 + index * 80;
          return (
            <g key={outcome.title}>
              <line x1={20} y1={y + 32} x2={38} y2={y + 32} stroke="currentColor" markerEnd="url(#rrf-n)" />
              <Box x={40} y={y} w={300} h={64} title={outcome.title} lines={[outcome.line]} />
            </g>
          );
        })}
      </Diagram>
    </>
  );
}

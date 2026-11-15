"use client";

import { useState } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { DiffRow } from "@/src/wiki/article";

const ADDED = "border-l-2 border-emerald-600 bg-emerald-500/10 pl-3";
const REMOVED = "border-l-2 border-destructive/60 bg-destructive/5 pl-3 text-muted-foreground line-through decoration-destructive/50";

function Paragraph({ text }: { text: string }) {
  const heading = /^(#{1,3})\s+(.*)$/.exec(text);
  return heading ? <span className="font-semibold">{heading[2]}</span> : <>{text}</>;
}

export function DiffView({ full, changes }: { full: DiffRow[]; changes: DiffRow[] }) {
  const [mode, setMode] = useState<"changes" | "full">("changes");
  const rows = mode === "changes" ? changes : full;
  const hasChanges = full.some((row) => row.kind !== "same");

  return (
    <div className="mt-8">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={mode}
        onValueChange={(value) => value && setMode(value as "changes" | "full")}
        aria-label="Diff view"
      >
        <ToggleGroupItem value="changes" className="min-h-11 px-3 md:min-h-8">Changes only</ToggleGroupItem>
        <ToggleGroupItem value="full" className="min-h-11 px-3 md:min-h-8">Full page</ToggleGroupItem>
      </ToggleGroup>

      {!hasChanges ? (
        <p className="mt-6 text-muted-foreground">The text did not change in this revision.</p>
      ) : (
        <div className="mt-6 space-y-4 text-[17px] leading-[1.65] whitespace-pre-line">
          {rows.map((row, index) => {
            if (row.kind === "gap") {
              return (
                <p key={index} className="text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {row.count} unchanged {row.count === 1 ? "paragraph" : "paragraphs"}
                </p>
              );
            }
            if (row.kind === "changed") {
              const heading = /^#{1,6}\s+/.exec(row.parts[0]?.value ?? "");
              const parts = heading
                ? [{ ...row.parts[0], value: row.parts[0].value.slice(heading[0].length) }, ...row.parts.slice(1)]
                : row.parts;
              return (
                <p key={index} className={cn("border-l-2 border-emerald-600/40 pl-3", heading && "font-semibold")}>
                  {parts.map((part, partIndex) =>
                    part.added ? (
                      <ins key={partIndex} className="bg-emerald-500/15 no-underline">
                        <span className="sr-only">Added: </span>
                        {part.value}
                      </ins>
                    ) : part.removed ? (
                      <del key={partIndex} className="bg-destructive/5 text-muted-foreground decoration-destructive/50">
                        <span className="sr-only">Removed: </span>
                        {part.value}
                      </del>
                    ) : (
                      <span key={partIndex}>{part.value}</span>
                    ),
                  )}
                </p>
              );
            }
            return (
              <p key={index} className={cn(row.kind === "added" && ADDED, row.kind === "removed" && REMOVED, row.kind === "same" && "pl-3.5")}>
                {row.kind === "added" ? <span className="sr-only">Added: </span> : null}
                {row.kind === "removed" ? <span className="sr-only">Removed: </span> : null}
                <Paragraph text={row.text} />
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}

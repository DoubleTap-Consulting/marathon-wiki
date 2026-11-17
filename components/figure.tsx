import type { ReactNode } from "react";

import { licenseInfo, type ImageAsset } from "@/content/imagery-schema";
import { cn } from "@/lib/utils";
import { network } from "@/src/wiki/network";
import type { ResolvedRow } from "@/src/wiki/figure-data";

const LINK = "text-link underline decoration-1 underline-offset-3 hover:decoration-2";

/** "{title} · {credit} · {license} · {modifications}", title linked to the source and license to its terms. */
export function CreditLine({ image }: { image: ImageAsset }) {
  return (
    <span data-slot="credit">
      <a href={image.sourceUrl} className={LINK}>
        {image.title}
      </a>
      {" · "}
      {image.credit}
      {" · "}
      <a href={image.licenseUrl} className={LINK} data-slot="license">
        {licenseInfo[image.license].short}
      </a>
      {image.modifications ? ` · ${image.modifications}` : null}
    </span>
  );
}

/** The network name once it has one (src/wiki/network.ts), else the current production name. */
export function diagramCreditName() {
  return network.label ?? "Marathon Wiki";
}

/** A reference the diagram draws from: its number on the page and the source it points to. */
export type FigureCite = { number: number; href: string; title: string; url: string | null };

/**
 * A Tier B plate: our own diagram drawn from the page's claims, its caption, the citation chips it was
 * drawn from, and a "Chart data" table holding every value with its citation.
 */
export function FigurePlate({
  image,
  title,
  rows,
  columns,
  citeFor,
  children,
}: {
  image: ImageAsset;
  /** "Fig. N. {title}." */
  title: string;
  rows: ResolvedRow[];
  columns: [string, string];
  citeFor: (row: ResolvedRow) => FigureCite;
  /** The diagram; its SVGs point aria-describedby at dataId. */
  children: (dataId: string) => ReactNode;
}) {
  const cites = [...new Map(rows.map((row) => citeFor(row)).map((cite) => [cite.number, cite])).values()].sort((a, b) => a.number - b.number);
  const [left, right] = columns;
  const dataId = `figure-data-${image.id}`;

  return (
    <figure data-slot="figure" data-variant="plate" data-image={image.id} className="figure-plate my-8 max-w-[68ch]">
      <div className="figure-svg border px-4 py-4 text-foreground">{children(dataId)}</div>
      <figcaption className="mt-2 text-small text-muted-foreground">
        <span className="font-medium text-foreground">{title}</span>{" "}
        <span data-slot="sources">
          Source:{" "}
          {cites.map((cite, index) => (
            <span key={cite.number}>
              {index > 0 ? ", " : null}
              {cite.url ? (
                <a href={cite.url} className={LINK}>
                  {cite.title}
                </a>
              ) : (
                cite.title
              )}{" "}
              <a href={cite.href} className={cn(LINK, "tabular-nums")} aria-label={`Reference ${cite.number}`}>
                [{cite.number}]
              </a>
            </span>
          ))}
          .
        </span>{" "}
        <span data-slot="credit">
          Diagram by {diagramCreditName()} ·{" "}
          <a href={image.licenseUrl} className={LINK} data-slot="license">
            {licenseInfo[image.license].short}
          </a>
        </span>
      </figcaption>
      <details className="mt-2 text-small">
        <summary className="inline-flex min-h-6 cursor-pointer items-center text-link pointer-coarse:min-h-11">Chart data</summary>
        <table id={dataId} className="mt-2 w-full border-t text-left">
          <caption className="sr-only">Values in {title.replace(/\.$/, "")}, with the source for each</caption>
          <thead>
            <tr className="border-b">
              <th scope="col" className="label py-1.5 pr-3 font-medium">{left}</th>
              <th scope="col" className="label py-1.5 pr-3 font-medium">{right}</th>
              <th scope="col" className="label py-1.5 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const cite = citeFor(row);
              return (
                <tr key={row.key} className="border-b align-top">
                  <th scope="row" className="py-1.5 pr-3 font-medium text-foreground">{row.label}</th>
                  <td className="py-1.5 pr-3 text-foreground">{row.value}</td>
                  <td className="py-1.5">
                    <a href={cite.href} className={cn(LINK, "tabular-nums")} aria-label={`Source ${cite.number}`}>
                      [{cite.number}]
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Preview-only gap marker; production never renders an empty frame. */
export function FigureGap({ label = "No image · Tier B candidate" }: { label?: string }) {
  return (
    <div data-slot="figure-gap" className="my-8 flex min-h-24 max-w-[68ch] items-center justify-center border border-dashed border-input">
      <span className="label">{label}</span>
    </div>
  );
}

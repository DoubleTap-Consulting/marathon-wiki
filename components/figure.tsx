import Image from "next/image";
import type { ReactNode } from "react";

import { licenseInfo, type ImageAsset } from "@/content/imagery-schema";
import { cn } from "@/lib/utils";
import { network } from "@/src/wiki/network";
import type { ResolvedRow } from "@/src/wiki/figure-data";

export const ILLUSTRATIVE_BADGE = "Illustrative · not from the game";

/** Band boxes per slot: fixed aspect ratios so the page never shifts (SPEC-imagery §I.4). */
const BAND_BOX = {
  "home-band": "h-[120px] sm:h-[180px]",
  "hub-band": "aspect-[4/1] sm:aspect-[6/1] max-h-[120px] sm:max-h-[180px]",
} as const;

const LINK = "text-link underline decoration-1 underline-offset-3 hover:decoration-2";

function Badge({ children }: { children: ReactNode }) {
  return <span className="label mr-2 inline-flex items-center border border-input px-1.5 align-middle">{children}</span>;
}

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

/**
 * A Tier C atmosphere band (home masthead or a Lore/Locations hub), below the h1. The caption row quotes
 * the publisher's own caption and carries the badge and the full credit, always visible and inside the same <figure>.
 */
export function FigureBand({
  image,
  slot,
  className,
  priority = true,
}: {
  image: ImageAsset;
  slot: "home-band" | "hub-band";
  className?: string;
  /** The band is the page's largest paint, so it is fetched first; off for lists such as the credits page. */
  priority?: boolean;
}) {
  const src = image.file ? image.file.slice("public".length) : null;
  if (!src) return null;
  const focal = image.focal ? `${image.focal.x * 100}% ${image.focal.y * 100}%` : "50% 50%";

  return (
    <figure data-slot="figure" data-variant="band" data-image={image.id} className={cn("figure-band", className)}>
      <div className={cn("relative block w-full overflow-hidden bg-muted", BAND_BOX[slot], "border dark:border-0")}>
        <span className="label absolute inset-0 flex items-center justify-center">Image unavailable</span>
        <Image
          src={src}
          alt={image.alt}
          fill
          sizes="(min-width: 1280px) 1216px, 100vw"
          quality={60}
          preload={priority}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          placeholder="empty"
          className="object-cover"
          style={{ objectPosition: focal }}
        />
      </div>
      <figcaption className="mt-2 text-small text-muted-foreground">
        {image.illustrative ? <Badge>{ILLUSTRATIVE_BADGE}</Badge> : null}
        {image.caption ? <a href={image.sourceUrl} className="mr-1 text-foreground underline underline-offset-3"><q>{image.caption}</q></a> : null}
        <CreditLine image={image} />
      </figcaption>
    </figure>
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
        <span className="mr-1 font-medium text-foreground">{title}</span>
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

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { artCreditLine, publicPath, renditionFor, srcSetFor, type ArtImage } from "@/src/wiki/imagery";

/**
 * Art surfaces (SPEC-art-direction): a house-collection painting full-bleed under the header, the UI on top.
 *
 * The scrim is built so text can only ever sit on ink: a fade (transparent → ink 0.85) covers the top of the
 * surface, and everything below it, where the copy lives, is solid ink 0.85. When the copy is taller than the
 * solid part the surface grows instead of letting text ride up into the fade. The renditions are softened
 * from 38% height down (the fade ends at ~45%), and the painting is anchored to its top edge, so the
 * softened part always stays under ink whatever the crop.
 */
export type ArtVariant = "home" | "hub" | "plate";

/** Below 768px every surface uses the tall crop (plates keep the strip); above it home is wide, the rest strip. */
const DESKTOP_CROP = { home: "wide", hub: "strip", plate: "strip" } as const;
const MOBILE_CROP = { home: "tall", hub: "tall", plate: "strip" } as const;
const MOBILE = "(max-width: 767px)";
const DESKTOP = "(min-width: 768px)";

const BOX: Record<ArtVariant, string> = {
  home: "min-h-[44svh] md:min-h-[min(72svh,640px)]",
  hub: "min-h-[clamp(200px,36svh,360px)]",
  plate: "min-h-[112px] md:min-h-[160px]",
};
/** The fade: 45% of the surface's base height (40% on plates, whose ink covers the bottom 60%). */
const FADE: Record<ArtVariant, string> = {
  home: "h-[calc(44svh*0.45)] md:h-[calc(min(72svh,640px)*0.45)]",
  hub: "h-[calc(clamp(200px,36svh,360px)*0.45)]",
  plate: "h-[45px] md:h-[64px]",
};

export const ART_TRANSITION_NAME = "category-art";

export function ArtSurface({
  image,
  variant,
  creditHref,
  children,
  contentClassName,
  transition = false,
}: {
  image: ArtImage;
  variant: ArtVariant;
  /** The work's entry on the credits page. */
  creditHref: string;
  children: ReactNode;
  /** Width and padding of the content column, matching the page below. */
  contentClassName: string;
  /** Hub hero and article plate share a view-transition name so one morphs into the other. */
  transition?: boolean;
}) {
  const { renditions, dominant } = image.art;
  const desktop = DESKTOP_CROP[variant];
  const mobile = MOBILE_CROP[variant];
  const fallback = renditionFor(renditions, desktop, "webp", 1600) ?? renditionFor(renditions, desktop, "webp", 828);
  const focalX = `${Math.round((image.focal?.x ?? 0.5) * 100)}%`;

  return (
    <div
      data-slot="art-surface"
      data-variant={variant}
      data-image={image.id}
      className={cn("art-surface relative isolate flex flex-col overflow-hidden text-paper", BOX[variant])}
      style={{ backgroundColor: dominant, viewTransitionName: transition ? ART_TRANSITION_NAME : undefined }}
    >
      {/* No preload() hint: the <img> is the first thing in <main>, so the parser finds it right after the
          header, and a React preload hint would also fire whenever the router prefetches this route's payload,
          downloading other pages' heroes. Only the home hero asks for high priority: it is the LCP element there.
          Hub bands and article plates stay at auto so the h1 and first text paint without waiting on them, and
          the dominant-color background stands in until they decode. */}
      <picture className="art-painting absolute inset-0 -z-10">
        <source media={MOBILE} type="image/avif" srcSet={srcSetFor(renditions, mobile, "avif")} sizes="100vw" />
        <source media={MOBILE} type="image/webp" srcSet={srcSetFor(renditions, mobile, "webp")} sizes="100vw" />
        <source type="image/avif" srcSet={srcSetFor(renditions, desktop, "avif")} sizes="100vw" />
        <source type="image/webp" srcSet={srcSetFor(renditions, desktop, "webp")} sizes="100vw" />
        {/* eslint-disable-next-line @next/next/no-img-element -- pre-encoded renditions with art-directed sources */}
        <img
          src={fallback ? publicPath(fallback.file) : undefined}
          alt=""
          role="presentation"
          width={fallback?.width}
          height={fallback?.height}
          loading="eager"
          fetchPriority={variant === "home" ? "high" : "auto"}
          decoding="async"
          className="size-full object-cover"
          style={{ objectPosition: `${focalX} 0%` }}
        />
      </picture>
      <div aria-hidden="true" className={cn("art-scrim shrink-0 bg-linear-to-b from-transparent to-ink-scrim", FADE[variant])} />
      <div className="art-scrim flex flex-1 flex-col justify-end bg-ink-scrim">
        <div className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-2", variant === "home" ? "pb-6 md:pb-10" : variant === "hub" ? "pb-5 md:pb-6" : "pb-3 md:pb-4", contentClassName)}>
          <div className="min-w-0">{children}</div>
          <a href={creditHref} data-slot="art-credit" className="ml-auto label-art normal-case tracking-normal underline-offset-3 hover:text-paper hover:underline">
            {artCreditLine(image)}
          </a>
        </div>
      </div>
    </div>
  );
}

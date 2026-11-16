import { cn } from "@/lib/utils";
import type { WikiPageSummary } from "@/src/db/wiki";
import { themeFor } from "@/themes/registry";

import { SiteDate } from "./site-date";

/* Core pieces for the index screens (home, category, All pages, 404): rows instead of cards. */

/** Our own category marks: 24px grid, 1.5px stroke, square caps, miter joins. Always beside the text label. */
const GLYPHS: Record<string, React.ReactNode> = {
  overview: <rect x="5" y="5" width="14" height="14" />,
  gameplay: <path d="M7 4.5v15L19.5 12z" />,
  lore: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M4.5 12h15" />
    </>
  ),
  equipment: <path d="M12 4l7 4v8l-7 4-7-4V8z" />,
  locations: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 4.5v15M4.5 12h15" />
    </>
  ),
};

export function CategoryGlyph({ slug, className }: { slug: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={cn("size-5 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      {GLYPHS[slug] ?? <rect x="9" y="9" width="6" height="6" fill="currentColor" stroke="none" />}
    </svg>
  );
}

// 4×4 Bayer thresholds: level k turns on the cells whose threshold is below k.
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
// Eight density steps (2, 4, … 16 of 16 cells) keep the inline SVG under 4KB.
const STEPS = [2, 4, 6, 8, 10, 12, 14, 16];
const levelPath = (level: number) =>
  BAYER.flatMap((row, y) => row.flatMap((threshold, x) => (threshold < level ? [`M${x} ${y}h1v1h-1z`] : []))).join("");
/** Share of the band's width the ramp takes; the rest is the densest step. */
const RAMP_SHARE = 50;

/** 1-bit ordered-dither band, a density ramp from 0 to 100%. Decorative; hidden for more contrast, forced colors and print. */
export function DitherBand({ themeSlug, region, className }: { themeSlug: string; region: "masthead" | "empty-state" | "not-found"; className?: string }) {
  const texture = themeFor(themeSlug).texture;
  if (!texture || texture.kind !== "dither" || !texture.regions.includes(region)) return null;
  const id = `d-${region}`;
  const segment = RAMP_SHARE / (STEPS.length - 1);
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-texture="dither"
      className={cn("dither-band block h-6 w-full text-foreground opacity-(--dither-light) sm:h-8 dark:text-brand dark:opacity-(--dither-dark)", className)}
      style={{ "--dither-light": texture.opacity.light, "--dither-dark": texture.opacity.dark } as React.CSSProperties}
    >
      <defs>
        {STEPS.map((level, index) => (
          <pattern key={level} id={`${id}${index}`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="scale(2)">
            <path d={levelPath(level)} fill="currentColor" />
          </pattern>
        ))}
      </defs>
      {STEPS.map((level, index) => {
        const last = index === STEPS.length - 1;
        const x = index * segment;
        return <rect key={level} x={`${x}%`} width={`${last ? 100 - x : segment + 0.1}%`} height="100%" fill={`url(#${id}${index})`} />;
      })}
    </svg>
  );
}

/** The four crop marks at the corners of a framed block. */
export function CropMarks() {
  const mark = "pointer-events-none absolute size-[9px] before:absolute before:top-1/2 before:left-0 before:h-px before:w-full before:-translate-y-1/2 before:bg-border after:absolute after:top-0 after:left-1/2 after:h-full after:w-px after:-translate-x-1/2 after:bg-border";
  return (
    <>
      <span aria-hidden="true" className={cn(mark, "top-0 left-0 -translate-x-1/2 -translate-y-1/2")} />
      <span aria-hidden="true" className={cn(mark, "top-0 right-0 translate-x-1/2 -translate-y-1/2")} />
      <span aria-hidden="true" className={cn(mark, "bottom-0 left-0 -translate-x-1/2 translate-y-1/2")} />
      <span aria-hidden="true" className={cn(mark, "right-0 bottom-0 translate-x-1/2 translate-y-1/2")} />
    </>
  );
}

const twoDigits = (value: number) => String(value).padStart(2, "0");
export const revisionCode = (revision: number) => `REV ${twoDigits(revision)}`;

/**
 * Pages as rows: a table with a mono head and an ink rule under it, hairlines between rows, and the title link
 * covering its row. Below 640px each row stacks (title and sources, summary, category and date).
 */
export function IndexTable({
  tenantSlug,
  pages,
  caption,
  showCategory = true,
}: {
  tenantSlug: string;
  pages: WikiPageSummary[];
  caption: string;
  showCategory?: boolean;
}) {
  return (
    <table className="w-full border-collapse text-left">
      <caption className="sr-only">{caption}</caption>
      <thead className="max-sm:sr-only">
        <tr className="border-b border-foreground">
          <th scope="col" className="label py-2 pr-4 font-medium">Title</th>
          <th scope="col" className="label py-2 pr-4 font-medium">Summary</th>
          {showCategory ? <th scope="col" className="label py-2 pr-4 font-medium">Category</th> : null}
          <th scope="col" className="label py-2 pr-4 font-medium">Updated</th>
          <th scope="col" className="label py-2 text-right font-medium">
            <abbr title="Sources" className="no-underline">Src</abbr>
          </th>
        </tr>
      </thead>
      <tbody className="max-sm:border-t max-sm:border-foreground">
        {pages.map((page) => (
          <tr
            key={page.id}
            className="relative grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-b py-3 hover:bg-muted sm:table-row sm:py-0"
          >
            <td className="min-w-0 align-top sm:py-3 sm:pr-4 sm:pl-1">
              <a
                href={`/${tenantSlug}/${page.slug}`}
                className="text-ui font-medium text-foreground after:absolute after:inset-0 after:content-['']"
              >
                {page.title}
              </a>
            </td>
            <td className="col-span-2 row-start-2 max-w-[56ch] align-top text-small text-muted-foreground sm:py-3 sm:pr-4">
              <span className="line-clamp-2">{page.summary ?? "No summary yet."}</span>
            </td>
            {showCategory ? (
              <td className="label row-start-3 align-top sm:py-3.5 sm:pr-4 sm:whitespace-nowrap">
                {page.category?.name ?? "Uncategorized"}
              </td>
            ) : null}
            <td className={cn("label align-top whitespace-nowrap sm:py-3.5 sm:pr-4", showCategory ? "row-start-3 text-right sm:text-left" : "row-start-3")}>
              <span className="sm:sr-only">Updated </span>
              <SiteDate iso={new Date(page.updatedAt).toISOString()} />
            </td>
            <td className="label col-start-2 row-start-1 text-right align-top whitespace-nowrap sm:py-3.5">
              {page.sourceCount}
              <span className="sm:sr-only"> {page.sourceCount === 1 ? "source" : "sources"}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Nothing to list: the dither band, a kicker, a Geist h2, one sentence and at most one action. */
export function EmptyState({
  themeSlug,
  kicker,
  title,
  description,
  action,
  headingLevel = "h2",
}: {
  themeSlug?: string;
  kicker?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
  return (
    <div className="space-y-3 py-6">
      {themeSlug ? <DitherBand themeSlug={themeSlug} region="empty-state" className="max-w-[560px]" /> : null}
      {kicker ? <p className="label">{kicker}</p> : null}
      <Heading className="text-h3 font-semibold text-foreground">{title}</Heading>
      <p className="max-w-[56ch] text-ui text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}

/** The 404 and error composition: dither, a mono label, the title, one sentence, then the actions. Centered, max 560px. */
export function StatusBlock({
  themeSlug,
  label,
  title,
  children,
  actions,
}: {
  themeSlug: string;
  label: string;
  title: string;
  children: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[560px] space-y-4 py-12 sm:py-20">
      <DitherBand themeSlug={themeSlug} region="not-found" />
      <p className="label">{label}</p>
      <h1 className="text-title font-display text-foreground">{title}</h1>
      <div className="text-body text-muted-foreground">{children}</div>
      <div className="flex flex-wrap items-center gap-3 pt-2">{actions}</div>
    </div>
  );
}

export const primaryAction =
  "inline-flex h-9 items-center border border-foreground bg-primary px-4 text-ui font-medium text-primary-foreground hover:bg-primary-hover pointer-coarse:h-11 dark:border-transparent";
export const secondaryAction =
  "inline-flex h-9 items-center border border-input bg-card px-4 text-ui font-medium text-foreground hover:bg-muted pointer-coarse:h-11";
export const textAction = "inline-flex min-h-6 items-center text-ui text-link underline underline-offset-4 pointer-coarse:min-h-11";

/** Marks a page's h1 for the Element Timing API, so e2e can check it paints in the first frame (scripts/e2e/first-paint.ts). */
export const PAGE_TITLE_TIMING = { elementtiming: "page-title" } as Record<string, string>;

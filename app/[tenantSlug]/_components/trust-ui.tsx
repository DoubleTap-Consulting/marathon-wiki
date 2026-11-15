"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { authorityLabel, sourceTypeLabel, type ArticleSource } from "@/src/wiki/article";

function subscribeCoarse(callback: () => void) {
  const query = window.matchMedia("(pointer: coarse)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

/** True on touch-first devices; false during SSR. */
export function useIsTouch() {
  return useSyncExternalStore(
    subscribeCoarse,
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );
}

function formatInReaderZone(iso: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(undefined, options).format(new Date(iso));
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

export function relativeTime(iso: string, now = Date.now()) {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }

  return "just now";
}

/**
 * Server renders an absolute UTC date; after hydration it swaps to relative time
 * in the reader's zone. Both strings share one grid cell so the width never jumps.
 */
export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  const [relative, setRelative] = useState<string | null>(null);
  const [title, setTitle] = useState<string | undefined>(undefined);
  const absolute = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));

  useEffect(() => {
    // Reader's clock and zone are only known in the browser.
    setRelative(relativeTime(iso));
    setTitle(formatInReaderZone(iso, { dateStyle: "full", timeStyle: "short" }));
  }, [iso]);

  return (
    <time dateTime={iso} title={title} className={cn("inline-grid tabular-nums", className)}>
      <span className={cn("col-start-1 row-start-1", relative && "invisible")} aria-hidden={relative ? true : undefined}>
        {absolute}
      </span>
      <span className="col-start-1 row-start-1" aria-hidden={relative ? undefined : true}>
        {relative ?? ""}
      </span>
    </time>
  );
}

export function RetrievedDate({ iso }: { iso: string }) {
  const [label, setLabel] = useState(() =>
    new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(iso)),
  );

  useEffect(() => {
    setLabel(formatInReaderZone(iso, { month: "short", day: "numeric" }));
  }, [iso]);

  return <time dateTime={iso}>{label}</time>;
}

/**
 * Popover on hover/focus for mouse and keyboard; a bottom Sheet on touch.
 * Radix handles Esc and returns focus to the trigger.
 */
function TrustPopover({
  trigger,
  title,
  children,
  label,
}: {
  trigger: (props: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onFocus: () => void;
    onClick: (event: React.SyntheticEvent) => void;
  }) => React.ReactNode;
  title: React.ReactNode;
  children: React.ReactNode;
  label: string;
}) {
  const isTouch = useIsTouch();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedByClick = useRef(false);
  const returningFocus = useRef(false);

  const hoverOpen = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  }, []);
  const hoverClose = useCallback(() => {
    if (openedByClick.current) return;
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }, []);

  if (isTouch) {
    return (
      <>
        {trigger({ onMouseEnter: () => {}, onMouseLeave: () => {}, onFocus: () => {}, onClick: () => setOpen(true) })}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-xl px-5 pb-8">
            <SheetHeader className="px-0">
              <SheetTitle>{title}</SheetTitle>
              <SheetDescription className="sr-only">{label}</SheetDescription>
            </SheetHeader>
            <div className="text-sm leading-6">{children}</div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) openedByClick.current = false;
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        {trigger({
          onMouseEnter: hoverOpen,
          onMouseLeave: hoverClose,
          onFocus: () => {
            if (!returningFocus.current) hoverOpen();
          },
          onClick: (event) => {
            event.preventDefault();
            openedByClick.current = true;
            setOpen(true);
          },
        })}
      </PopoverTrigger>
      <PopoverContent
        className="w-80 text-sm leading-6"
        onOpenAutoFocus={(event) => {
          if (!openedByClick.current) event.preventDefault();
        }}
        onCloseAutoFocus={() => {
          returningFocus.current = true;
          setTimeout(() => {
            returningFocus.current = false;
          });
        }}
        onMouseEnter={hoverOpen}
        onMouseLeave={hoverClose}
        aria-label={label}
      >
        <p className="font-medium text-foreground">{title}</p>
        <div className="mt-1">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

export type CitedSource = ArticleSource & { number: number; claimText: string | null };

export function SourceDetails({ source }: { source: CitedSource }) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground">
        {[source.publisher, sourceTypeLabel(source.sourceType), authorityLabel(source.authorityTier)]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {source.retrievedAt ? (
        <p className="text-muted-foreground">
          Retrieved <RetrievedDate iso={source.retrievedAt} />
        </p>
      ) : null}
      {source.claimText ? (
        <blockquote className="mt-2 border-l-2 pl-3 text-foreground">{source.claimText}</blockquote>
      ) : null}
    </div>
  );
}

export function CitationMarker({ source }: { source: CitedSource }) {
  const heading = (
    <>
      {source.url ? (
        <a href={source.url} target="_blank" rel="noreferrer" className="text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary">
          {source.title}
        </a>
      ) : (
        source.title
      )}
    </>
  );

  return (
    <TrustPopover
      title={heading}
      label={`Source ${source.number}: ${source.title}`}
      trigger={(handlers) => (
        <button
          type="button"
          aria-label={`Source ${source.number}: ${source.title}`}
          className="relative inline-flex min-h-6 min-w-6 items-center justify-center px-0.5 align-super text-xs leading-none font-medium tabular-nums text-primary outline-none after:absolute after:-inset-2.5 after:content-[''] hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
          {...handlers}
        >
          [{source.number}]
        </button>
      )}
    >
      <SourceDetails source={source} />
    </TrustPopover>
  );
}

export function ClaimMark({
  status,
  reason,
  sources,
  children,
}: {
  status: "unsupported" | "contradicted";
  reason: string;
  sources: Array<{ title: string; url: string | null }>;
  children: React.ReactNode;
}) {
  const descriptionId = useId();

  if (status === "unsupported") {
    return (
      <TrustPopover
        title="Not yet confirmed by a source"
        label="Not yet confirmed by a source"
        trigger={(handlers) => (
          <span
            role="button"
            tabIndex={0}
            aria-describedby={descriptionId}
            className="cursor-help underline decoration-claim-unverified decoration-dotted decoration-2 underline-offset-4 outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                handlers.onClick(event);
              }
            }}
            {...handlers}
          >
            {children}
            <span id={descriptionId} className="sr-only">
              (Not yet confirmed by a source)
            </span>
          </span>
        )}
      >
        <p className="text-muted-foreground">{reason}</p>
      </TrustPopover>
    );
  }

  return (
    <span className="box-decoration-clone border-l-2 border-claim-conflict bg-destructive/5 py-0.5 pl-1.5">
      {children}{" "}
      <TrustPopover
        title="Sources disagree"
        label="Sources disagree about this sentence"
        trigger={(handlers) => (
          <button
            type="button"
            aria-describedby={descriptionId}
            className="inline-flex min-h-6 items-center rounded-sm px-1 align-baseline text-xs font-medium uppercase tracking-wide text-foreground underline decoration-claim-conflict underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
            {...handlers}
          >
            Sources disagree
          </button>
        )}
      >
        <p id={descriptionId} className="text-muted-foreground">
          {reason}
        </p>
        {sources.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {sources.map((source) => (
              <li key={source.title}>
                {source.url ? (
                  <a href={source.url} target="_blank" rel="noreferrer" className="text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary">
                    {source.title}
                  </a>
                ) : (
                  source.title
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </TrustPopover>
    </span>
  );
}

export function ProvenanceTrigger({
  label,
  lines,
  footnote,
}: {
  label: string;
  lines: string[];
  footnote: string | null;
}) {
  return (
    <TrustPopover
      title="How this page is written"
      label="How this page is written"
      trigger={(handlers) => (
        <button
          type="button"
          className="text-foreground underline-offset-4 outline-none hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
          {...handlers}
        >
          {label}
        </button>
      )}
    >
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
      {footnote ? <p className="mt-2 text-xs text-muted-foreground">{footnote}</p> : null}
    </TrustPopover>
  );
}

"use client";

import { CircleHelp, Sparkles, TriangleAlert, type LucideIcon } from "lucide-react";
import { useCallback, useId, useRef, useState, useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

import { PopoverPanel, SheetPanel, popoverTriggerProps, usePopoverContentId, usePreloadArticleOverlays } from "./lazy-ui";
import type { Placement } from "./popover-panel";
import { SiteDate } from "./site-date";
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

type TriggerProps = {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocus: () => void;
  onClick: (event: React.SyntheticEvent) => void;
} & Partial<ReturnType<typeof popoverTriggerProps>> & { ref?: (node: HTMLElement | null) => void };

/**
 * Popover on hover/focus for mouse and keyboard; a bottom Sheet on touch.
 * Radix handles Esc and returns focus to the trigger. The Radix code loads lazily (lazy-ui); until then the
 * trigger already carries the attributes Radix's PopoverTrigger gives it.
 */
function TrustPopover({
  trigger,
  title,
  children,
  label,
}: {
  trigger: (props: TriggerProps) => React.ReactNode;
  title: React.ReactNode;
  children: React.ReactNode;
  label: string;
}) {
  const isTouch = useIsTouch();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  if (open && !mounted) setMounted(true);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedByClick = useRef(false);
  const returningFocus = useRef(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const setTrigger = useCallback((node: HTMLElement | null) => {
    triggerRef.current = node;
  }, []);
  const contentId = usePopoverContentId();
  const [placement, setPlacement] = useState<Placement>(null);
  usePreloadArticleOverlays();

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
        {mounted ? (
          <SheetPanel
            open={open}
            onOpenChange={setOpen}
            side="bottom"
            className="max-h-[80vh] overflow-y-auto px-5 pb-8"
            title={title}
            titleClassName=""
            description={label}
          >
            <div className="text-ui">{children}</div>
          </SheetPanel>
        ) : null}
      </>
    );
  }

  return (
    <>
      {trigger({
        ref: setTrigger,
        ...popoverTriggerProps(open, contentId, placement),
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
      {mounted ? (
        <PopoverPanel
          open={open}
          onOpenChange={(next) => {
            if (!next) openedByClick.current = false;
            setOpen(next);
          }}
          triggerRef={triggerRef}
          contentId={contentId}
          onPlacement={setPlacement}
          contentProps={{
            className: "w-80 text-small",
            onOpenAutoFocus: (event) => {
              if (!openedByClick.current) event.preventDefault();
            },
            onCloseAutoFocus: () => {
              returningFocus.current = true;
              setTimeout(() => {
                returningFocus.current = false;
              });
            },
            onMouseEnter: hoverOpen,
            onMouseLeave: hoverClose,
            "aria-label": label,
          }}
        >
          <p className="font-medium text-foreground">{title}</p>
          <div className="mt-1">{children}</div>
        </PopoverPanel>
      ) : null}
    </>
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
          Retrieved <SiteDate iso={source.retrievedAt} />
        </p>
      ) : null}
      {source.claimText ? (
        <blockquote className="mt-2 border-l-2 pl-3 text-foreground">{source.claimText}</blockquote>
      ) : null}
    </div>
  );
}

/** A trust state's icon and words, so no state is told by color alone. */
export function TrustLabel({ icon: Icon, tone, className, id, children }: { icon: LucideIcon; tone?: string; className?: string; id?: string; children: React.ReactNode }) {
  return (
    <span id={id} data-trust-label="" className={cn("inline-flex items-baseline gap-1 whitespace-nowrap", className)}>
      <Icon className={cn("size-[1em] shrink-0 self-center", tone)} aria-hidden="true" />
      {children}
    </span>
  );
}

export function CitationMarker({ source }: { source: CitedSource }) {
  const heading = (
    <>
      {source.url ? (
        <a href={source.url} target="_blank" rel="noreferrer" className="text-link underline decoration-1 underline-offset-3 hover:decoration-2">
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
          className="relative inline-flex min-h-6 min-w-6 items-center justify-center px-0.5 align-super text-label leading-none font-medium tabular-nums text-link after:absolute after:-inset-2.5 after:content-['']"
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
  whole,
  children,
}: {
  status: "unsupported" | "contradicted";
  reason: string;
  sources: Array<{ title: string; url: string | null }>;
  whole?: boolean;
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
            className="cursor-help underline decoration-claim-unverified decoration-dotted decoration-2 underline-offset-4"
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                handlers.onClick(event);
              }
            }}
            {...handlers}
          >
            {children}{" "}
            <TrustLabel id={descriptionId} icon={CircleHelp} tone="text-claim-unverified" className="text-small text-muted-foreground">
              Unconfirmed
            </TrustLabel>
          </span>
        )}
      >
        <p className="text-muted-foreground">{reason}</p>
      </TrustPopover>
    );
  }

  return (
    <span
      className={
        whole
          ? "box-decoration-clone border-l-2 border-claim-conflict bg-destructive/5 py-0.5 pl-1.5"
          : "box-decoration-clone bg-destructive/5 px-0.5 underline decoration-destructive decoration-2 underline-offset-4"
      }
    >
      {children}{" "}
      <TrustPopover
        title="Sources disagree"
        label="Sources disagree about this sentence"
        trigger={(handlers) => (
          <button
            type="button"
            aria-describedby={descriptionId}
            className="inline-flex min-h-6 items-center gap-1 px-1 align-baseline text-small font-medium text-foreground underline decoration-claim-conflict underline-offset-4 pointer-coarse:min-h-11"
            {...handlers}
          >
            <TriangleAlert className="size-[1em] shrink-0 text-claim-conflict" aria-hidden="true" />
            Sources disagree
          </button>
        )}
      >
        <div id={descriptionId} className="space-y-1.5 text-muted-foreground">
          {splitAttributedQuotes(reason).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        {sources.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {sources.map((source) => (
              <li key={source.title}>
                {source.url ? (
                  <a href={source.url} target="_blank" rel="noreferrer" className="text-link underline decoration-1 underline-offset-3 hover:decoration-2">
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
  className,
}: {
  label: string;
  lines: string[];
  footnote: string | null;
  className: string;
}) {
  return (
    <TrustPopover
      title="How this page is written"
      label="How this page is written"
      trigger={(handlers) => (
        <button
          type="button"
          className={className}
          {...handlers}
        >
          <TrustLabel icon={Sparkles}>{label}</TrustLabel>
        </button>
      )}
    >
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
      {footnote ? <p className="mt-2 text-label text-muted-foreground">{footnote}</p> : null}
    </TrustPopover>
  );
}

/** 'A (x) says: "…" B (y) says: "…"' → one line per source, so each position reads on its own. */
export function splitAttributedQuotes(reason: string) {
  const lines = reason.split(/(?<=")\s+(?=[^"]+ says: ")/).map((line) => line.trim()).filter(Boolean);
  return lines.length ? lines : [reason];
}

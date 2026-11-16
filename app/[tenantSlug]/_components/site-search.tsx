"use client";

import type { Route } from "next";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useId, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { hitHref, searchPages, type SearchEntry, type SearchHit } from "@/src/wiki/search";

import { SearchPopover, usePreloadOverlays } from "./lazy-ui";

type IndexState = { status: "idle" | "loading" | "error" } | { status: "ready"; entries: SearchEntry[] };
const indexes = new Map<string, Promise<SearchEntry[]>>();

function useSearchIndex(tenantSlug: string) {
  const [state, setState] = useState<IndexState>({ status: "idle" });
  const load = useCallback(() => {
    if (state.status === "ready" || state.status === "loading") return;
    setState({ status: "loading" });
    let request = indexes.get(tenantSlug);
    if (!request) {
      request = fetch(`/${tenantSlug}/search-index.json`).then((response) => {
        if (!response.ok) throw new Error(`Search index: ${response.status}`);
        return response.json() as Promise<SearchEntry[]>;
      });
      indexes.set(tenantSlug, request);
    }
    request.then(
      (entries) => setState({ status: "ready", entries }),
      () => {
        indexes.delete(tenantSlug);
        setState({ status: "error" });
      },
    );
  }, [state.status, tenantSlug]);
  return [state, load] as const;
}

type RecentPage = Pick<SearchHit, "slug" | "title" | "category">;
const RECENT_LIMIT = 5;
const recentKey = (tenantSlug: string) => `wiki-recent:${tenantSlug}`;

function readRecent(tenantSlug: string): RecentPage[] {
  try {
    const stored = JSON.parse(localStorage.getItem(recentKey(tenantSlug)) ?? "[]");
    return Array.isArray(stored) ? stored.slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

/** Records an article view for the empty-field "recently viewed" list. */
export function RememberVisit({ tenantSlug, page }: { tenantSlug: string; page: RecentPage }) {
  const { slug, title, category } = page;
  useEffect(() => {
    try {
      const recent = [{ slug, title, category }, ...readRecent(tenantSlug).filter((entry) => entry.slug !== slug)];
      localStorage.setItem(recentKey(tenantSlug), JSON.stringify(recent.slice(0, RECENT_LIMIT)));
    } catch {}
  }, [tenantSlug, slug, title, category]);
  return null;
}

/** "/" and Cmd/Ctrl-K, unless the user is typing somewhere else. Only fires while `target` is on screen. */
export function useSearchShortcut(target: React.RefObject<HTMLElement | null>, onShortcut: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isSlash = event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey;
      const isModK = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
      if ((!isSlash && !isModK) || !target.current?.offsetParent) return;
      const typing = event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable=true]");
      if (typing) return;
      event.preventDefault();
      onShortcut();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [target, onShortcut]);
}

type Row = { href: string; hit?: SearchHit | RecentPage; label?: string };

function Marked({ text, range }: { text: string; range: [number, number] | null }) {
  if (!range) return text;
  return (
    <>
      {text.slice(0, range[0])}
      <span className="font-semibold">{text.slice(...range)}</span>
      {text.slice(range[1])}
    </>
  );
}

function RowLabel({ row }: { row: Row }) {
  if (row.label) return row.label;
  const hit = row.hit!;
  const match = "range" in hit ? hit : null;
  if (!match?.heading) return <Marked text={hit.title} range={match?.range ?? null} />;
  return (
    <>
      <span className="text-muted-foreground">
        {hit.title} <span aria-hidden="true">›</span>
        <span className="sr-only">,</span>
      </span>{" "}
      <Marked text={match.heading.text} range={match.range} />
    </>
  );
}

/**
 * Header search: a combobox whose suggestions open in a popover under the field (`mode="popover"`)
 * or fill the mobile search sheet (`mode="inline"`). Enter without a highlighted row opens the full results page.
 */
export function SiteSearch({ tenantSlug, mode, onNavigate }: { tenantSlug: string; mode: "popover" | "inline"; onNavigate?: () => void }) {
  const router = useRouter();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(mode === "inline");
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<RecentPage[]>([]);
  const [index, loadIndex] = useSearchIndex(tenantSlug);

  const focusField = useCallback(() => inputRef.current?.focus(), []);
  useSearchShortcut(inputRef, focusField);

  const trimmed = query.trim();
  const searchHref = `/${tenantSlug}/search?q=${encodeURIComponent(trimmed)}`;
  const hits = trimmed && index.status === "ready" ? searchPages(index.entries, trimmed, 6) : [];
  const noMatch = trimmed !== "" && index.status === "ready" && hits.length === 0;
  const rows: Row[] = trimmed
    ? [
        ...hits.map((hit) => ({ href: hitHref(tenantSlug, hit), hit })),
        ...(noMatch ? [{ href: `/${tenantSlug}/suggest`, label: "Suggest this page" }] : []),
        { href: searchHref, label: `Search all pages for “${trimmed}”` },
      ]
    : recent.map((page) => ({ href: hitHref(tenantSlug, { slug: page.slug, heading: null }), hit: page }));
  const open = expanded && (trimmed !== "" || recent.length > 0);
  // The popover mounts on first open and stays mounted, so later closes keep their exit animation.
  const [popoverMounted, setPopoverMounted] = useState(false);
  if (open && mode === "popover" && !popoverMounted) setPopoverMounted(true);
  usePreloadOverlays();
  const optionId = (row: number) => `${id}-option-${row}`;

  const announcement = !trimmed
    ? recent.length ? `${recent.length} recently viewed ${recent.length === 1 ? "page" : "pages"}` : ""
    : index.status === "ready"
      ? noMatch ? `No pages match ${trimmed}` : `${hits.length} ${hits.length === 1 ? "page" : "pages"} found`
      : index.status === "loading" ? "Loading" : "";

  const go = (href: string) => {
    setQuery("");
    setActive(-1);
    if (mode === "popover") setExpanded(false);
    onNavigate?.();
    router.push(href as Route);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) return setExpanded(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      const next = active + step < -1 ? rows.length - 1 : active + step >= rows.length ? -1 : active + step;
      setActive(next);
      if (next >= 0) document.getElementById(optionId(next))?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && open && active >= 0 && rows[active]) {
      event.preventDefault();
      go(rows[active].href);
    } else if (event.key === "Escape" && mode === "popover") {
      event.preventDefault();
      if (open) setExpanded(false);
      else setQuery("");
      setActive(-1);
    }
  };

  const field = (
    <form
      ref={formRef}
      data-slot={mode === "popover" ? "popover-anchor" : undefined}
      action={`/${tenantSlug}/search`}
      className="relative w-full min-w-0"
      role="search"
      data-wiki-event="search_submit"
      data-wiki-event-label={mode === "popover" ? "site-header" : "search-sheet"}
      data-wiki-tenant={tenantSlug}
      onSubmit={(event) => {
        event.preventDefault();
        go(searchHref);
      }}
    >
      <label htmlFor={`${id}-input`} className="sr-only">
        Search wiki pages
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        ref={inputRef}
        id={`${id}-input`}
        name="q"
        type="text"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        placeholder="Search pages"
        className={cn("px-9", mode === "inline" && "h-11")}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(-1);
          setExpanded(true);
        }}
        onFocus={() => {
          loadIndex();
          setRecent(readRecent(tenantSlug));
          setExpanded(true);
        }}
        onBlur={() => mode === "popover" && setExpanded(false)}
        onKeyDown={onKeyDown}
      />
    </form>
  );

  const results = (
    <div className="py-1">
      {!trimmed && recent.length > 0 ? <p className="px-3 pt-2 pb-1 text-label text-muted-foreground">Recently viewed</p> : null}
      {trimmed && index.status === "loading" ? <p className="px-3 py-2 text-ui text-muted-foreground">Loading…</p> : null}
      {noMatch ? <p className="px-3 py-2 text-ui text-muted-foreground">No pages match “{trimmed}”</p> : null}
      <ul id={`${id}-listbox`} role="listbox" aria-label="Search suggestions">
        {rows.map((row, rowIndex) => (
          <li
            key={row.href}
            id={optionId(rowIndex)}
            role="option"
            aria-selected={rowIndex === active}
            className={cn(
              "flex min-h-9 cursor-pointer items-baseline gap-3 px-3 py-2 text-ui text-foreground aria-selected:bg-muted pointer-coarse:min-h-11",
              mode === "inline" && "min-h-11 items-center",
              !row.hit && rowIndex === rows.length - 1 && "border-t border-border",
            )}
            onMouseMove={() => setActive(rowIndex)}
            onClick={() => go(row.href)}
          >
            <span className="min-w-0 flex-1 truncate">
              <RowLabel row={row} />
            </span>
            {row.hit?.category ? <span className="shrink-0 text-small text-muted-foreground">{row.hit.category}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );

  const liveRegion = (
    <p role="status" aria-live="polite" className="sr-only">
      {announcement}
    </p>
  );

  if (mode === "inline") {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {field}
        {liveRegion}
        <div className="-mx-5 min-h-0 flex-1 overflow-y-auto" onMouseDown={(event) => event.preventDefault()}>
          {open ? results : null}
        </div>
      </div>
    );
  }

  return (
    <>
      {field}
      {liveRegion}
      {popoverMounted ? (
        <Suspense fallback={null}>
          <SearchPopover open={open} onClose={() => setExpanded(false)} anchorRef={formRef} inputRef={inputRef}>
            {results}
          </SearchPopover>
        </Suspense>
      ) : null}
    </>
  );
}

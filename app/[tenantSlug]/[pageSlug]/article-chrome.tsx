"use client";

import type { Route } from "next";
import { ChevronRight, List, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { TocEntry } from "@/src/wiki/article";

import type { CommunityNoteFormState } from "./community-note-actions";
import { CommunityNoteForm } from "./community-note-form";

const META = "text-label font-medium uppercase tracking-wide text-muted-foreground";

function useActiveHeading(ids: string[]) {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);

  useEffect(() => {
    const headings = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    if (headings.length === 0) return;
    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting);
        const firstVisible = ids.find((id) => visible.get(id));
        if (firstVisible) {
          setActive(firstVisible);
          return;
        }
        // Between headings: the last one scrolled past is the current section.
        const passed = headings.filter((heading) => heading.getBoundingClientRect().top < 80);
        if (passed.length) setActive(passed[passed.length - 1].id);
      },
      { rootMargin: "-64px 0px -60% 0px" },
    );
    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [ids]);

  return active;
}

function TocList({ toc, active, onNavigate }: { toc: TocEntry[]; active: string | null; onNavigate?: () => void }) {
  const listRef = useRef<HTMLOListElement>(null);
  const [rule, setRule] = useState<{ top: number; height: number } | null>(null);

  useEffect(() => {
    const item = listRef.current?.querySelector<HTMLElement>(`[data-toc-id="${CSS.escape(active ?? "")}"]`);
    // Measuring layout has to happen after paint.
    setRule(item ? { top: item.offsetTop, height: item.offsetHeight } : null);
  }, [active]);

  return (
    <ol ref={listRef} className="relative border-l text-ui">
      {rule ? (
        <span
          aria-hidden="true"
          className="absolute -left-px w-0.5 bg-ring transition-transform duration-150 ease-out"
          style={{ height: rule.height, transform: `translateY(${rule.top}px)`, top: 0 }}
        />
      ) : null}
      {toc.map((entry) => (
        <li key={entry.id} data-toc-id={entry.id}>
          <a
            href={`#${entry.id}`}
            onClick={onNavigate}
            aria-current={active === entry.id ? "location" : undefined}
            className={cn(
              "flex min-h-8 items-center py-1 leading-5 hover:text-foreground pointer-coarse:min-h-11",
              entry.depth === 3 ? "pl-7" : "pl-4",
              active === entry.id ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {entry.text}
          </a>
        </li>
      ))}
    </ol>
  );
}

export function TocNav({ toc }: { toc: TocEntry[] }) {
  const active = useActiveHeading(toc.map((entry) => entry.id));

  return (
    <nav aria-label="On this page" className="sticky top-20">
      <p className={cn(META, "mb-3")}>On this page</p>
      <TocList toc={toc} active={active} />
    </nav>
  );
}

/** Tablet: a disclosure under the trust strip. Mobile: a sticky chip that opens a sheet. */
export function ContentsControl({ toc }: { toc: TocEntry[] }) {
  const active = useActiveHeading(toc.map((entry) => entry.id));
  const [sheetOpen, setSheetOpen] = useState(false);

  if (toc.length === 0) return null;

  return (
    <>
      <Collapsible className="mt-6 hidden border-y md:block lg:hidden">
        <CollapsibleTrigger className="group flex min-h-11 w-full items-center gap-2 text-ui font-medium">
          <ChevronRight className="size-4 transition-transform duration-200 ease-out group-data-[state=open]:rotate-90" aria-hidden="true" />
          Contents
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <nav aria-label="On this page" className="pb-4">
            <TocList toc={toc} active={active} />
          </nav>
        </CollapsibleContent>
      </Collapsible>

      <div className="sticky top-14 z-20 -mx-5 mt-5 bg-background/95 px-5 py-2 backdrop-blur md:hidden">
        <Button variant="secondary" size="sm" className="min-h-11 gap-2" onClick={() => setSheetOpen(true)}>
          <List className="size-4" aria-hidden="true" />
          Contents
        </Button>
      </div>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[75vh] overflow-y-auto px-5 pb-8">
          <SheetHeader className="px-0">
            <SheetTitle className="label-strong">Contents</SheetTitle>
            <SheetDescription className="sr-only">Jump to a section of this page</SheetDescription>
          </SheetHeader>
          <nav aria-label="On this page">
            <TocList toc={toc} active={active} onNavigate={() => setSheetOpen(false)} />
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}

function subscribeWide(callback: () => void) {
  const query = window.matchMedia("(min-width: 768px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

type NoteAction = (state: CommunityNoteFormState, formData: FormData) => Promise<CommunityNoteFormState>;

const ADD_NOTE_EVENT = "wiki:add-note";

/** Any "Add a note" control opens the single note sheet mounted on the page. */
export function AddNoteButton({ className }: { className?: string }) {
  return (
    <Button
      variant="secondary"
      size="sm"
      className={cn("min-h-11 md:min-h-8", className)}
      onClick={() => window.dispatchEvent(new Event(ADD_NOTE_EVENT))}
    >
      Add a note
    </Button>
  );
}

export function AddNoteSheet({ action }: { action: NoteAction }) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const returnFocus = useRef<HTMLElement | null>(null);
  const wide = useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia("(min-width: 768px)").matches,
    () => true,
  );

  useEffect(() => {
    const show = () => {
      returnFocus.current = document.activeElement as HTMLElement | null;
      setOpen(true);
    };
    window.addEventListener(ADD_NOTE_EVENT, show);
    return () => window.removeEventListener(ADD_NOTE_EVENT, show);
  }, []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side={wide ? "right" : "bottom"}
        className={cn("overflow-y-auto px-5 pb-8", wide ? "w-full sm:max-w-md" : "max-h-[90vh]")}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = returnFocus.current?.isConnected
            ? returnFocus.current
            : document.querySelector<HTMLElement>('[aria-label="More actions"]');
          target?.focus();
        }}
      >
        <SheetHeader className="px-0">
          <SheetTitle className="label-strong">Add a note</SheetTitle>
          <SheetDescription>
            Notes go to an editor first. Approved notes appear next to the text they mention and can shape the next refresh.
          </SheetDescription>
        </SheetHeader>
        <CommunityNoteForm
          key={formKey}
          action={action}
          onSubmitted={() => {
            setOpen(false);
            setFormKey((key) => key + 1);
            toast("Note sent for review");
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

export function TrustOverflow({ suggestHref }: { suggestHref: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="More actions"
          className="relative inline-flex size-6 items-center justify-center align-middle text-muted-foreground after:absolute after:-inset-2.5 after:content-[''] hover:text-foreground"
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        <button
          type="button"
          className="flex min-h-10 w-full items-center px-3 text-left text-ui hover:bg-muted focus-visible:bg-muted"
          onClick={() => window.dispatchEvent(new Event(ADD_NOTE_EVENT))}
        >
          Add a note
        </button>
        <Link
          href={suggestHref as Route}
          className="flex min-h-10 w-full items-center px-3 text-ui hover:bg-muted focus-visible:bg-muted"
          data-wiki-event="suggestion_cta"
          data-wiki-event-label="trust-strip"
        >
          Suggest an edit
        </Link>
      </PopoverContent>
    </Popover>
  );
}

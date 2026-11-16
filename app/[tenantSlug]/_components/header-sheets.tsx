"use client";

import { Menu, Monitor, Moon, Search, Sun } from "lucide-react";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";

import { canReviewAction } from "../review/actions";
import { SiteSearch, useSearchShortcut } from "./site-search";

import { applyScheme } from "@/app/_components/scheme";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const ICON_BUTTON =
  "inline-flex size-11 items-center justify-center text-foreground hover:bg-muted";

const SCHEMES = ["system", "light", "dark"] as const;
type Scheme = (typeof SCHEMES)[number];
const schemeListeners = new Set<() => void>();
const subscribeScheme = (listener: () => void) => {
  schemeListeners.add(listener);
  return () => schemeListeners.delete(listener);
};
const readScheme = () => (document.documentElement.dataset.schemePref ?? "system") as Scheme;

// Cycles system → light → dark. The icon follows data-scheme-pref in CSS, so it is right before hydration.
export function SchemeToggle() {
  const scheme = useSyncExternalStore(subscribeScheme, readScheme, () => "system" as const);
  const next = SCHEMES[(SCHEMES.indexOf(scheme) + 1) % SCHEMES.length];

  const choose = () => {
    document.cookie = next === "system" ? "scheme=; path=/; max-age=0; samesite=lax" : `scheme=${next}; path=/; max-age=31536000; samesite=lax`;
    applyScheme(document.documentElement.dataset.theme ?? "");
    schemeListeners.forEach((listener) => listener());
  };

  return (
    <button type="button" aria-label={`Color scheme: ${scheme}. Switch to ${next}`} className={ICON_BUTTON} onClick={choose}>
      <Monitor className="size-5 [[data-scheme-pref=dark]_&]:hidden [[data-scheme-pref=light]_&]:hidden" aria-hidden="true" />
      <Sun className="hidden size-5 [[data-scheme-pref=light]_&]:block" aria-hidden="true" />
      <Moon className="hidden size-5 [[data-scheme-pref=dark]_&]:block" aria-hidden="true" />
    </button>
  );
}

export function SearchSheet({ tenantSlug }: { tenantSlug: string }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const show = useCallback(() => setOpen(true), []);
  useSearchShortcut(button, show);

  return (
    <>
      <button ref={button} type="button" aria-label="Search" className={`${ICON_BUTTON} md:hidden`} onClick={show}>
        <Search className="size-5" aria-hidden="true" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="top" className="h-dvh gap-2 px-5 pb-0">
          <SheetHeader className="px-0">
            <SheetTitle className="label-strong">Search</SheetTitle>
            <SheetDescription className="sr-only">Search wiki pages</SheetDescription>
          </SheetHeader>
          <SiteSearch tenantSlug={tenantSlug} mode="inline" onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}

export function MenuSheet({
  primary,
  review,
  children,
}: {
  primary: React.ReactNode;
  review: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [canReview, setCanReview] = useState<boolean | null>(null);

  return (
    <>
      <button type="button" aria-label="Menu" className={ICON_BUTTON} onClick={() => {
          setOpen(true);
          if (canReview === null) canReviewAction().then(setCanReview, () => setCanReview(false));
        }}
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto px-5 pb-8 sm:max-w-sm">
          <SheetHeader className="px-0">
            <SheetTitle className="label-strong">Browse the wiki</SheetTitle>
            <SheetDescription className="sr-only">Sections and categories</SheetDescription>
          </SheetHeader>
          <nav
            className="grid gap-1"
            aria-label="Wiki sections"
            onClick={(event) => (event.target as HTMLElement).closest("a") && setOpen(false)}
          >
            {primary}
            {canReview ? review : null}
            {children}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}

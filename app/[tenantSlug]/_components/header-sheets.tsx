"use client";

import { Menu, Monitor, Moon, Search, Sun } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

import { canReviewAction } from "../review/actions";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const ICON_BUTTON =
  "inline-flex size-11 items-center justify-center rounded-md text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring";

const SCHEMES = ["system", "light", "dark"] as const;
type Scheme = (typeof SCHEMES)[number];
const SCHEME_ICON = { system: Monitor, light: Sun, dark: Moon };
const schemeListeners = new Set<() => void>();
const subscribeScheme = (listener: () => void) => {
  schemeListeners.add(listener);
  return () => schemeListeners.delete(listener);
};
const readScheme = (): Scheme => {
  const classes = document.documentElement.classList;
  return classes.contains("dark") ? "dark" : classes.contains("light") ? "light" : "system";
};

// Cycles system → light → dark. The cookie is read by the script in app/layout.tsx on the next load.
export function SchemeToggle() {
  const scheme = useSyncExternalStore(subscribeScheme, readScheme, () => "system" as const);
  const next = SCHEMES[(SCHEMES.indexOf(scheme) + 1) % SCHEMES.length];
  const Icon = SCHEME_ICON[scheme];

  const choose = () => {
    document.documentElement.classList.remove("light", "dark");
    if (next === "system") {
      document.cookie = "scheme=; path=/; max-age=0; samesite=lax";
    } else {
      document.documentElement.classList.add(next);
      document.cookie = `scheme=${next}; path=/; max-age=31536000; samesite=lax`;
    }
    schemeListeners.forEach((listener) => listener());
  };

  return (
    <button type="button" aria-label={`Color scheme: ${scheme}. Switch to ${next}`} className={ICON_BUTTON} onClick={choose}>
      <Icon className="size-5" aria-hidden="true" />
    </button>
  );
}

export function SearchSheet({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" aria-label="Search" className={`${ICON_BUTTON} md:hidden`} onClick={() => setOpen(true)}>
        <Search className="size-5" aria-hidden="true" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="top" className="px-5 pb-6">
          <SheetHeader className="px-0">
            <SheetTitle>Search</SheetTitle>
            <SheetDescription className="sr-only">Search wiki pages</SheetDescription>
          </SheetHeader>
          {children}
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
            <SheetTitle>Browse the wiki</SheetTitle>
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

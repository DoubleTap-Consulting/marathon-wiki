"use client";

import { Menu, Search } from "lucide-react";
import { useState } from "react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const ICON_BUTTON =
  "inline-flex size-11 items-center justify-center rounded-md text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring";

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

export function MenuSheet({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" aria-label="Menu" className={ICON_BUTTON} onClick={() => setOpen(true)}>
        <Menu className="size-5" aria-hidden="true" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto px-5 pb-8 sm:max-w-sm">
          <SheetHeader className="px-0">
            <SheetTitle>Browse the wiki</SheetTitle>
            <SheetDescription className="sr-only">Sections and categories</SheetDescription>
          </SheetHeader>
          <div onClick={(event) => (event.target as HTMLElement).closest("a") && setOpen(false)}>{children}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}

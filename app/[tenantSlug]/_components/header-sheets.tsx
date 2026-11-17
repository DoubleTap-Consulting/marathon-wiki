"use client";

import { Menu, Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { Suspense, useCallback, useRef, useState } from "react";

import {
  wikiSidebarAccountItems,
  type WikiNavAuth,
  type WikiSidebarItem,
} from "@/src/auth/wiki-nav";

import { getWikiNavAuthAction } from "./nav-auth";
import { SheetPanel } from "./lazy-ui";
import { SiteSearch, useSearchShortcut } from "./site-search";

import { SchemeToggle } from "@/app/_components/scheme-toggle";

export { SchemeToggle };

const ICON_BUTTON =
  "inline-flex size-11 items-center justify-center text-foreground hover:bg-muted";

const SECTION_LABEL =
  "mt-4 mb-1 px-3 text-label font-medium uppercase tracking-wide text-muted-foreground";

export function SearchSheet({ tenantSlug }: { tenantSlug: string }) {
  const [open, setOpen] = useState(false);
  // The sheet mounts on first open and stays mounted, so later closes keep their exit animation.
  const [mounted, setMounted] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const show = useCallback(() => {
    setMounted(true);
    setOpen(true);
  }, []);
  useSearchShortcut(button, show);

  return (
    <>
      <button ref={button} type="button" aria-label="Search" className={`${ICON_BUTTON} md:hidden`} onClick={show}>
        <Search className="size-5" aria-hidden="true" />
      </button>
      {mounted ? (
        <Suspense fallback={null}>
          <SheetPanel open={open} onOpenChange={setOpen} side="top" className="h-dvh gap-2 px-5 pb-0" title="Search" description="Search wiki pages">
            <SiteSearch tenantSlug={tenantSlug} mode="inline" onNavigate={() => setOpen(false)} />
          </SheetPanel>
        </Suspense>
      ) : null}
    </>
  );
}

export function MenuSheet({
  tenantSlug,
  primary,
  children,
}: {
  tenantSlug: string;
  primary: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? `/${tenantSlug}`;
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [auth, setAuth] = useState<WikiNavAuth | null>(null);

  const loadAuth = () => {
    if (auth !== null) {
      return;
    }
    getWikiNavAuthAction().then(setAuth, () => setAuth({ status: "signed_out" }));
  };

  const closeIfLink = (event: React.MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("a")) {
      setOpen(false);
    }
  };

  return (
    <>
      <button type="button" aria-label="Menu" className={ICON_BUTTON} onClick={() => {
          setMounted(true);
          setOpen(true);
          loadAuth();
        }}
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>
      {mounted ? (
        <Suspense fallback={null}>
          <SheetPanel open={open} onOpenChange={setOpen} side="right" className="w-full overflow-y-auto px-5 pb-8 sm:max-w-sm" title="Browse the wiki" description="Sections and categories">
            <nav
              className="grid gap-1"
              aria-label="Wiki sections"
              onClick={closeIfLink}
            >
              {primary}
              {children}
            </nav>
            <AccountGroup
              items={wikiSidebarAccountItems({
                tenantSlug,
                currentPath: pathname,
                auth,
              })}
              loading={auth === null}
              onClick={closeIfLink}
            />
          </SheetPanel>
        </Suspense>
      ) : null}
    </>
  );
}

function AccountGroup({
  items,
  loading,
  onClick,
}: {
  items: WikiSidebarItem[];
  loading: boolean;
  onClick: (event: React.MouseEvent<HTMLElement>) => void;
}) {
  return (
    <nav
      className="mt-auto min-w-0 border-t"
      aria-label="Account"
      aria-busy={loading}
      onClick={onClick}
    >
      <p className={SECTION_LABEL}>Account</p>
      {loading ? (
        <div className="min-h-11" aria-hidden="true" />
      ) : (
        <div className="grid min-w-0 gap-1">
          {items.map((item) => {
            if (item.kind === "identity") {
              return (
                <div
                  key="identity"
                  className="flex min-h-11 items-center gap-3 px-3 text-foreground"
                >
                  <span
                    className="flex size-8 shrink-0 items-center justify-center bg-foreground text-small font-medium text-background"
                    aria-hidden="true"
                  >
                    {item.initials}
                  </span>
                  <span className="truncate text-ui font-medium">{item.displayName}</span>
                </div>
              );
            }

            if (item.kind === "hint") {
              return (
                <p
                  key="hint"
                  className="min-w-0 max-w-[19rem] px-3 pb-2 text-small leading-5 break-words text-muted-foreground"
                >
                  {item.text}
                </p>
              );
            }

            return (
              <a
                key={item.href}
                href={item.href}
                className="flex min-h-11 items-center px-3 text-ui font-medium text-foreground hover:bg-muted"
              >
                {item.label}
              </a>
            );
          })}
        </div>
      )}
    </nav>
  );
}

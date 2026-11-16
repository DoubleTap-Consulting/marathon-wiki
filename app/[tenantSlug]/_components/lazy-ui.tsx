"use client";

import { lazy, useEffect, useState, type ComponentType } from "react";

// The header's sheets and the search popover are Radix Dialog/Popover. Closed, they render nothing, so
// their code is not needed for first paint: it loads when the browser is idle after hydration (or on
// first open, whichever comes first) instead of shipping in every page's initial bundle.
function preloadable<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<unknown> | null = null;
  const preload = () => (pending ??= load().then((module) => (loaded = module.default)));
  const Lazy = lazy(() => load());
  function Preloaded(props: P) {
    // Picked once per mount: the module once preloaded (no Suspense round trip), else the lazy wrapper.
    const [Component] = useState<ComponentType<P>>(() => loaded ?? Lazy);
    return <Component {...props} />;
  }
  return [Preloaded, preload] as const;
}

export const [SheetPanel, preloadSheetPanel] = preloadable(() => import("./sheet-panel"));
export const [SearchPopover, preloadSearchPopover] = preloadable(() => import("./search-popover"));

export function usePreloadOverlays() {
  useEffect(() => {
    const preload = () => {
      void preloadSheetPanel();
      void preloadSearchPopover();
    };
    if ("requestIdleCallback" in window) {
      const handle = window.requestIdleCallback(preload, { timeout: 3000 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = setTimeout(preload, 1500);
    return () => clearTimeout(handle);
  }, []);
}

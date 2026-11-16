"use client";

import { lazy, useEffect } from "react";

// The header's sheet and the search popover are Radix Dialog/Popover. Closed, they render nothing, so
// their code is not needed for first paint: it loads when the browser is idle after hydration (or on
// first open, whichever comes first) instead of shipping in every page's initial bundle.
const loadSheetPanel = () => import("./sheet-panel");
const loadSearchPopover = () => import("./search-popover");

export const SheetPanel = lazy(loadSheetPanel);
export const SearchPopover = lazy(loadSearchPopover);

export function usePreloadOverlays() {
  useEffect(() => {
    const preload = () => {
      void loadSheetPanel();
      void loadSearchPopover();
    };
    if ("requestIdleCallback" in window) {
      const handle = window.requestIdleCallback(preload, { timeout: 3000 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = setTimeout(preload, 1500);
    return () => clearTimeout(handle);
  }, []);
}

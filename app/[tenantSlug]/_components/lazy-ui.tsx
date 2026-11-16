"use client";

import { lazy, useEffect, useId, useState, type ComponentType } from "react";

import type { Placement } from "./popover-panel";

// Radix Dialog/Popover overlays and the sonner toast region render nothing until opened, so their code is
// not needed for first paint. Each loads when the browser is idle after hydration (or on first open,
// whichever comes first) instead of shipping in the page's initial bundle.
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
export const [PopoverPanel, preloadPopoverPanel] = preloadable(() => import("./popover-panel"));
const [PageToaster, preloadToaster] = preloadable(() => import("./toaster"));

function onIdle(callback: () => void) {
  if ("requestIdleCallback" in window) {
    const handle = window.requestIdleCallback(callback, { timeout: 3000 });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = setTimeout(callback, 1500);
  return () => clearTimeout(handle);
}

export function usePreloadOverlays() {
  useEffect(() => onIdle(() => {
    void preloadSheetPanel();
    void preloadSearchPopover();
  }), []);
}

export function usePreloadArticleOverlays() {
  useEffect(() => onIdle(() => {
    void preloadSheetPanel();
    void preloadPopoverPanel();
  }), []);
}

/**
 * What Radix's `<PopoverTrigger asChild>` puts on its child, for a trigger rendered outside the (lazy) Popover.
 * `contentId` comes from `usePopoverContentId` and is passed to PopoverPanel as the content's id; `placement`
 * is what PopoverPanel reports through `onPlacement`.
 */
export function popoverTriggerProps(open: boolean, contentId: string, placement: Placement) {
  return {
    type: "button",
    "aria-haspopup": "dialog",
    "aria-expanded": open,
    "aria-controls": open ? contentId : undefined,
    "data-state": open ? "open" : "closed",
    "data-radix-popper-side": placement?.side,
    "data-radix-popper-align": placement?.align,
    "data-slot": "popover-trigger",
  } as const;
}

/** Radix's id format for popover content (`radix-` + React id). */
export function usePopoverContentId() {
  return `radix-${useId()}`;
}

// The toast region mounts when idle, or as soon as a toast is shown; sonner replays active toasts to a
// region that subscribes late, so an early toast is not lost.
const toasterListeners = new Set<() => void>();
let toasterWanted = false;
function wantToaster() {
  toasterWanted = true;
  toasterListeners.forEach((listener) => listener());
}

export function LazyToaster(props: React.ComponentProps<typeof PageToaster>) {
  const [mounted, setMounted] = useState(toasterWanted);
  useEffect(() => {
    const mount = () => void preloadToaster().then(() => setMounted(true));
    toasterListeners.add(mount);
    const cancel = onIdle(wantToaster);
    if (toasterWanted) mount();
    return () => {
      toasterListeners.delete(mount);
      cancel();
    };
  }, []);
  return mounted ? <PageToaster {...props} /> : null;
}

export async function showToast(message: string) {
  wantToaster();
  const { toast } = await import("sonner");
  toast(message);
}

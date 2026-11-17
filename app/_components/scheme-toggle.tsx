"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

import { applyScheme } from "@/app/_components/scheme";

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

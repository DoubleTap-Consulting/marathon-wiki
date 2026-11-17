"use client";

import { useLayoutEffect } from "react";

import { applyScheme } from "./scheme";

/**
 * Next's error/404 shell renders <html> on the client, where the inlined head script never runs.
 * This applies the same function after that render, before paint.
 */
export function SchemeSync({ theme }: { theme?: string }) {
  useLayoutEffect(() => applyScheme(theme), [theme]);
  return null;
}

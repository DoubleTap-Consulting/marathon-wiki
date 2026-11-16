"use client";

import { useEffect, useState } from "react";

/** The address the reader asked for, filled in after hydration (the 404 is rendered once, without the URL). */
export function CurrentPath() {
  const [path, setPath] = useState<string | null>(null);
  useEffect(() => setPath(window.location.pathname), []);
  return path ? <code className="font-mono text-[0.95em] text-foreground">{path}</code> : <>this address</>;
}

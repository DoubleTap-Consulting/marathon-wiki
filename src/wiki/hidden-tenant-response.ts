import { NextResponse } from "next/server";

/**
 * Hidden-tenant responses must be returned directly from the proxy.
 * Rewriting to /_not-found looks like a 404 in `next start` (the Node
 * server assigns 404 to that internal path) but on Vercel the rewrite
 * matches the prerendered /_not-found page and is served as HTTP 200
 * (x-matched-path: /_not-found, x-nextjs-prerender: 1).
 */
export const HIDDEN_TENANT_ROBOTS_TAG = "noindex";

/**
 * Self-contained on purpose: the proxy answers before the app, so the page can't lean on the site's CSS, fonts
 * or JS. One inline <style>, the system font stack, paper and ink from the Marathon tokens (hex first for old browsers), and a way back in.
 */
export const HIDDEN_TENANT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Page not found</title>
<style>
:root{color-scheme:light;--paper:#f9f9f6;--paper:oklch(0.985 0.004 115);--ink:#151612;--ink:oklch(0.18 0.005 115);--muted:#575950;--muted:oklch(0.47 0.006 115);--rule:#d7f20d;--rule:oklch(0.921 0.233 125.5)}
*{box-sizing:border-box}
html,body{margin:0;background:var(--paper);color:var(--ink)}
body{min-height:100vh;font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
main{max-width:40rem;margin:0 auto;padding:4rem 1.25rem}
.wordmark{margin:0 0 3rem;color:var(--ink);padding-bottom:.75rem;border-bottom:3px solid var(--rule);font-weight:800;letter-spacing:.02em;text-transform:uppercase}
h1{margin:0 0 .75rem;font-size:2rem;line-height:1.15}
p{margin:0 0 1.5rem;color:var(--muted)}
a{color:var(--ink);text-decoration:underline;text-underline-offset:3px;font-weight:600}
a:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
</style>
</head>
<body>
<main>
<p class="wordmark">WikiDen</p>
<h1>Page not found</h1>
<p>This page is not available.</p>
<a href="/marathon">Browse the Marathon guide</a>
</main>
</body>
</html>
`;

export function isJsonPath(pathname: string) {
  return pathname.split("?")[0].toLowerCase().endsWith(".json");
}

export function hiddenTenantResponse(pathname: string) {
  const headers = { "X-Robots-Tag": HIDDEN_TENANT_ROBOTS_TAG };

  if (isJsonPath(pathname)) {
    return NextResponse.json({ error: "Not Found" }, { status: 404, headers });
  }

  return new NextResponse(HIDDEN_TENANT_HTML, {
    status: 404,
    headers: {
      ...headers,
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

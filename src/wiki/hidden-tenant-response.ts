import { NextResponse } from "next/server";

/**
 * Hidden-tenant responses must be returned directly from the proxy.
 * Rewriting to /_not-found looks like a 404 in `next start` (the Node
 * server assigns 404 to that internal path) but on Vercel the rewrite
 * matches the prerendered /_not-found page and is served as HTTP 200
 * (x-matched-path: /_not-found, x-nextjs-prerender: 1).
 */
export const HIDDEN_TENANT_ROBOTS_TAG = "noindex";

const HIDDEN_TENANT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Page not found</title>
</head>
<body>
<h1>Page not found</h1>
<p>This page is not available.</p>
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

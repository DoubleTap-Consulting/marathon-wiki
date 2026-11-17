import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import type { NextFetchEvent } from "next/server";

import { isClerkConfigured } from "@/src/auth/wiki-auth";
import { hiddenTenantResponse } from "@/src/wiki/hidden-tenant-response";
import {
  getTenantSlugFromHost,
  isGta6Path,
  isPublicFilePath,
  isTenantPubliclyEnabled,
} from "@/src/wiki/tenant-routing";

export function applyTenantRouting(request: NextRequest) {
  const tenantSlug = getTenantSlugFromHost(request.headers.get("host"));
  const pathname = request.nextUrl.pathname;
  const hostPrefixed =
    Boolean(tenantSlug) &&
    !isPublicFilePath(pathname) &&
    pathname.split("/").filter(Boolean)[0] !== tenantSlug;
  const effectivePath = hostPrefixed ? `/${tenantSlug}${pathname}` : pathname;

  if (isGta6Path(effectivePath) && !isTenantPubliclyEnabled("gta6")) {
    return hiddenTenantResponse(effectivePath);
  }

  if (!tenantSlug || isPublicFilePath(pathname)) {
    return NextResponse.next();
  }

  const nextUrl = request.nextUrl.clone();
  const segments = nextUrl.pathname.split("/").filter(Boolean);

  if (segments[0] === tenantSlug) {
    return NextResponse.next();
  }

  nextUrl.pathname = `/${tenantSlug}${nextUrl.pathname}`;

  return NextResponse.rewrite(nextUrl);
}

const clerkProxy = clerkMiddleware((_auth, request) => {
  return applyTenantRouting(request);
});

export function proxy(request: NextRequest, event: NextFetchEvent) {
  if (isClerkConfigured()) {
    return clerkProxy(request, event);
  }

  return applyTenantRouting(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};

import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import type { NextFetchEvent } from "next/server";

import { isClerkConfigured } from "@/src/auth/wiki-auth";
import {
  getTenantSlugFromHost,
  isPublicFilePath,
} from "@/src/wiki/tenant-routing";

function applyTenantRouting(request: NextRequest) {
  const tenantSlug = getTenantSlugFromHost(request.headers.get("host"));

  if (!tenantSlug || isPublicFilePath(request.nextUrl.pathname)) {
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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt).*)"],
};

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

/** Default Vercel production alias. Only this exact host is redirected; preview aliases stay put. */
export const LEGACY_PRODUCTION_ALIAS_HOST = "marathon-wiki.vercel.app";
export const CANONICAL_SITE_ORIGIN = "https://wikiden.gg";

/**
 * Permanent 308 from marathon-wiki.vercel.app to wikiden.gg, keeping the path and query.
 * A domain-level redirect could not be set on the already-attached .vercel.app alias,
 * so this is the host-based equivalent.
 */
export function redirectLegacyProductionAlias(request: NextRequest): NextResponse | null {
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase();
  if (host !== LEGACY_PRODUCTION_ALIAS_HOST) {
    return null;
  }

  // Vercel Cron treats a 3xx as final and does not follow it. Scheduled jobs hit this
  // production alias, so /api/cron/* must stay on the alias host.
  const pathname = request.nextUrl.pathname;
  if (pathname === "/api/cron" || pathname.startsWith("/api/cron/")) {
    return null;
  }

  const destination = new URL(`${pathname}${request.nextUrl.search}`, CANONICAL_SITE_ORIGIN);
  return NextResponse.redirect(destination, 308);
}

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
  // Redirect before Clerk so the alias never starts a sign-in cookie on the old host.
  const aliasRedirect = redirectLegacyProductionAlias(request);
  if (aliasRedirect) {
    return aliasRedirect;
  }

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

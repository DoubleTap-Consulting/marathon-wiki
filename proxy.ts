import { NextResponse, type NextRequest } from "next/server";

import {
  getTenantSlugFromHost,
  isPublicFilePath,
} from "@/src/wiki/tenant-routing";

export function proxy(request: NextRequest) {
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

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt).*)"],
};


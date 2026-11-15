import type { Route } from "next";
import Link from "next/link";

import { getCachedWikiHome } from "@/src/wiki/cache";
import { getDefaultTenantSlug } from "@/src/wiki/tenant-routing";

import { WikiChrome } from "./_components/wiki-chrome";

export default async function TenantNotFound() {
  const tenantSlug = getDefaultTenantSlug();
  const home = await getCachedWikiHome(tenantSlug).catch(() => null);

  const body = (
    <div className="mx-auto max-w-2xl py-12">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-3 text-muted-foreground">
        This wiki page may not exist yet, may be unpublished, or may belong to a different wiki.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={`/${tenantSlug}` as Route}
          className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Go to wiki home
        </Link>
        <Link
          href={`/${tenantSlug}/suggest` as Route}
          className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Suggest this page
        </Link>
      </div>
    </div>
  );

  if (!home) {
    return <main className="min-h-screen bg-background px-5">{body}</main>;
  }

  return (
    <WikiChrome tenant={home.tenant} categories={home.categories}>
      {body}
    </WikiChrome>
  );
}

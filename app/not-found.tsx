import type { Metadata } from "next";

import { NotFoundBody } from "@/app/[tenantSlug]/_components/not-found-body";
import { SiteFooter, WikiChrome } from "@/app/[tenantSlug]/_components/wiki-chrome";
import { getCachedWikiHome } from "@/src/wiki/cache";
import { getDefaultTenantSlug } from "@/src/wiki/tenant-routing";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default async function NotFound() {
  const tenantSlug = getDefaultTenantSlug();
  const home = await getCachedWikiHome(tenantSlug).catch(() => null);

  if (home) {
    return (
      <WikiChrome tenant={home.tenant} categories={home.categories}>
        <NotFoundBody tenantSlug={home.tenant.slug} />
      </WikiChrome>
    );
  }

  return (
    <>
      <main className="min-h-screen bg-background px-5">
        <NotFoundBody tenantSlug={tenantSlug} />
      </main>
      <SiteFooter tenant={{ slug: tenantSlug, gameTitle: "Marathon" }} categories={[]} />
    </>
  );
}

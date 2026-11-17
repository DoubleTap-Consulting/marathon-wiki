import type { Metadata } from "next";

import { getCachedWikiHome } from "@/src/wiki/cache";
import { getDefaultTenantSlug } from "@/src/wiki/tenant-routing";

import { NotFoundBody } from "./_components/not-found-body";
import { SiteFooter, WikiChrome } from "./_components/wiki-chrome";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default async function TenantNotFound() {
  const tenantSlug = getDefaultTenantSlug();
  const home = await getCachedWikiHome(tenantSlug).catch(() => null);

  if (!home) {
    return (
      <>
        <main className="min-h-screen bg-background px-5">
          <NotFoundBody tenantSlug={tenantSlug} />
        </main>
        <SiteFooter tenant={{ slug: tenantSlug, gameTitle: "Marathon" }} categories={[]} />
      </>
    );
  }

  return (
    <WikiChrome tenant={home.tenant} categories={home.categories}>
      <NotFoundBody tenantSlug={home.tenant.slug} />
    </WikiChrome>
  );
}

import { notFound } from "next/navigation";

import { getCachedWikiPage, getCachedWikiPageRevisions } from "@/src/wiki/cache";
import { normalizeTenantSlug } from "@/src/wiki/tenant-routing";

export async function loadHistory(params: Promise<{ tenantSlug: string; pageSlug: string }>) {
  const { tenantSlug, pageSlug } = await params;
  const snapshot = await getCachedWikiPage(normalizeTenantSlug(tenantSlug), normalizeTenantSlug(pageSlug));

  if (!snapshot) notFound();

  const revisions = await getCachedWikiPageRevisions(
    snapshot.tenant.slug,
    snapshot.page.slug,
    snapshot.tenant.id,
    snapshot.page.id,
  );

  return { snapshot, revisions, base: `/${snapshot.tenant.slug}/${snapshot.page.slug}` };
}

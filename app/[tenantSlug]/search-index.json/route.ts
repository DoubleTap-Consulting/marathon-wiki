import { getCachedWikiHome, getCachedWikiSearchIndex } from "@/src/wiki/cache";
import { normalizeTenantSlug } from "@/src/wiki/tenant-routing";

export const revalidate = 300;
export const dynamic = "force-static";

export async function GET(_request: Request, { params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const snapshot = await getCachedWikiHome(normalizeTenantSlug(tenantSlug));
  if (!snapshot) return Response.json({ error: "Wiki not found" }, { status: 404 });
  return Response.json(await getCachedWikiSearchIndex(snapshot.tenant.slug, snapshot.tenant.id));
}

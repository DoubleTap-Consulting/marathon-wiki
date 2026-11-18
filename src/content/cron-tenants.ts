import gta6PageSpecs from "@/content/gta6/pages.json";
import gta6SourceRegistry from "@/content/gta6/sources.json";

import { CONTENT_SOURCES, CONTENT_SPECS, CONTENT_TENANT_SLUG } from "@/src/content/editor-store";
import type { PageSpec, SourceRecord } from "@/src/content/pipeline";
import { GTA6_TENANT_SLUG, isTenantPubliclyEnabled, normalizeTenantSlug } from "@/src/wiki/tenant-routing";

/** Marathon first, then GTA 6, then any other enabled tenant by slug. */
export const CRON_TENANT_PRIORITY = [CONTENT_TENANT_SLUG, GTA6_TENANT_SLUG] as const;

export type CronTenant = { id: string; slug: string };

export type CronContentPack = CronTenant & {
  sources: SourceRecord[];
  specs: PageSpec[];
};

export function cronTenantRank(slug: string) {
  const normalized = normalizeTenantSlug(slug);
  const index = (CRON_TENANT_PRIORITY as readonly string[]).indexOf(normalized);
  return index === -1 ? CRON_TENANT_PRIORITY.length : index;
}

export function sortCronTenants<T extends { slug: string }>(tenants: T[]) {
  return [...tenants].sort((left, right) => {
    const rank = cronTenantRank(left.slug) - cronTenantRank(right.slug);
    return rank !== 0 ? rank : normalizeTenantSlug(left.slug).localeCompare(normalizeTenantSlug(right.slug));
  });
}

export function contentPackForTenant(slug: string): { sources: SourceRecord[]; specs: PageSpec[] } | null {
  const normalized = normalizeTenantSlug(slug);
  if (normalized === CONTENT_TENANT_SLUG) {
    return { sources: CONTENT_SOURCES, specs: CONTENT_SPECS };
  }
  if (normalized === GTA6_TENANT_SLUG) {
    return { sources: gta6SourceRegistry as SourceRecord[], specs: gta6PageSpecs as PageSpec[] };
  }
  return null;
}

/** Enabled tenants that have a content pack, already in cron order. */
export function cronContentPacksFor(
  tenants: CronTenant[],
  env: Record<string, string | undefined> = process.env,
): CronContentPack[] {
  const packs: CronContentPack[] = [];
  for (const tenant of sortCronTenants(tenants)) {
    if (!isTenantPubliclyEnabled(tenant.slug, env)) continue;
    const pack = contentPackForTenant(tenant.slug);
    if (!pack) continue;
    packs.push({ id: tenant.id, slug: normalizeTenantSlug(tenant.slug), sources: pack.sources, specs: pack.specs });
  }
  return packs;
}

export function cronContentPlan(
  tenants: CronTenant[],
  env: Record<string, string | undefined> = process.env,
) {
  return cronContentPacksFor(tenants, env).map((tenant) => ({
    slug: tenant.slug,
    sourceCount: tenant.sources.length,
    pageSpecCount: tenant.specs.length,
    bungieNewsFeed: tenant.slug === CONTENT_TENANT_SLUG,
  }));
}

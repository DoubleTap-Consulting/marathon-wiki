import type { ReactNode } from "react";

import { articleArtFor, publicPath, renditionFor } from "@/src/wiki/imagery";
import { normalizeTenantSlug } from "@/src/wiki/tenant-routing";

/**
 * GTA 6 article LCP is the plate image. Under mobile Lighthouse the request was
 * starting late (Load Delay often 1s+) because the <picture> lives in the
 * streamed page chunk after wiki data. This layout does not wait on the DB:
 * it reads the committed page list and hoists a mobile AVIF preload into the
 * early shell. Marathon (and every other tenant) returns children unchanged.
 */
export default async function PageSlugLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ tenantSlug: string; pageSlug: string }>;
}) {
  const { tenantSlug, pageSlug } = await params;
  const slug = normalizeTenantSlug(tenantSlug);
  if (slug !== "gta6") return children;

  const pages = (await import("@/content/gta6/pages.json")).default as Array<{ slug: string; category?: string }>;
  const entry = pages.find((page) => page.slug === pageSlug);
  const image = articleArtFor("gta6", pageSlug, entry?.category ?? null);
  if (!image) return children;

  const fallback = renditionFor(image.art.renditions, "strip", "avif", 828);
  if (!fallback) return children;

  // A single href + fetchpriority=high. A srcset preload (828/1600/2400) was
  // discovered as priority Low in Lighthouse, which left Load Delay unchanged.
  return (
    <>
      <link
        rel="preload"
        as="image"
        type="image/avif"
        href={publicPath(fallback.file)}
        fetchPriority="high"
        media="(max-width: 767px)"
      />
      {children}
    </>
  );
}

import { articleArtFor, homeBandFor, publicPath, renditionFor } from "@/src/wiki/imagery";

/**
 * GTA 6 LCP is the hero/plate <img>. A single 828 AVIF href + fetchpriority=high,
 * hoisted into the early document so the request does not wait on wiki data.
 * Do not preload a srcset of 828/1600/2400: Lighthouse marked that as priority Low.
 * Keep this out of ArtSurface so client route prefetch does not download other pages' heroes.
 */
export function Gta6LcpPreload({
  surface,
  pageSlug,
  category,
}: {
  surface: "home" | "plate";
  pageSlug?: string;
  category?: string | null;
}) {
  const image =
    surface === "home" ? homeBandFor("gta6") : articleArtFor("gta6", pageSlug ?? "", category ?? null);
  if (!image) return null;
  const crop = surface === "home" ? "tall" : "strip";
  const fallback = renditionFor(image.art.renditions, crop, "avif", 828);
  if (!fallback) return null;

  return (
    <link
      rel="preload"
      as="image"
      type="image/avif"
      href={publicPath(fallback.file)}
      fetchPriority="high"
      media="(max-width: 767px)"
    />
  );
}

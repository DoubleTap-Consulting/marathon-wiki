import marathonImages from "@/content/marathon/images.json";
import { imageRegistry, type ImageAsset, type ImageSlot } from "@/content/imagery-schema";
import { themeFor } from "@/themes/registry";

const registries: Record<string, ImageAsset[]> = {
  marathon: imageRegistry.parse(marathonImages).images,
};

/** Every registered image for a game, in registry order. */
export function imagesFor(themeSlug: string): ImageAsset[] {
  return registries[themeSlug] ?? [];
}

export function imageById(themeSlug: string, id: string | null | undefined): ImageAsset | null {
  if (!id) return null;
  return imagesFor(themeSlug).find((image) => image.id === id) ?? null;
}

export function homeBandFor(themeSlug: string) {
  return imageById(themeSlug, themeFor(themeSlug).imagery?.homeBand);
}

export function hubBandFor(themeSlug: string, categorySlug: string) {
  return imageById(themeSlug, themeFor(themeSlug).imagery?.hubBands[categorySlug]);
}

/** Tier B figures placed on an article, in registry order. */
export function figuresForPage(themeSlug: string, pageSlug: string, slot: Extract<ImageSlot, "plate" | "inline">) {
  return imagesFor(themeSlug).filter((image) => image.usedOn.some((use) => use.page === pageSlug && use.slot === slot));
}

/** The public URL for a registry file ("public/img/x.jpg" → "/img/x.jpg"). */
export function publicSrc(image: ImageAsset) {
  return image.file ? image.file.slice("public".length) : null;
}

/** Preview and local builds show the gaps that production hides. */
export function showsImageGaps(env: Record<string, string | undefined> = process.env) {
  return env.VERCEL_ENV !== "production";
}

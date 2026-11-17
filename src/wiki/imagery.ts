import gta6Images from "@/content/gta6/images.json";
import marathonImages from "@/content/marathon/images.json";
import { imageRegistry, type ArtRendition, type ImageAsset, type ImageSlot } from "@/content/imagery-schema";
import { themeFor } from "@/themes/registry";

const registries: Record<string, ImageAsset[]> = {
  marathon: imageRegistry.parse(marathonImages).images,
  gta6: imageRegistry.parse(gta6Images).images,
};

/** Every registered image for a game, in registry order. */
export function imagesFor(themeSlug: string): ImageAsset[] {
  return registries[themeSlug] ?? [];
}

export function imageById(themeSlug: string, id: string | null | undefined): ImageAsset | null {
  if (!id) return null;
  return imagesFor(themeSlug).find((image) => image.id === id) ?? null;
}

/** A house-collection painting: an image with its art record, which the license gate has already checked. */
export type ArtImage = ImageAsset & { art: NonNullable<ImageAsset["art"]> };

const asArt = (image: ImageAsset | null): ArtImage | null => (image?.art ? (image as ArtImage) : null);

export function homeBandFor(themeSlug: string) {
  return asArt(imageById(themeSlug, themeFor(themeSlug).imagery?.homeBand));
}

export function hubBandFor(themeSlug: string, categorySlug: string) {
  return asArt(imageById(themeSlug, themeFor(themeSlug).imagery?.hubBands[categorySlug]));
}

/**
 * An article's plate: its own house-collection override (usedOn slot "article-art", which the gate only
 * allows for Tier C paintings), else its category's painting.
 */
export function articleArtFor(themeSlug: string, pageSlug: string, categorySlug: string | null | undefined) {
  const override = imagesFor(themeSlug).find((image) => image.usedOn.some((use) => use.page === pageSlug && use.slot === "article-art"));
  return asArt(override ?? null) ?? (categorySlug ? hubBandFor(themeSlug, categorySlug) : null);
}

/** Tier B figures placed on an article, in registry order. */
export function figuresForPage(themeSlug: string, pageSlug: string, slot: Extract<ImageSlot, "plate" | "inline">) {
  return imagesFor(themeSlug).filter((image) => image.usedOn.some((use) => use.page === pageSlug && use.slot === slot));
}

/** The public URL for a registry file ("public/img/x.jpg" → "/img/x.jpg"). */
export function publicPath(file: string) {
  return file.slice("public".length);
}

export function publicSrc(image: ImageAsset) {
  return image.file ? publicPath(image.file) : null;
}

/** "url 828w, url 1600w" for one crop and format. */
export function srcSetFor(renditions: ArtRendition[], crop: ArtRendition["crop"], format: ArtRendition["format"]) {
  return renditions
    .filter((r) => r.crop === crop && r.format === format)
    .sort((a, b) => a.width - b.width)
    .map((r) => `${publicPath(r.file)} ${r.width}w`)
    .join(", ");
}

export function renditionFor(renditions: ArtRendition[], crop: ArtRendition["crop"], format: ArtRendition["format"], width: number) {
  return renditions.find((r) => r.crop === crop && r.format === format && r.width === width) ?? null;
}

/** The one-line on-art credit: "Don Davis · NASA Ames, 1975". */
export function artCreditLine(image: ArtImage) {
  return `${image.author} · ${image.art.institution}, ${image.art.year}`;
}

/** Preview and local builds show the gaps that production hides. */
export function showsImageGaps(env: Record<string, string | undefined> = process.env) {
  return env.VERCEL_ENV !== "production";
}

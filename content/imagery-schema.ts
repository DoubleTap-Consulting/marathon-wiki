import { z } from "zod";

/** Licenses the registry understands. Anything else (NC, ND, GFDL, GPL, "unknown") fails to parse. */
export const imageLicense = z.enum([
  "CC0-1.0",
  "PD-US-GOV", // US federal government work, e.g. NASA Ames artwork
  "PD-US-EXPIRED", // published in the US before 1931, so its copyright has expired (e.g. Trouvelot's 1881 plates)
  "CC-BY-4.0",
  "CC-BY-SA-3.0",
  "CC-BY-SA-4.0",
  "Unsplash", // platform licenses: snapshot + Loupe sign-off required
  "Pexels",
  "Own", // Tier B, made by us
  "Bungie-written-permission", // Tier A, needs permissionRef
  "Fair-use", // Tier A only; fails unless manifest imagery.fairUse.approvedRef is set
]);

/**
 * "home-band" and "hub-band" are the full-bleed home and category heroes; "article-art" is an article's
 * front-matter override of its category's plate. "plate" and "inline" hold our own Tier B diagrams.
 */
export const imageSlot = z.enum(["home-band", "hub-band", "article-art", "plate", "inline"]);

/** How a house-collection painting is cut for each surface. Below 768px every surface uses "tall". */
export const artCrop = z.enum(["wide", "tall", "strip", "full"]);

export const artRendition = z.strictObject({
  crop: artCrop,
  width: z.number().int(),
  height: z.number().int(),
  format: z.enum(["avif", "webp"]),
  file: z.templateLiteral(["public/img/", z.string()]),
  bytes: z.number().int().positive(),
  sha256: z.string().length(64),
});

/**
 * The house collection (SPEC-art-direction): public-domain paintings only. Every rendered painting carries
 * this record; the license gate fails the build without it.
 */
export const artRecord = z.strictObject({
  family: z.enum(["nasa-ames-colonies", "trouvelot-1881", "homer-tropics"]),
  /** Paintings and prints only: a photograph reads as a document, so the collection never holds one. */
  medium: z.enum(["painting", "chromolithograph"]),
  rightsStatus: z.enum(["PD", "CC0"]),
  /** Why it is public domain, in one line, from the source record. */
  rightsBasis: z.string().min(1),
  /** Short name for the on-art credit: "Don Davis · NASA Ames, 1975". */
  institution: z.string().min(1),
  year: z.string().regex(/^\d{4}$/),
  /** Background color while the painting loads (no blur-up). */
  dominant: z.string().regex(/^#[0-9a-f]{6}$/),
  renditions: z.array(artRendition).min(1),
});

export const imageAsset = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  tier: z.enum(["A", "B", "C", "D"]),
  /** Path under public/img/; null for Tier B (rendered SVG) and for house-collection paintings (see art.renditions). */
  file: z.templateLiteral(["public/img/", z.string()]).nullable(),
  /** Tier B: the generator and the page claims it draws. */
  generator: z.object({ kind: z.string(), page: z.string(), claimIds: z.array(z.string()).min(1) }).optional(),
  width: z.number().int(),
  height: z.number().int(),
  sha256: z.string().length(64).optional(),
  /** The page that states the license and credit. */
  sourceUrl: z.url(),
  /** The exact file we downloaded. */
  fileUrl: z.url().optional(),
  license: imageLicense,
  licenseUrl: z.url(),
  /** Path to a saved copy of the license page at retrieval. */
  licenseSnapshot: z.string().optional(),
  author: z.string().min(1),
  /** Verbatim from the source, unaltered. */
  credit: z.string().min(1),
  /** Exactly what the caption renders. */
  attributionText: z.string().min(1),
  modifications: z.string().nullable(),
  retrievedAt: z.iso.date(),
  depicts: z.enum(["game-data", "real-world", "atmosphere", "game-content", "fan-work"]),
  art: artRecord.optional(),
  title: z.string().min(1),
  caption: z.string(),
  alt: z.string().max(125),
  /**
   * Who wrote the caption and alt; never the AI editor. "source-quotation": quoted from the publisher's
   * own caption on sourceUrl. "generated": a Tier B caption and alt built from the diagram's data
   * (src/wiki/figure-data.ts), so the registry holds none.
   */
  captionAuthor: z.enum(["human", "source-quotation", "generated"]),
  captionSourceUrl: z.url().optional(),
  focal: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
  permissionRef: z.string().optional(),
  approvedBy: z.string().min(1),
  approvedAt: z.iso.date().nullable(),
  usedOn: z.array(z.object({ page: z.string(), slot: imageSlot })).min(1),
});

export const imageRegistry = z.strictObject({ version: z.literal(1), images: z.array(imageAsset) });

export type ImageAsset = z.infer<typeof imageAsset>;
export type ImageSlot = z.infer<typeof imageSlot>;
export type ArtRecord = z.infer<typeof artRecord>;
export type ArtRendition = z.infer<typeof artRendition>;
export type ImageRegistry = z.infer<typeof imageRegistry>;

export const licenseInfo: Record<ImageAsset["license"], { short: string }> = {
  "CC0-1.0": { short: "CC0 1.0" },
  "PD-US-GOV": { short: "Public domain (US Gov.)" },
  "PD-US-EXPIRED": { short: "Public domain (US)" },
  "CC-BY-4.0": { short: "CC BY 4.0" },
  "CC-BY-SA-3.0": { short: "CC BY-SA 3.0" },
  "CC-BY-SA-4.0": { short: "CC BY-SA 4.0" },
  Unsplash: { short: "Unsplash License" },
  Pexels: { short: "Pexels License" },
  Own: { short: "Own work" },
  "Bungie-written-permission": { short: "© Bungie, used with permission" },
  "Fair-use": { short: "© Bungie" },
};

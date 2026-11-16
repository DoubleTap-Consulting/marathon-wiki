import { z } from "zod";

/** Licenses the registry understands. Anything else (NC, ND, GFDL, GPL, "unknown") fails to parse. */
export const imageLicense = z.enum([
  "CC0-1.0",
  "PD-US-GOV", // NASA and JPL ("Courtesy NASA/JPL-Caltech" unless the caption names a credit)
  "CC-BY-4.0",
  "CC-BY-SA-3.0",
  "CC-BY-SA-4.0",
  "Unsplash", // platform licenses: snapshot + Loupe sign-off required
  "Pexels",
  "Own", // Tier B, made by us
  "Bungie-written-permission", // Tier A, needs permissionRef
  "Fair-use", // Tier A only; fails unless manifest imagery.fairUse.approvedRef is set
]);

export const imageSlot = z.enum(["home-band", "hub-band", "plate", "inline"]);

export const imageAsset = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  tier: z.enum(["A", "B", "C", "D"]),
  /** Path under public/img/; null for Tier B (rendered SVG). */
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
  illustrative: z.boolean(),
  title: z.string().min(1),
  caption: z.string(),
  alt: z.string().max(125),
  /**
   * Captions and alt are written by a person, never by the AI editor. "pending-human" marks a plain
   * factual placeholder (source and license only) that a person still has to write; the gate warns on it.
   */
  captionAuthor: z.enum(["human", "pending-human"]),
  focal: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
  permissionRef: z.string().optional(),
  approvedBy: z.string().min(1),
  approvedAt: z.iso.date().nullable(),
  usedOn: z.array(z.object({ page: z.string(), slot: imageSlot })).min(1),
});

export const imageRegistry = z.strictObject({ version: z.literal(1), images: z.array(imageAsset) });

export type ImageAsset = z.infer<typeof imageAsset>;
export type ImageSlot = z.infer<typeof imageSlot>;
export type ImageRegistry = z.infer<typeof imageRegistry>;

export const licenseInfo: Record<ImageAsset["license"], { short: string }> = {
  "CC0-1.0": { short: "CC0 1.0" },
  "PD-US-GOV": { short: "Public domain (US Gov.)" },
  "CC-BY-4.0": { short: "CC BY 4.0" },
  "CC-BY-SA-3.0": { short: "CC BY-SA 3.0" },
  "CC-BY-SA-4.0": { short: "CC BY-SA 4.0" },
  Unsplash: { short: "Unsplash License" },
  Pexels: { short: "Pexels License" },
  Own: { short: "Own work" },
  "Bungie-written-permission": { short: "© Bungie, used with permission" },
  "Fair-use": { short: "© Bungie" },
};

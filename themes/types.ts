import { z } from "zod";

const hue = z.number().min(0).lt(360);
const oklch = z.object({ l: z.number().min(0).max(1), c: z.number().min(0).max(0.4), h: hue });
const svgPath = z.templateLiteral(["themes/", z.string(), ".svg"]);

const displayFont = z.object({
  family: z.string().min(1),
  source: z.enum(["google", "local"]),
  license: z.enum(["OFL", "Apache-2.0", "commercial"]),
  licenseRef: z.string().min(1),
  weights: z.array(z.number().int().min(100).max(900)).min(1),
  axes: z.object({ wdth: z.number().optional(), opsz: z.number().optional() }).optional(),
  capHeight: z.number().gt(0).lt(1),
  case: z.enum(["upper", "as-written"]),
  tracking: z.number().min(-0.02).max(0.06),
});

export const themeManifest = z.strictObject({
  version: z.literal(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  identity: z.object({
    siteName: z.string().min(1),
    developer: z.string().min(1),
    wordmark: z.object({ src: svgPath, label: z.string().min(1), minWidth: z.number().positive() }),
    /** The game in plain words, set under the network wordmark: never a logo. */
    descriptor: z.string().min(1).max(60),
    tagline: z.string().min(40).max(140).optional(),
    kicker: z.string().min(1).max(40).optional(),
  }),
  /** "ink" keeps the header and footer on the dark scheme in both modes; "surface" lets them follow the page. */
  chrome: z.enum(["ink", "surface"]),
  color: z.object({
    neutral: z.object({ h: hue, c: z.number().min(0).max(0.03) }),
    accent: oklch,
    brand: oklch.optional(),
    accentFill: z.literal("seed"),
  }),
  type: z.object({
    display: displayFont,
    sectionIndex: z.enum(["none", "decimal-leading-zero", "upper-roman"]),
  }),
  shape: z.object({ corners: z.enum(["square", "soft"]) }),
  texture: z
    .object({
      kind: z.enum(["dither", "staff-lines", "grain", "lattice"]),
      regions: z.array(z.enum(["masthead", "header-rule", "empty-state", "not-found"])).min(1),
      opacity: z.object({ light: z.number().min(0).max(0.12), dark: z.number().min(0).max(0.18) }),
    })
    .optional(),
  motion: z.object({ character: z.enum(["crisp", "silk"]) }),
  glyphs: z.record(z.string(), svgPath).optional(),
});

export type Oklch = z.infer<typeof oklch>;
export type ThemeManifest = z.infer<typeof themeManifest>;

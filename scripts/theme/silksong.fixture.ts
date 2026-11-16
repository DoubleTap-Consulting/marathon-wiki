import type { ThemeManifest } from "../../themes/types.ts";

// SPEC-design-system §5 and SPEC-visual-identity §2, until PR 8 adds themes/silksong. No tagline:
// the spec leaves it as "own line", and copy isn't invented here.
export default {
  version: 1,
  slug: "hollow-knight-silksong",
  identity: {
    siteName: "Silksong Wiki",
    developer: "Team Cherry",
    wordmark: { src: "themes/silksong/wordmark.svg", label: "Silksong Wiki", minWidth: 120 },
    descriptor: "An unofficial guide to Hollow Knight: Silksong",
    kicker: "Field notes · Pharloom",
  },
  chrome: "surface",
  color: {
    neutral: { h: 85, c: 0.018 },
    accent: { l: 0.42, c: 0.17, h: 265 },
    brand: { l: 0.5, c: 0.19, h: 25 },
    accentFill: "seed",
  },
  type: {
    display: {
      family: "Cormorant Garamond",
      source: "google",
      license: "OFL",
      licenseRef: "https://fonts.google.com/specimen/Cormorant+Garamond",
      weights: [600],
      capHeight: 0.625,
      case: "upper",
      tracking: 0,
    },
    sectionIndex: "upper-roman",
  },
  shape: { corners: "soft" },
  texture: { kind: "staff-lines", regions: ["masthead", "empty-state"], opacity: { light: 0.1, dark: 0.14 } },
  motion: { character: "silk" },
} satisfies ThemeManifest;

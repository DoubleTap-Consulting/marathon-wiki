import type { ThemeManifest } from "../types.ts";

export default {
  version: 1,
  slug: "gta6",
  identity: {
    siteName: "WikiDen",
    developer: "Rockstar Games",
    wordmark: { src: "themes/gta6/wordmark.svg", label: "WikiDen", minWidth: 120 },
    descriptor: "An unofficial guide to Grand Theft Auto VI",
    tagline: "Source-checked pages on the release, platforms, characters and setting, updated by AI when a source changes.",
    kicker: "Field notes · Leonida",
  },
  chrome: "ink",
  color: {
    neutral: { h: 220, c: 0.012 },
    accent: { l: 0.92, c: 0.16, h: 210 },
    accentFill: "seed",
  },
  type: {
    display: {
      family: "Archivo",
      source: "google",
      license: "OFL",
      licenseRef: "https://fonts.google.com/specimen/Archivo",
      weights: [700, 800],
      axes: { wdth: 125 },
      capHeight: 0.688,
      case: "upper",
      tracking: -0.01,
    },
    sectionIndex: "decimal-leading-zero",
  },
  shape: { corners: "soft" },
  texture: { kind: "grain", regions: ["masthead", "empty-state", "not-found"], opacity: { light: 0.1, dark: 0.16 } },
  motion: { character: "silk" },
  imagery: {
    tiers: ["B", "C"],
    homeBand: null,
    hubBands: {},
    atmosphere: "color",
  },
} satisfies ThemeManifest;

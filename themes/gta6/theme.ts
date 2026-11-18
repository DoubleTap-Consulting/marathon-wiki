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
    neutral: { h: 280, c: 0.018 },
    accent: { l: 0.84, c: 0.2, h: 355 },
    accent2: { l: 0.85, c: 0.13, h: 195 },
    onAccent: { l: 0.182, c: 0.046, h: 271.6 },
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
  texture: { kind: "grain", regions: ["masthead", "empty-state", "not-found"], opacity: { light: 0.08, dark: 0.14 } },
  motion: { character: "silk" },
  imagery: {
    tiers: ["B", "C"],
    homeBand: "highsmith-st-moritz-royal-palm",
    hubBands: {
      overview: "highsmith-miami-skyline",
      gameplay: "highsmith-everglades-sawgrass",
      locations: "highsmith-beach-patrol",
      lore: "highsmith-lauderdale-sunset",
    },
    atmosphere: "color",
  },
} satisfies ThemeManifest;

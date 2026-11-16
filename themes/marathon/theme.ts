import type { ThemeManifest } from "../types.ts";

export default {
  version: 1,
  slug: "marathon",
  identity: {
    siteName: "Marathon Wiki",
    developer: "Bungie",
    wordmark: { src: "themes/marathon/wordmark.svg", label: "Marathon Wiki", minWidth: 132 },
    descriptor: "An unofficial guide to Marathon",
    tagline: "Source-checked pages on shells, weapons, zones and factions, rewritten by AI when a source changes.",
    kicker: "Field reference · Tau Ceti IV",
  },
  chrome: "ink",
  color: {
    neutral: { h: 115, c: 0.01 },
    accent: { l: 0.921, c: 0.233, h: 125.5 },
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
  shape: { corners: "square" },
  texture: { kind: "dither", regions: ["masthead", "empty-state", "not-found"], opacity: { light: 0.12, dark: 0.18 } },
  motion: { character: "crisp" },
} satisfies ThemeManifest;

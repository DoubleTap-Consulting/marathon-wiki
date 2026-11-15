import type { ThemeManifest } from "../types.ts";

export default {
  version: 1,
  slug: "marathon",
  identity: {
    siteName: "Marathon Wiki",
    developer: "Bungie",
    wordmark: { src: "themes/marathon/wordmark.svg", label: "Marathon Wiki", minWidth: 132 },
  },
  color: {
    neutral: { h: 250, c: 0.02 },
    accent: { l: 0.44, c: 0.13, h: 160 },
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
  },
  shape: { corners: "square" },
  motion: { character: "crisp" },
} satisfies ThemeManifest;

import gta6 from "./gta6/theme.ts";
import marathon from "./marathon/theme.ts";
import type { ThemeManifest } from "./types.ts";

const themes: Record<string, ThemeManifest> = { marathon, gta6 };

/** The manifest for a tenant; every tenant uses Marathon's until it has its own. */
export function themeFor(slug: string): ThemeManifest {
  return themes[slug] ?? marathon;
}

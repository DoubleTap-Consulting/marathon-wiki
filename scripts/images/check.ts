// Image license gate: runs in prebuild and vercel-build after the theme checks. Any error fails the build.
// See SPEC-imagery §I.5. Prints ids and fields only, never file contents.
import { existsSync, readFileSync } from "node:fs";

import { figureSpecs } from "../../src/wiki/figure-data.ts";
import { themeManifest } from "../../themes/types.ts";
import { checkImages, type GatePage } from "./rules.ts";

const root = new URL("../../", import.meta.url);
const read = (path: string) => {
  const url = new URL(path, root);
  return existsSync(url) ? new Uint8Array(readFileSync(url)) : null;
};
const json = (path: string) => JSON.parse(readFileSync(new URL(path, root), "utf8"));

let failed = 0;
for (const slug of ["marathon", "gta6"]) {
  const manifest = themeManifest.parse((await import(new URL(`themes/${slug}/theme.ts`, root).href)).default);
  const registry = json(`content/${slug}/images.json`);
  const specs: Array<{ slug: string; category: string }> = json(`content/${slug}/pages.json`);
  const generated: Array<{ slug: string; aiProvenance?: { claimSupport?: GatePage["claims"] } }> = existsSync(
    new URL(`content/${slug}/generated/pages.json`, root),
  )
    ? json(`content/${slug}/generated/pages.json`)
    : [];
  const pages = specs.map((spec) => ({
    slug: spec.slug,
    category: spec.category,
    claims: generated.find((page) => page.slug === spec.slug)?.aiProvenance?.claimSupport ?? [],
  }));

  if (registry?.version !== 1 || !Array.isArray(registry.images)) {
    console.error(`images: FAIL content/${slug}/images.json must be { version: 1, images: [...] }`);
    failed++;
    continue;
  }
  const { errors, warnings, images } = checkImages({ slug, manifest, entries: registry.images, pages, specs: figureSpecs, readFile: read });
  for (const warning of warnings) console.log(`images: WARN ${warning}`);
  for (const error of errors) console.error(`images: FAIL ${error}`);
  if (errors.length > 0) failed++;
  else console.log(`images: PASS ${slug}: ${images.length} images (${images.map((image) => `${image.id} ${image.license}`).join(", ")})`);
}

if (failed > 0) {
  console.error("images: the license gate failed. Failing the build.");
  process.exit(1);
}

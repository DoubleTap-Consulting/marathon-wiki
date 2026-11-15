import { readdir, readFile, writeFile } from "node:fs/promises";

import { checkTheme, parseCoreTokens, renderCss } from "../../themes/tokens.ts";
import { themeManifest } from "../../themes/types.ts";

const root = new URL("../../", import.meta.url);
const core = parseCoreTokens(await readFile(new URL("app/globals.css", root), "utf8"));
const slugs = (await readdir(new URL("themes/", root), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

let failed = 0;
for (const slug of slugs) {
  const module = await import(new URL(`themes/${slug}/theme.ts`, root).href);
  const parsed = themeManifest.safeParse(module.default);
  if (!parsed.success) {
    failed++;
    console.error(`theme: FAIL themes/${slug}/theme.ts is not a valid manifest\n${parsed.error.message}`);
    continue;
  }
  const { errors, lines } = checkTheme(parsed.data, core);
  for (const line of lines) console.log(`theme: ${line}`);
  if (errors.length > 0) {
    failed++;
    continue;
  }
  await writeFile(new URL(`app/themes/generated/${slug}.css`, root), renderCss(parsed.data));
}

if (failed > 0) {
  console.error(`theme: ${failed} theme(s) failed the checks above. Failing the build.`);
  process.exit(1);
}

// Lets local scripts import app modules under Node's built-in type stripping. It resolves the
// tsconfig "@/" alias and extensionless relative imports to .ts files, and loads .json files as
// default exports. Use with: node --import ./scripts/content/register-ts-paths.mjs <script.ts>
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = new URL("../../", import.meta.url);

function candidates(url) {
  const file = fileURLToPath(url);
  return [file, `${file}.ts`, `${file}.tsx`, `${file}/index.ts`];
}

export async function resolve(specifier, context, next) {
  let base = null;
  if (specifier.startsWith("@/")) base = new URL(specifier.slice(2), root);
  else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    base = new URL(specifier, context.parentURL);
  }
  if (base) {
    const file = candidates(base).find((candidate) => statSync(candidate, { throwIfNoEntry: false })?.isFile());
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.endsWith(".json") && url.startsWith("file:")) {
    return { format: "module", source: `export default ${readFileSync(fileURLToPath(url), "utf8")};`, shortCircuit: true };
  }
  return next(url, context);
}

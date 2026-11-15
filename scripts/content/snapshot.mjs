// Renders every source in content/marathon/sources.json in headless Chrome and saves the
// readable text OUTSIDE the repo (default ../marathon-wiki-content/snapshots), because the
// repo is public and only cited extracts may be committed.
//
// Usage: PLAYWRIGHT_DIR=/path/with/node_modules node scripts/content/snapshot.mjs [sourceKey...]
// Never runs on Vercel. Makes no AI calls.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root = new URL("../../", import.meta.url).pathname;
const snapshotDir = path.resolve(process.env.CONTENT_SNAPSHOT_DIR ?? path.join(root, "../marathon-wiki-content/snapshots"));
const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR ?? root, "package.json"));
const { chromium } = require("playwright");

const sources = JSON.parse(readFileSync(path.join(root, "content/marathon/sources.json"), "utf8"));
const only = new Set(process.argv.slice(2));
mkdirSync(snapshotDir, { recursive: true });
const indexPath = path.join(snapshotDir, "index.json");
const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : {};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome" });
const context = await browser.newContext({
  userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  viewport: { width: 1280, height: 2000 },
});

for (const source of sources) {
  if (only.size && !only.has(source.sourceKey)) continue;
  const page = await context.newPage();
  const fetchedAt = new Date().toISOString();
  try {
    const response = await page.goto(source.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    // Ad-heavy press sites never go network-idle; wait a bounded time instead.
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1_500);
    const text = await page.evaluate(() => {
      for (const selector of ["script", "style", "noscript", "nav", "footer", "aside", "[role=navigation]"]) {
        document.querySelectorAll(selector).forEach((node) => node.remove());
      }
      const h1 = document.querySelector("h1");
      let element = h1;
      while (element && element.parentElement && element.innerText.length < 1500) element = element.parentElement;
      return (element ?? document.querySelector("article") ?? document.querySelector("main") ?? document.body).innerText;
    });
    const clean = text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    const status = response?.status() ?? 0;
    const ok = status < 400 && clean.length > 800;
    writeFileSync(path.join(snapshotDir, `${source.sourceKey}.txt`), clean);
    index[source.sourceKey] = {
      url: source.url,
      fetchedAt,
      httpStatus: status,
      ok,
      chars: clean.length,
      sha256: createHash("sha256").update(clean).digest("hex"),
    };
    console.log(`${ok ? "ok  " : "FAIL"} ${status} ${String(clean.length).padStart(6)} ${source.sourceKey}`);
  } catch (error) {
    index[source.sourceKey] = { url: source.url, fetchedAt, httpStatus: 0, ok: false, chars: 0, sha256: null, error: String(error).slice(0, 200) };
    console.log(`FAIL error ${source.sourceKey}: ${String(error).slice(0, 120)}`);
  } finally {
    await page.close();
  }
}

await browser.close();
writeFileSync(indexPath, JSON.stringify(index, null, 2));

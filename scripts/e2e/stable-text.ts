import { chromium, type Browser } from "playwright-core";

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const articlePath = process.env.E2E_ARTICLE_PATH ?? "/marathon/ranked";
const shareQuery = process.env.E2E_SHARE_QUERY ?? "";

// The page's dates and its trust strip, as first painted (no JavaScript) and after hydration.
async function read(browser: Browser, hydrate: boolean) {
  const context = await browser.newContext({ javaScriptEnabled: hydrate });
  const page = await context.newPage();
  if (shareQuery) await page.goto(`${baseUrl}${articlePath}${shareQuery}`);
  await page.goto(`${baseUrl}${articlePath}`, { waitUntil: "networkidle" });
  if (hydrate) await page.waitForFunction(() => document.querySelector("[aria-label^='Color scheme:']")?.hasAttribute("aria-label"));
  const text = await page.evaluate(() => ({
    times: [...document.querySelectorAll("main time")].map((el) => `${el.textContent} | ${el.getAttribute("datetime")} | ${el.getAttribute("title")}`),
    strip: document.querySelector('[data-slot="trust-strip"]')?.textContent ?? "",
  }));
  await context.close();
  return text;
}

const browser = await chromium.launch({ channel: "chrome" });
const [first, hydrated] = [await read(browser, false), await read(browser, true)];
await browser.close();

console.log(`first paint: ${first.times.length} dates, strip "${first.strip}"`);
for (const line of first.times) console.log(`  ${line}`);
const same = JSON.stringify(first) === JSON.stringify(hydrated);
if (first.times.length === 0 || !same) {
  console.error(`stable-text: FAIL ${first.times.length === 0 ? "no dates found" : `after hydration: ${JSON.stringify(hydrated)}`}`);
  process.exit(1);
}
console.log("stable-text: PASS first paint and hydrated text are identical");

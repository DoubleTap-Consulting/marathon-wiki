import { chromium, type Page } from "playwright-core";

import { searchPages, type SearchEntry } from "../../src/wiki/search.ts";

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const articlePath = process.env.E2E_ARTICLE_PATH ?? "/marathon/ranked";
const shareQuery = process.env.E2E_SHARE_QUERY ?? "";
const tenant = articlePath.split("/")[1];
const failures: string[] = [];

function check(ok: boolean, label: string) {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failures.push(label);
}

const field = (page: Page) => page.locator("[role=combobox]:visible");
const options = (page: Page) => page.locator("[role=option]:visible");
const pathOf = (page: Page) => new URL(page.url()).pathname + new URL(page.url()).hash;

async function open(page: Page, path: string) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("[aria-label^='Color scheme:']")?.hasAttribute("aria-label"));
}

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
if (shareQuery) await (await context.newPage()).goto(`${baseUrl}${articlePath}${shareQuery}`);
const entries = (await (await context.request.get(`${baseUrl}/${tenant}/search-index.json`)).json()) as SearchEntry[];
check(entries.length > 0, `index serves ${entries.length} pages`);
// Every published page is filed under a category (the index lists published pages only).
const uncategorized = entries.filter((entry) => !entry.category).map((entry) => entry.slug);
check(uncategorized.length === 0, `every published page has a category${uncategorized.length ? `; missing: ${uncategorized.join(", ")}` : ""}`);

// Every heading in the index is a real anchor on its article.
let missing = 0;
let headings = 0;
for (const entry of entries) {
  const html = await (await context.request.get(`${baseUrl}/${tenant}/${entry.slug}`)).text();
  for (const heading of entry.headings) {
    headings += 1;
    if (!html.includes(`id="${heading.id}"`)) {
      missing += 1;
      console.log(`  missing #${heading.id} on ${entry.slug}`);
    }
  }
}
check(missing === 0, `all ${headings} indexed headings exist as anchors`);

const page = await context.newPage();
await open(page, articlePath);

// Keyboard only: "/" focuses, typing suggests from the first character, Down + Enter opens the page.
await page.keyboard.press("/");
check(await field(page).evaluate((el) => el === document.activeElement), '"/" focuses the header search');
await page.keyboard.type("c");
await options(page).first().waitFor();
check((await options(page).count()) > 1, `"c" already suggests (${(await options(page).count()) - 1} pages)`);
await page.keyboard.type("ryo");
await page.waitForFunction(() => document.querySelector("[role=option]")?.textContent?.startsWith("Cryo Archive"));
check((await options(page).first().textContent())?.startsWith("Cryo Archive") ?? false, `"cryo" lists Cryo Archive first: ${await options(page).first().textContent()}`);
check((await options(page).last().textContent()) === "Search all pages for “cryo”", "last row searches all pages");
check((await field(page).getAttribute("aria-expanded")) === "true", "combobox is expanded");
check(/found/.test((await page.locator("[role=status]").first().textContent()) ?? ""), `live region: ${await page.locator("[role=status]").first().textContent()}`);
const width = await page.locator("[data-slot=popover-content]").evaluate((el) => (el as HTMLElement).offsetWidth);
check(width >= 420, `popover is ${width}px wide`);
await page.keyboard.press("ArrowDown");
check((await field(page).getAttribute("aria-activedescendant")) === (await options(page).first().getAttribute("id")), "Down highlights the first row");
await page.keyboard.press("Enter");
await page.waitForURL(`**/${tenant}/cryo-archive`);
check(pathOf(page) === `/${tenant}/cryo-archive`, `Enter opens ${pathOf(page)}`);

// One typo from four characters.
await page.keyboard.press("Control+k");
await page.keyboard.type("crio");
await page.waitForFunction(() => document.querySelector("[role=option]")?.textContent?.startsWith("Cryo Archive"));
check(true, '"crio" still finds Cryo Archive (Ctrl-K focused the field)');

// Esc closes, then clears; focus stays in the field.
await page.keyboard.press("Escape");
check((await field(page).getAttribute("aria-expanded")) === "false" && (await field(page).inputValue()) === "crio", "first Esc closes");
await page.keyboard.press("Escape");
check((await field(page).inputValue()) === "" && (await field(page).evaluate((el) => el === document.activeElement)), "second Esc clears and keeps focus");

// A heading hit lands on its anchor.
const target = entries
  .flatMap((entry) => entry.headings.map((heading) => heading.text))
  .find((text) => searchPages(entries, text, 6)[0]?.heading?.text === text);
if (!target) check(false, "found a heading-only query");
else {
  const [hit] = searchPages(entries, target, 6);
  await page.keyboard.type(target);
  await page.waitForFunction((text) => document.querySelector("[role=option]")?.textContent?.includes(`› , ${text}`) || document.querySelector("[role=option]")?.textContent?.includes(text), target);
  console.log(`  heading row: ${await options(page).first().textContent()}`);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForURL(`**/${tenant}/${hit.slug}#${hit.heading!.id}`);
  await page.waitForTimeout(500);
  const top = await page.evaluate((id) => document.getElementById(id)?.getBoundingClientRect().top ?? -1, hit.heading!.id);
  check(top >= 0 && top < 200, `"${target}" lands on #${hit.heading!.id} (top ${Math.round(top)}px)`);
}

// Enter with nothing highlighted goes to the full results page.
await page.keyboard.press("/");
await page.keyboard.type("cryo");
await page.keyboard.press("Enter");
await page.waitForURL(`**/${tenant}/search?q=cryo`);
check((await page.locator("main ol li a").first().textContent())?.startsWith("Cryo Archive") ?? false, "results page lists Cryo Archive first");

// Shortcuts leave other inputs alone.
await page.locator("#search-page-input").focus();
await page.keyboard.press("/");
check((await page.locator("#search-page-input").evaluate((el) => el === document.activeElement)), '"/" types normally in another field');

// No match offers the suggest flow.
await field(page).fill("xyzzq");
await page.getByText("No pages match “xyzzq”").waitFor();
check((await options(page).first().textContent()) === "Suggest this page", "no match offers Suggest this page");

// If the index fails to load the field still searches.
const failing = await context.newPage();
await failing.route("**/search-index.json", (route) => route.fulfill({ status: 500 }));
await open(failing, articlePath);
await field(failing).fill("cryo");
check((await options(failing).count()) === 1, "index failure leaves only the search-all row");
await failing.keyboard.press("Enter");
await failing.waitForURL(`**/${tenant}/search?q=cryo`);
check(true, "index failure: Enter opens the results page");

// 390: a full-height sheet, field focused, 44px rows.
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
if (shareQuery) await (await phone.newPage()).goto(`${baseUrl}${articlePath}${shareQuery}`);
const mobile = await phone.newPage();
await open(mobile, articlePath);
await mobile.getByRole("button", { name: "Search", exact: true }).tap();
await field(mobile).waitFor();
check(await field(mobile).evaluate((el) => el === document.activeElement), "sheet autofocuses the field");
const sheetHeight = await mobile.locator("[data-slot=sheet-content]").evaluate((el) => el.getBoundingClientRect().height);
check(sheetHeight === 844, `sheet is full height (${sheetHeight}px)`);
await mobile.keyboard.type("cryo");
await mobile.waitForFunction(() => document.querySelector("[role=option]")?.textContent?.startsWith("Cryo Archive"));
const heights = await options(mobile).evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
check(heights.every((height) => height >= 44), `rows are ${Math.min(...heights)}px or taller`);
await options(mobile).first().tap();
await mobile.waitForURL(`**/${tenant}/cryo-archive`);
check(true, "tapping a row opens the page");

await browser.close();
if (failures.length) {
  console.error(`search: FAIL ${failures.length}`);
  process.exit(1);
}
console.log("search: PASS");

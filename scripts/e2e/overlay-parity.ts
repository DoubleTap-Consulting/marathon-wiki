import { readFileSync, writeFileSync } from "node:fs";

import { chromium, type Locator, type Page } from "playwright-core";

// The article's popover triggers carry exactly the attributes Radix's PopoverTrigger gives them, before and
// after opening, whether or not the popover code has loaded yet. Writes the normalized attribute maps to
// E2E_DUMP (if set) so two deployments can be diffed. Also checks the "Add a note" toast region works.
const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const articlePath = process.env.E2E_ARTICLE_PATH ?? "/marathon/ranked";
// Pages with unconfirmed and disputed claims, for the ClaimMark triggers (missing pages are skipped).
const claimPaths = (process.env.E2E_CLAIM_PATHS ?? "/marathon/runner-shells,/marathon/tau-ceti-iv,/marathon/traxus,/marathon/uesc-marathon").split(",");
const shareQuery = process.env.E2E_SHARE_QUERY ?? "";
const dumpPath = process.env.E2E_DUMP;
// A dump from a deployment that still uses Radix's own PopoverTrigger, to compare against attribute for attribute.
const referencePath = process.env.E2E_PARITY_REFERENCE;
const failures: string[] = [];

function check(ok: boolean, label: string) {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failures.push(label);
}

const RADIX_ATTRS = ["type", "aria-haspopup", "aria-expanded", "aria-controls", "data-state", "data-slot", "data-radix-popper-side", "data-radix-popper-align"];

async function attrs(trigger: Locator) {
  return trigger.evaluate((el, names) => {
    const out: Record<string, string | null> = {};
    for (const name of names) out[name] = el.getAttribute(name);
    // Everything else on the element, so a stray or lost attribute shows up in the dump diff.
    out["*"] = el
      .getAttributeNames()
      .filter((name) => !names.includes(name))
      .sort()
      .join(" ");
    return out;
  }, RADIX_ATTRS);
}

// Past the idle callback that preloads the overlay code, plus time for those chunks to arrive.
async function afterIdle(page: Page) {
  await page.evaluate(() => new Promise((resolve) => requestIdleCallback(() => setTimeout(resolve, 1000), { timeout: 3000 })));
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
}

const triggers: Array<{ name: string; selector: string; open: (page: Page, trigger: Locator) => Promise<void> }> = [
  { name: "citation", selector: "button[aria-label^='Source ']", open: (_, t) => t.click() },
  { name: "provenance", selector: "button:has-text('How this page is written'), button[data-slot=popover-trigger]:not([aria-label])", open: (_, t) => t.click() },
  { name: "claim-unconfirmed", selector: "span[role=button][aria-haspopup]", open: (_, t) => t.click() },
  { name: "claim-conflict", selector: "button:has-text('Sources disagree')", open: (_, t) => t.click() },
  { name: "more-actions", selector: "button[aria-label='More actions']", open: (_, t) => t.click() },
];

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
if (shareQuery) await (await context.newPage()).goto(`${baseUrl}${articlePath}${shareQuery}`);
const dump: Record<string, unknown> = {};

const found = new Set<string>();
for (const timing of ["before-js-idle", "after-idle"] as const) {
  for (const [path, { name, selector, open }] of [articlePath, ...claimPaths].flatMap((path) => triggers.map((trigger) => [path, trigger] as const))) {
    if (found.has(`${name}/${timing}`)) continue;
    const page = await context.newPage();
    const response = await page.goto(`${baseUrl}${path}`, { waitUntil: timing === "after-idle" ? "load" : "domcontentloaded" });
    if (!response?.ok()) {
      await page.close();
      continue;
    }
    await page.waitForFunction(() => document.querySelector("[aria-label^='Color scheme:']")?.hasAttribute("aria-label"));
    if (timing === "after-idle") await afterIdle(page);
    const trigger = page.locator(selector).first();
    if ((await trigger.count()) === 0) {
      await page.close();
      continue;
    }
    found.add(`${name}/${timing}`);
    const closed = await attrs(trigger);
    check(
      closed.type === "button" && closed["aria-haspopup"] === "dialog" && closed["aria-expanded"] === "false" && closed["data-state"] === "closed" && closed["data-slot"] === "popover-trigger" && closed["aria-controls"] === null && closed["data-radix-popper-side"] === null,
      `${name} (${timing}) closed: ${JSON.stringify(closed)}`,
    );
    await open(page, trigger);
    await page.waitForFunction((el) => !!el && el.getAttribute("aria-expanded") === "true" && el.hasAttribute("data-radix-popper-side"), await trigger.elementHandle(), { timeout: 5000 }).catch(() => {});
    const opened = await attrs(trigger);
    const controls = opened["aria-controls"] ?? "";
    const content = page.locator(`[id="${controls}"]`);
    check(
      opened["aria-expanded"] === "true" && opened["data-state"] === "open" && /^radix-/.test(controls) && opened["*"] === closed["*"] &&
        opened["data-radix-popper-side"] === (await content.getAttribute("data-side")) && opened["data-radix-popper-align"] === (await content.getAttribute("data-align")),
      `${name} (${timing}) open: ${JSON.stringify(opened)}`,
    );
    check(
      (await content.count()) === 1 && (await content.getAttribute("role")) === "dialog" && (await content.getAttribute("data-state")) === "open",
      `${name} (${timing}) aria-controls points at the open dialog`,
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction((id) => !document.getElementById(id), controls, { timeout: 5000 }).catch(() => {});
    const after = await attrs(trigger);
    check(JSON.stringify(after) === JSON.stringify(closed), `${name} (${timing}) closed again after Esc: ${JSON.stringify(after)}`);
    if (name === "more-actions" || name === "citation") {
      check(await trigger.evaluate((el) => el === document.activeElement), `${name} (${timing}) Esc returns focus to the trigger`);
    }
    const normalize = (map: Record<string, string | null>) => ({ ...map, "aria-controls": map["aria-controls"]?.replace(/^radix-.*/, "radix-*") ?? null });
    dump[`${name}/${timing}`] = { closed: normalize(closed), open: normalize(opened), after: normalize(after) };
    await page.close();
  }
}

for (const { name } of triggers) {
  const required = !name.startsWith("claim-");
  if (!found.has(`${name}/after-idle`)) {
    if (required) check(false, `${name} trigger found`);
    else console.log(`skip ${name}: on none of ${claimPaths.join(", ")}`);
  }
}

// A toast still shows: the region exists once idle, and a toast raised through sonner appears in it.
{
  const page = await context.newPage();
  await page.goto(`${baseUrl}${articlePath}`, { waitUntil: "load" });
  await afterIdle(page);
  await page.waitForSelector("section[aria-label^='Notifications']", { state: "attached", timeout: 10000 }).catch(() => {});
  check((await page.locator("section[aria-label^='Notifications']").count()) === 1, "toast region is mounted after idle");
  await page.locator("button[aria-label='More actions']").click();
  await page.getByRole("dialog").getByRole("button", { name: "Add a note" }).click();
  check(await page.getByRole("dialog", { name: "Add a note" }).isVisible(), "Add a note sheet opens from More actions");
  // Submitting writes a pending note, so only against a preview or local database, never production.
  const isProductionHost = ["wikiden.gg", "marathon-wiki.vercel.app"].some((host) => baseUrl.includes(host));
  if (process.env.E2E_SUBMIT_NOTE === "1" && !isProductionHost) {
    await page.getByRole("textbox", { name: "Community note", exact: true }).fill("E2E check of the review toast; safe to reject.");
    await page.getByRole("button", { name: "Send note" }).click();
    const toast = page.locator("[data-sonner-toast]", { hasText: "Note sent for review" });
    await toast.waitFor({ timeout: 15000 }).catch(() => {});
    check(await toast.isVisible(), 'submitting a note shows the "Note sent for review" toast');
  } else {
    await page.keyboard.press("Escape");
  }
  await page.close();
}

if (referencePath) {
  const reference = JSON.parse(readFileSync(referencePath, "utf8")) as Record<string, unknown>;
  for (const key of Object.keys(reference)) {
    if (!(key in dump)) continue;
    const same = JSON.stringify(reference[key]) === JSON.stringify(dump[key]);
    check(same, `${key} matches the reference${same ? "" : `: expected ${JSON.stringify(reference[key])}, got ${JSON.stringify(dump[key])}`}`);
  }
}

if (dumpPath) writeFileSync(dumpPath, JSON.stringify(dump, null, 2));
await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} failed`);
  process.exit(1);
}
console.log("\nall passed");

import { chromium, type Page } from "playwright-core";

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const articlePath = process.env.E2E_ARTICLE_PATH ?? "/marathon/ranked";
const shareQuery = process.env.E2E_SHARE_QUERY ?? "";

type Group = "strip" | "references" | "index" | "browse";
type Target = { group: Group; label: string; width: number; height: number };

// Index screens: every row link in an index table, plus the Browse list on home.
const indexPaths = (process.env.E2E_INDEX_PATHS ?? "/marathon,/marathon/categories/lore,/marathon/pages").split(",");

// Walks out from the target's center with elementFromPoint, so the result is the area a tap actually reaches.
async function measure(page: Page, kind: "article" | "index"): Promise<Target[]> {
  return page.evaluate((kind) => {
    const pick = (selector: string, group: string) => [...document.querySelectorAll(selector)].map((el) => [group, el] as const);
    const targets =
      kind === "article"
        ? [...pick('[data-slot="trust-strip"] :is(a, button)', "strip"), ...pick("#references li a", "references")]
        : [...pick("main table tbody a", "index"), ...pick('nav[aria-labelledby="browse-categories"] a', "browse")];
    return targets.map(([group, el]) => {
      el.scrollIntoView({ block: "center", inline: "center" });
      const rect = el.getClientRects()[0];
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const hits = (x: number, y: number) => {
        const hit = document.elementFromPoint(x, y);
        return hit !== null && (hit === el || el.contains(hit));
      };
      const reach = (dx: number, dy: number) => {
        let step = 0;
        while (step < 200 && hits(cx + dx * (step + 0.5), cy + dy * (step + 0.5))) step++;
        return step;
      };
      return {
        group: group as Group,
        label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40),
        width: reach(-1, 0) + reach(1, 0),
        height: reach(0, -1) + reach(0, 1),
      };
    });
  }, kind);
}

const browser = await chromium.launch({ channel: "chrome" });
const failures: string[] = [];
for (const [width, stripMin] of [[390, 44], [1280, 24]] as const) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(`${baseUrl}${articlePath}${shareQuery}`, { waitUntil: "networkidle" });
  const targets = await measure(page, "article");
  if (!targets.some((t) => t.group === "strip") || !targets.some((t) => t.group === "references")) {
    failures.push(`${width}px: no trust strip or reference links found on ${articlePath}`);
  }
  for (const t of targets) {
    const min = t.group === "strip" ? stripMin : 24;
    const ok = t.width >= min && t.height >= min;
    console.log(`${ok ? "PASS" : "FAIL"} ${width}px ${t.group} "${t.label}": ${t.width}×${t.height} (needs ${min}×${min})`);
    if (!ok) failures.push(`${width}px ${t.group} "${t.label}" is ${t.width}×${t.height}, needs ${min}×${min}`);
  }
  // Index rows and Browse links: 44px on small screens, 24px on desktop (WCAG 2.5.8), on every index screen.
  for (const path of indexPaths) {
    await page.goto(`${baseUrl}${path}${shareQuery}`, { waitUntil: "networkidle" });
    const rows = await measure(page, "index");
    if (!rows.some((t) => t.group === "index")) failures.push(`${width}px: no index table rows found on ${path}`);
    let passed = 0;
    for (const t of rows) {
      const ok = t.width >= stripMin && t.height >= stripMin;
      if (ok) passed++;
      else {
        console.log(`FAIL ${width}px ${path} ${t.group} "${t.label}": ${t.width}×${t.height} (needs ${stripMin}×${stripMin})`);
        failures.push(`${width}px ${path} ${t.group} "${t.label}" is ${t.width}×${t.height}, needs ${stripMin}×${stripMin}`);
      }
    }
    const smallest = rows.reduce((min, t) => Math.min(min, t.height), Infinity);
    console.log(`${passed === rows.length ? "PASS" : "FAIL"} ${width}px ${path} index: ${passed}/${rows.length} targets ≥ ${stripMin}×${stripMin} (smallest height ${smallest})`);
  }
  await page.close();
}
await browser.close();

if (failures.length > 0) {
  console.error(`target-size: ${failures.length} target(s) too small`);
  process.exit(1);
}

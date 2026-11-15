import { chromium, type Page } from "playwright-core";

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const articlePath = process.env.E2E_ARTICLE_PATH ?? "/marathon/ranked";
const shareQuery = process.env.E2E_SHARE_QUERY ?? "";

type Target = { group: "strip" | "references"; label: string; width: number; height: number };

// Walks out from the target's center with elementFromPoint, so the result is the area a tap actually reaches.
async function measure(page: Page): Promise<Target[]> {
  return page.evaluate(() => {
    const targets = [
      ...[...document.querySelectorAll('[data-slot="trust-strip"] :is(a, button)')].map((el) => ["strip", el] as const),
      ...[...document.querySelectorAll("#references li a")].map((el) => ["references", el] as const),
    ];
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
        group,
        label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40),
        width: reach(-1, 0) + reach(1, 0),
        height: reach(0, -1) + reach(0, 1),
      };
    });
  });
}

const browser = await chromium.launch({ channel: "chrome" });
const failures: string[] = [];
for (const [width, stripMin] of [[390, 44], [1280, 24]] as const) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(`${baseUrl}${articlePath}${shareQuery}`, { waitUntil: "networkidle" });
  const targets = await measure(page);
  if (!targets.some((t) => t.group === "strip") || !targets.some((t) => t.group === "references")) {
    failures.push(`${width}px: no trust strip or reference links found on ${articlePath}`);
  }
  for (const t of targets) {
    const min = t.group === "strip" ? stripMin : 24;
    const ok = t.width >= min && t.height >= min;
    console.log(`${ok ? "PASS" : "FAIL"} ${width}px ${t.group} "${t.label}": ${t.width}×${t.height} (needs ${min}×${min})`);
    if (!ok) failures.push(`${width}px ${t.group} "${t.label}" is ${t.width}×${t.height}, needs ${min}×${min}`);
  }
  await page.close();
}
await browser.close();

if (failures.length > 0) {
  console.error(`target-size: ${failures.length} target(s) too small`);
  process.exit(1);
}

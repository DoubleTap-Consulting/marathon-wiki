import { chromium } from "playwright-core";

// Band pages: the photo band may be the largest paint, but the h1 must paint in the first frame.
// Throttled like Lighthouse mobile (4x CPU, ~1.6 Mbps, 150 ms RTT).
const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const shareQuery = process.env.E2E_SHARE_QUERY ?? "";
const paths = (process.env.E2E_BAND_PATHS ?? "/marathon,/marathon/categories/lore,/marathon/categories/locations").split(",");
const FRAME_MS = 50;

const browser = await chromium.launch({ channel: "chrome" });
const failures: string[] = [];
if (shareQuery) {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}${paths[0]}${shareQuery}`);
  await page.close();
}
for (const path of paths) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.addInitScript(() => {
    const w = window as unknown as { __paint: Record<string, number> };
    w.__paint = {};
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (entry.name === "first-contentful-paint") w.__paint.fcp = entry.startTime;
    }).observe({ type: "paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { identifier: string; renderTime: number; loadTime: number }>)
        if (entry.identifier === "page-title") w.__paint.h1 = entry.renderTime || entry.loadTime;
    }).observe({ type: "element", buffered: true });
    new PerformanceObserver((list) => {
      const last = list.getEntries().at(-1) as (PerformanceEntry & { element?: Element }) | undefined;
      if (last) { w.__paint.lcp = last.startTime; w.__paint.lcpTag = last.element?.tagName === "IMG" ? 1 : 0; }
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  await page.goto(`${baseUrl}${path}`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const paint = await page.evaluate(() => (window as unknown as { __paint: Record<string, number> }).__paint);
  const ok = typeof paint.h1 === "number" && typeof paint.fcp === "number" && paint.h1 - paint.fcp <= FRAME_MS;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${path}: h1 painted ${Math.round(paint.h1 ?? NaN)} ms, first contentful paint ${Math.round(paint.fcp ?? NaN)} ms, LCP ${Math.round(paint.lcp ?? NaN)} ms (${paint.lcpTag ? "band image" : "text"})`,
  );
  if (!ok) failures.push(path);
  await context.close();
}
await browser.close();
if (failures.length > 0) {
  console.error(`first-paint: the h1 missed the first frame on ${failures.join(", ")}`);
  process.exit(1);
}
console.log("first-paint: PASS");

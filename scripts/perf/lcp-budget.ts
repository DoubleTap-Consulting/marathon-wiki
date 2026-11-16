// Simulated Lighthouse mobile LCP budget: RUNS runs per page, fails if any page's median exceeds BUDGET_MS.
//
//   LCP_BASE_URL=https://<deployment> node scripts/perf/lcp-budget.ts
//
// LCP_BYPASS_SECRET (optional): Vercel "Protection Bypass for Automation" secret for protected previews.
// It is sent as a request header and never printed.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = (process.env.LCP_BASE_URL ?? "").replace(/\/$/, "");
const pages = (process.env.LCP_PAGES ?? "/marathon,/marathon/ranked,/marathon/pages,/marathon/cryo-archive").split(",");
const runs = Number(process.env.LCP_RUNS ?? 5);
const budget = Number(process.env.LCP_BUDGET_MS ?? 2500);
const bypass = process.env.LCP_BYPASS_SECRET ?? "";
const chrome = process.env.CHROME_PATH;
if (!base) throw new Error("Set LCP_BASE_URL to the deployment to measure.");

const out = mkdtempSync(join(tmpdir(), "lcp-"));
const headers = bypass ? ["--extra-headers", JSON.stringify({ "x-vercel-protection-bypass": bypass })] : [];
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

type Report = {
  finalDisplayedUrl: string;
  runtimeError?: { message: string };
  audits: Record<string, { numericValue?: number }>;
};

const rows: Array<{ page: string; lcp: number[]; cls: number[] }> = [];
for (const page of pages) {
  const row = { page, lcp: [] as number[], cls: [] as number[] };
  for (let run = 1; run <= runs; run += 1) {
    const path = join(out, `${page.replace(/\//g, "_")}-${run}.json`);
    execFileSync(
      "npx",
      ["-y", "lighthouse@12", `${base}${page}`, ...headers, "--quiet", "--only-categories=performance", "--output=json", `--output-path=${path}`, "--chrome-flags=--headless=new --no-sandbox"],
      { stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, ...(chrome ? { CHROME_PATH: chrome } : {}) } },
    );
    const report = JSON.parse(readFileSync(path, "utf8")) as Report;
    if (report.runtimeError) throw new Error(`${page}: ${report.runtimeError.message}`);
    // A protected deployment without the bypass lands on Vercel's login page; don't measure that.
    if (!new URL(report.finalDisplayedUrl).pathname.startsWith(page)) throw new Error(`${page}: ended on ${new URL(report.finalDisplayedUrl).host}${new URL(report.finalDisplayedUrl).pathname} (protected? set the bypass secret)`);
    row.lcp.push(Math.round(report.audits["largest-contentful-paint"].numericValue ?? Infinity));
    row.cls.push(report.audits["cumulative-layout-shift"].numericValue ?? 0);
  }
  rows.push(row);
}

let failed = 0;
console.log(`Simulated mobile LCP, median of ${runs} (budget ${budget} ms)`);
console.log("| Page | Runs (ms) | Median | CLS (max) | |");
console.log("|---|---|---|---|---|");
for (const { page, lcp, cls } of rows) {
  const ok = median(lcp) <= budget;
  if (!ok) failed += 1;
  console.log(`| ${page} | ${lcp.join(", ")} | ${median(lcp)} | ${Math.max(...cls).toFixed(3)} | ${ok ? "pass" : "FAIL"} |`);
}
if (failed) {
  console.error(`\n${failed} page(s) over the ${budget} ms LCP budget`);
  process.exit(1);
}

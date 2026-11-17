// Checks the GTA 6 production flag against a running server.
//
// Visible (preview / local, default):
//   E2E_BASE_URL=http://127.0.0.1:3106 node scripts/e2e/gta6-flag.ts
//
// Hidden (production-mode start without GTA6_ENABLED=1):
//   E2E_BASE_URL=http://127.0.0.1:3107 GTA6_EXPECT_HIDDEN=1 node scripts/e2e/gta6-flag.ts
const base = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const hidden = process.env.GTA6_EXPECT_HIDDEN === "1";

async function get(path: string) {
  const response = await fetch(`${base}${path}`, { redirect: "manual" });
  const body = await response.text();
  return { status: response.status, body, contentType: response.headers.get("content-type") ?? "" };
}

function titleOf(body: string) {
  return body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
}

function robotsOf(body: string) {
  return body.match(/<meta[^>]+name=["']robots["'][^>]*>/i)?.[0] ?? "";
}

const failures: string[] = [];
const expectStatus = (path: string, got: number, want: number) => {
  if (got !== want) failures.push(`${path}: status ${got}, expected ${want}`);
};

const gta6 = await get("/gta6");
const lucia = await get("/gta6/lucia-caminos");
const index = await get("/gta6/search-index.json");
const pages = await get("/gta6/pages");
const marathon = await get("/marathon");
const robots = await get("/robots.txt");
const sitemap = await get("/sitemap.xml");

expectStatus("/marathon", marathon.status, 200);
if (!/unofficial guide to Marathon/i.test(titleOf(marathon.body))) {
  failures.push(`/marathon: unexpected title ${titleOf(marathon.body)}`);
}

if (hidden) {
  for (const [path, res] of [
    ["/gta6", gta6],
    ["/gta6/lucia-caminos", lucia],
    ["/gta6/pages", pages],
    ["/gta6/search-index.json", index],
  ] as const) {
    expectStatus(path, res.status, 404);
    if (res.contentType.includes("text/html")) {
      if (!/page not found/i.test(titleOf(res.body))) failures.push(`${path}: not a not-found page (${titleOf(res.body)})`);
      if (!/noindex/i.test(robotsOf(res.body))) failures.push(`${path}: missing noindex`);
    }
  }
  if (/gta6/i.test(sitemap.body)) failures.push("sitemap.xml lists /gta6 while the flag is off");
  if (!/Disallow:\s*\/gta6\/?/i.test(robots.body)) failures.push("robots.txt does not disallow /gta6 while the flag is off");
} else {
  expectStatus("/gta6", gta6.status, 200);
  expectStatus("/gta6/lucia-caminos", lucia.status, 200);
  expectStatus("/gta6/search-index.json", index.status, 200);
  if (!/Grand Theft Auto VI/i.test(titleOf(gta6.body))) {
    failures.push(`/gta6: unexpected title ${titleOf(gta6.body)}`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`gta6 flag check passed (${hidden ? "hidden in production" : "visible"}); marathon 200`);

export {};

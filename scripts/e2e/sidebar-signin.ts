import { chromium, type Request } from "playwright-core";

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const articlePath = process.env.E2E_ARTICLE_PATH ?? "/marathon/ranked";
const homePath = process.env.E2E_HOME_PATH ?? "/marathon";
const shareQuery = process.env.E2E_SHARE_QUERY ?? "";

const CLERK_REQUEST = /clerk\.browser\.js|\/npm\/@clerk\/|__clerk\/|js\.clerk\.com|clerk\.wikiden/i;

const failures: string[] = [];

const browser = await chromium.launch({ channel: "chrome" });

try {
  await checkPage(homePath);
  await checkPage(articlePath);
  await checkSignInPage();
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(`sidebar-signin: FAIL\n${failures.join("\n")}`);
  process.exit(1);
}

console.log("sidebar-signin: PASS");

async function checkPage(path: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const clerkRequests: string[] = [];
  page.on("request", (request: Request) => {
    if (CLERK_REQUEST.test(request.url())) {
      clerkRequests.push(request.url());
    }
  });

  if (shareQuery) {
    await page.goto(`${baseUrl}/robots.txt${shareQuery}`);
  }

  const response = await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
  if (!response || response.status() >= 400) {
    failures.push(`${path}: page status ${response?.status() ?? "none"}`);
    await context.close();
    return;
  }

  await page.getByRole("button", { name: "Menu" }).click();
  const nav = page.getByRole("navigation", { name: "Wiki sections" });
  await nav.waitFor();
  await page.waitForFunction(() => {
    const menu = document.querySelector('nav[aria-label="Wiki sections"]');
    return menu?.getAttribute("aria-busy") !== "true";
  });

  const labels = await nav.locator("a, [class*='font-medium']").allTextContents();
  const linkLabels = (await nav.locator("a").allTextContents()).map((label) => label.trim());
  const hasSignIn = linkLabels.includes("Sign in");
  const hasSuggest = linkLabels.includes("Suggest");
  const hasReview = linkLabels.includes("Review");
  const hasSignOut = linkLabels.includes("Sign out");

  if (hasSignIn) {
    if (hasReview) failures.push(`${path}: signed-out menu should not include Review`);
    if (hasSuggest) failures.push(`${path}: signed-out menu should not include Suggest`);
    const box = await nav.getByRole("link", { name: "Sign in" }).boundingBox();
    if (!box || box.height < 44) {
      failures.push(`${path}: Sign in target height ${box?.height ?? 0} is under 44px`);
    }
  } else if (hasSuggest) {
    if (hasSignIn) failures.push(`${path}: signed-in menu still shows Sign in`);
  } else {
    failures.push(`${path}: menu showed neither Sign in nor Suggest (labels: ${labels.join(" | ")})`);
  }

  if (clerkRequests.length > 0) {
    failures.push(`${path}: loaded Clerk from ${clerkRequests.join(", ")}`);
  } else {
    console.log(`PASS ${path}: no clerk-js after opening the menu; links: ${linkLabels.join(", ") || "(none)"}`);
  }

  await context.close();
}

async function checkSignInPage() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  if (shareQuery) {
    await page.goto(`${baseUrl}/robots.txt${shareQuery}`);
  }
  const response = await page.goto(`${baseUrl}/marathon/sign-in`, { waitUntil: "networkidle" });
  if (!response || response.status() >= 400) {
    failures.push(`/marathon/sign-in: status ${response?.status() ?? "none"}`);
    await context.close();
    return;
  }
  const heading = await page.getByRole("heading", { name: "Sign in" }).count();
  if (heading === 0) {
    failures.push("/marathon/sign-in: missing Sign in heading");
  }
  const configured = (await page.getByRole("button", { name: "Sign in" }).count()) > 0;
  const unconfigured = (await page.getByText("Auth is not configured").count()) > 0;
  if (!configured && !unconfigured) {
    failures.push("/marathon/sign-in: expected a Sign in button or the unconfigured message");
  } else {
    console.log(`PASS /marathon/sign-in: ${configured ? "Clerk sign-in controls" : "unconfigured auth message"}`);
  }
  await context.close();
}


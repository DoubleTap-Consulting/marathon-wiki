import { chromium, type Request } from "playwright-core";

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const articlePath = process.env.E2E_ARTICLE_PATH ?? "/marathon/ranked";
const homePath = process.env.E2E_HOME_PATH ?? "/marathon";
const shareQuery = process.env.E2E_SHARE_QUERY ?? "";

const CLERK_REQUEST = /clerk\.browser\.js|\/npm\/@clerk\/|__clerk\/|js\.clerk\.com|clerk\.wikiden/i;
const SIGNED_OUT_HINT = "Suggest edits; an editor reviews every change.";
const SUGGEST_LABEL = "Suggest an edit";
const ACCOUNT_LINKS = new Set(["Sign in", SUGGEST_LABEL, "Review", "Sign out"]);

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
  const sections = page.getByRole("navigation", { name: "Wiki sections" });
  const account = page.getByRole("navigation", { name: "Account" });
  await sections.waitFor();
  await account.waitFor();
  await page.waitForFunction(() => {
    const menu = document.querySelector('nav[aria-label="Account"]');
    return menu?.getAttribute("aria-busy") !== "true";
  });

  const sectionLinks = (await sections.locator("a").allTextContents()).map((label) => label.trim());
  const accountLinks = (await account.locator("a").allTextContents()).map((label) => label.trim());
  const leaked = sectionLinks.filter((label) => ACCOUNT_LINKS.has(label));
  if (leaked.length > 0) {
    failures.push(`${path}: account links appeared in the wiki nav (${leaked.join(", ")})`);
  }

  const sectionsBox = await sections.boundingBox();
  const accountBox = await account.boundingBox();
  if (sectionsBox && accountBox && accountBox.y < sectionsBox.y + sectionsBox.height - 1) {
    failures.push(`${path}: Account section is not below the wiki nav`);
  }

  const accountHeading = account.getByText("Account", { exact: true });
  if ((await accountHeading.count()) === 0) {
    failures.push(`${path}: missing Account label`);
  }

  const hasSignIn = accountLinks.includes("Sign in");
  const hasSuggest = accountLinks.includes(SUGGEST_LABEL);
  const hasReview = accountLinks.includes("Review");
  const hasLegacySuggest = accountLinks.includes("Suggest");
  const hasHint = (await account.getByText(SIGNED_OUT_HINT).count()) > 0;

  if (hasLegacySuggest) {
    failures.push(`${path}: menu still uses the short "Suggest" label`);
  }

  if (hasSignIn) {
    if (hasReview) failures.push(`${path}: signed-out menu should not include Review`);
    if (hasSuggest) failures.push(`${path}: signed-out menu should not include ${SUGGEST_LABEL}`);
    if (!hasHint) failures.push(`${path}: signed-out Account is missing the suggest-edits hint`);
    const box = await account.getByRole("link", { name: "Sign in" }).boundingBox();
    if (!box || box.height < 44) {
      failures.push(`${path}: Sign in target height ${box?.height ?? 0} is under 44px`);
    }
  } else if (hasSuggest) {
    if (hasHint) failures.push(`${path}: signed-in Account should not show the signed-out hint`);
  } else {
    failures.push(`${path}: Account showed neither Sign in nor ${SUGGEST_LABEL} (links: ${accountLinks.join(" | ")})`);
  }

  if (clerkRequests.length > 0) {
    failures.push(`${path}: loaded Clerk from ${clerkRequests.join(", ")}`);
  } else {
    console.log(
      `PASS ${path}: no clerk-js after opening the menu; sections: ${sectionLinks.join(", ")}; account: ${accountLinks.join(", ") || "(none)"}`,
    );
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

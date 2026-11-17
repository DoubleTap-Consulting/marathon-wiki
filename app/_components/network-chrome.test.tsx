import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";
import { LEGAL_CONTACT_EMAIL, LEGAL_EFFECTIVE_DATE } from "@/src/wiki/legal";

import { NetworkChrome } from "./network-chrome";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

describe("network legal chrome", () => {
  it("shows the WikiDen wordmark as written and keeps the header on ink", () => {
    const html = renderToStaticMarkup(<NetworkChrome>body</NetworkChrome>);
    expect(html).toMatch(/<span class="[^"]*\buppercase\b[^"]*">WikiDen<\/span>/);
    expect(html).not.toContain(">WIKIDEN</span>");
    expect(html).toMatch(/<header data-theme="marathon" class="dark /);
    expect(html).toMatch(/<footer data-theme="marathon" class="dark /);
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
    expect(html).toContain(LEGAL_CONTACT_EMAIL);
  });
});

describe("legal pages", () => {
  it("renders the privacy policy with the facts this site actually collects", () => {
    const html = renderToStaticMarkup(<PrivacyPage />);
    expect(html).toContain(">Privacy policy</h1>");
    expect(html).toContain(`Effective ${LEGAL_EFFECTIVE_DATE}`);
    expect(html).toContain("Clerk");
    expect(html).toContain("Google");
    expect(html).toContain("Neon");
    expect(html).toContain("scheme");
    expect(html).toContain("AdSense");
    expect(html).toContain("children under 13");
    expect(html).toContain(LEGAL_CONTACT_EMAIL);
    expect(html).not.toMatch(/Grokipedia/i);
    expect(html).not.toMatch(/Creative Commons/i);
  });

  it("renders the terms with the fan-site disclaimer and contribution license", () => {
    const html = renderToStaticMarkup(<TermsPage />);
    expect(html).toContain(">Terms of service</h1>");
    expect(html).toContain(`Effective ${LEGAL_EFFECTIVE_DATE}`);
    expect(html).toContain("not affiliated with, endorsed by, or sponsored by Bungie");
    expect(html).toContain("worldwide, non-exclusive, royalty-free, perpetual license");
    expect(html).toContain("refetch those sources");
    expect(html).toContain(LEGAL_CONTACT_EMAIL);
    expect(html).not.toMatch(/Grokipedia/i);
    expect(html).not.toMatch(/Creative Commons/i);
  });
});

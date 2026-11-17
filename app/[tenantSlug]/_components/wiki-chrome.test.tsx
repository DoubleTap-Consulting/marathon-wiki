import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NETWORK_PLACEHOLDER, networkBrand } from "@/src/wiki/network";

import { SiteFooter, WikiChrome } from "./wiki-chrome";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

const tenant = { id: "t", slug: "marathon", name: "Marathon Wiki", gameSlug: "marathon", gameTitle: "Marathon" };
const categories = [{ id: "c", slug: "lore", name: "Lore", description: null, pageCount: 1 }];
const original = process.env.VERCEL_ENV;

function render(env: string | undefined) {
  if (env === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = env;
  return renderToStaticMarkup(<WikiChrome tenant={tenant} categories={categories as never}>body</WikiChrome>);
}

describe("site chrome naming", () => {
  afterEach(() => {
    if (original === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = original;
  });

  it("shows the WikiDen wordmark, the game descriptor and the network slot in every environment", () => {
    for (const env of ["production", "preview", "development", undefined]) {
      const html = render(env);
      expect(networkBrand({ VERCEL_ENV: env })).toEqual({ name: "WikiDen", href: null, placeholder: false });
      expect(html).toMatch(/<span class="[^"]*\buppercase\b[^"]*">WikiDen<\/span>/);
      expect(html).not.toContain(">WIKIDEN</span>");
      expect(html).toContain('>An unofficial guide to Marathon<span class="sr-only">, home</span>');
      expect(html).toContain(">Part of WikiDen<");
      expect(html).not.toContain(NETWORK_PLACEHOLDER);
      expect(html).not.toContain('<span class="text-ui font-semibold">Marathon Wiki</span>');
    }
  });

  it("keeps the unofficial notice and trademark line in every build", () => {
    for (const brand of [null, networkBrand({ VERCEL_ENV: "preview" })]) {
      const html = renderToStaticMarkup(<SiteFooter tenant={tenant} categories={categories} brand={brand} />);
      expect(html).toContain("Unofficial fan wiki. Not affiliated with or endorsed by Bungie. Marathon is a trademark of Bungie.");
      expect(html).toContain('href="/privacy"');
      expect(html).toContain('href="/terms"');
    }
  });

  it("keeps the header and footer on ink in both schemes", () => {
    const html = render("preview");
    expect(html).toMatch(/<header data-theme="marathon" class="dark [^"]*border-brand/);
    expect(html).toMatch(/<footer data-theme="marathon" class="dark /);
  });

  it("renders the header search as a collapsed combobox that falls back to the results page", () => {
    const html = render("preview");
    expect(html).toContain('action="/marathon/search"');
    expect(html).toMatch(/role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="[^"]+-listbox"/);
  });
});

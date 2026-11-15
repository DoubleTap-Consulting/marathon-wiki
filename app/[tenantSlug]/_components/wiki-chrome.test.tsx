import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { NETWORK_PLACEHOLDER, networkBrand } from "@/src/wiki/network";

import { SiteFooter, WikiChrome } from "./wiki-chrome";

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

  it("renders today's names in production, with no network slot", () => {
    const html = render("production");
    expect(networkBrand({ VERCEL_ENV: "production" })).toBeNull();
    expect(html).toContain('<span class="text-ui font-semibold">Marathon Wiki</span>');
    expect(html).not.toContain(NETWORK_PLACEHOLDER);
    expect(html).not.toContain("Part of");
  });

  it("shows the placeholder network wordmark, the game descriptor and the network slot on previews", () => {
    for (const env of ["preview", "development", undefined]) {
      const html = render(env);
      expect(html).toContain(`aria-label="${NETWORK_PLACEHOLDER}, An unofficial guide to Marathon, home"`);
      expect(html).toContain(`>Part of ${NETWORK_PLACEHOLDER}<`);
    }
  });

  it("keeps the unofficial notice and trademark line in every build", () => {
    for (const brand of [null, networkBrand({ VERCEL_ENV: "preview" })]) {
      const html = renderToStaticMarkup(<SiteFooter tenant={tenant} categories={categories} brand={brand} />);
      expect(html).toContain("Unofficial fan wiki. Not affiliated with or endorsed by Bungie. Marathon is a trademark of Bungie.");
    }
  });

  it("keeps the header and footer on ink in both schemes", () => {
    const html = render("preview");
    expect(html).toMatch(/<header data-theme="marathon" class="dark [^"]*border-brand/);
    expect(html).toMatch(/<footer data-theme="marathon" class="dark /);
  });
});

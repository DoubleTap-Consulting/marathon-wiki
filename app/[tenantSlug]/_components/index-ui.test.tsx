import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { WikiPageSummary } from "@/src/db/wiki";

import { CategoryGlyph, DitherBand, EmptyState, IndexTable } from "./index-ui";

const page = (slug: string, category: WikiPageSummary["category"]): WikiPageSummary => ({
  id: slug,
  slug,
  title: slug.toUpperCase(),
  summary: `About ${slug}.`,
  status: "published",
  updatedAt: new Date("2026-11-15T12:00:00Z"),
  publishedAt: new Date("2026-11-15T12:00:00Z"),
  category,
  sourceCount: 3,
});

describe("index screens", () => {
  it("lists pages as table rows with one link per row, never as cards", () => {
    const html = renderToStaticMarkup(
      <IndexTable tenantSlug="marathon" caption="All pages" pages={[page("armory", { slug: "equipment", name: "Equipment" }), page("lore-page", { slug: "lore", name: "Lore" })]} />,
    );
    expect(html).toContain("<table");
    expect(html.match(/<a /g)).toHaveLength(2);
    expect(html).toContain('href="/marathon/armory"');
    expect(html).toContain(">Equipment<");
    expect(html).not.toMatch(/grid-cols-2|min-h-36/);
  });

  it("drops the category column on a category page", () => {
    const html = renderToStaticMarkup(<IndexTable tenantSlug="marathon" caption="Lore" showCategory={false} pages={[page("arachne", { slug: "lore", name: "Lore" })]} />);
    expect(html).not.toContain(">Category<");
  });

  it("keeps the dither texture decorative and under 4KB", () => {
    const html = renderToStaticMarkup(<DitherBand themeSlug="marathon" region="masthead" />);
    expect(html).toContain('aria-hidden="true"');
    expect(new TextEncoder().encode(html).length).toBeLessThan(4096);
  });

  it("draws our own glyph per category, with a filled square for a new one", () => {
    expect(renderToStaticMarkup(<CategoryGlyph slug="equipment" />)).toContain("M12 4l7 4v8l-7 4-7-4V8z");
    expect(renderToStaticMarkup(<CategoryGlyph slug="new-thing" />)).toContain('fill="currentColor"');
  });

  it("shows the empty-state copy", () => {
    const html = renderToStaticMarkup(<EmptyState themeSlug="marathon" title="Nothing published yet" description="No pages yet. The AI editor publishes the first ones after its sources are checked." />);
    expect(html).toContain("No pages yet. The AI editor publishes the first ones after its sources are checked.");
  });

  it("hides the summary column on small screens and caps rows when asked", () => {
    const pages = Array.from({ length: 15 }, (_, index) => page(`page-${index + 1}`, { slug: "lore", name: "Lore" }));
    const html = renderToStaticMarkup(
      <IndexTable tenantSlug="gta6" caption="All pages" pages={pages} hideSummaryOnMobile mobileLimit={12} />,
    );
    expect(html).toMatch(/label py-2 pr-4 font-medium max-sm:hidden">Summary</);
    expect(html).toContain("max-sm:hidden");
    const hiddenRows = (html.match(/page-1[3-5]/g) ?? []).length;
    expect(hiddenRows).toBeGreaterThanOrEqual(3);
    expect(html).toContain("page-13");
  });
});

import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { homeBandFor, hubBandFor, imagesFor, type ArtImage } from "@/src/wiki/imagery";
import marathon from "@/themes/marathon/theme";

import { ArtSurface } from "./art";

// ── Contrast: the worst case under the scrim is a pure white pixel in the painting. ─────────────────────
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const token = (name: string) => {
  const match = css.match(new RegExp(`--${name}:\\s*oklch\\(([\\d.]+) ([\\d.]+) ([\\d.]+)(?: / ([\\d.]+))?\\)`));
  if (!match) throw new Error(`--${name} not found in globals.css`);
  const [, l, c, h, alpha] = match;
  return { l: Number(l), c: Number(c), h: Number(h), alpha: alpha ? Number(alpha) : 1 };
};

/** OKLCH → gamma-encoded sRGB channels in 0..1 (browsers composite alpha in this space). */
function srgb({ l, c, h }: { l: number; c: number; h: number }): number[] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return linear.map((v) => Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)));
}
const over = (top: number[], alpha: number, under: number[]) => top.map((v, i) => v * alpha + under[i] * (1 - alpha));
const luminance = (rgb: number[]) => {
  const [r, g, b] = rgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (x: number[], y: number[]) => {
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
};

describe("text on art: scrim contrast, worst case", () => {
  const paper = srgb(token("art-paper"));
  const ink = token("art-ink-scrim");
  const white = [1, 1, 1];
  const behind = over(srgb(ink), ink.alpha, white); // the scrim over a white pixel

  it("keeps the scrim at ink 0.85 or more", () => {
    expect(ink.alpha).toBeGreaterThanOrEqual(0.85);
  });
  it("h1 (paper) clears 7:1", () => {
    expect(contrast(paper, behind)).toBeGreaterThanOrEqual(7);
  });
  it("dek (paper/85) clears 7:1", () => {
    expect(contrast(over(paper, 0.85, behind), behind)).toBeGreaterThanOrEqual(7);
  });
  it("eyebrow and credit line (paper/70) clear 4.5:1", () => {
    expect(contrast(over(paper, 0.7, behind), behind)).toBeGreaterThanOrEqual(4.5);
  });
});

// ── Markup ───────────────────────────────────────────────────────────────────────────────────────────────
const render = (image: ArtImage, variant: "home" | "hub" | "plate") =>
  renderToStaticMarkup(
    <ArtSurface image={image} variant={variant} creditHref={`/marathon/credits#${image.id}`} contentClassName="" transition={variant !== "home"}>
      <h1>Title</h1>
    </ArtSurface>,
  );

describe("art surfaces", () => {
  const home = homeBandFor("marathon")!;

  it("every category has a house-collection painting", () => {
    for (const category of ["overview", "gameplay", "equipment", "locations", "lore"]) expect(hubBandFor("marathon", category), category).not.toBeNull();
    expect(Object.keys(marathon.imagery.hubBands)).toHaveLength(5);
  });

  it("drops the 'not from the game' badge: the credit is one line linking to /credits", () => {
    for (const image of imagesFor("marathon").filter((entry): entry is ArtImage => Boolean(entry.art))) {
      const html = render(image, "hub");
      expect(html).not.toMatch(/not from the game|Illustrative/i);
      expect(html).toContain(`href="/marathon/credits#${image.id}"`);
      expect(html).toContain(`${image.author} · ${image.art.institution}, ${image.art.year}`);
    }
  });

  it("paintings are decorative (alt empty, presentation role); self-hosted; dominant color placeholder", () => {
    const html = render(home, "home");
    expect(html).toMatch(/<img[^>]*alt=""[^>]*role="presentation"/);
    expect(html).not.toMatch(/src(set)?="https?:/i);
    expect(html).toContain(`background-color:${home.art.dominant}`);
  });

  it("every surface is above the fold (eager, async decode); only the home hero is high priority", () => {
    for (const variant of ["home", "hub", "plate"] as const) {
      const html = render(variant === "home" ? home : hubBandFor("marathon", "lore")!, variant);
      expect(html, variant).toMatch(/loading="eager"/);
      expect(html, variant).toMatch(/decoding="async"/);
      expect(html.toLowerCase(), variant).toMatch(variant === "home" ? /fetchpriority="high"/ : /fetchpriority="auto"/);
    }
  });

  it("art-directs: the mobile source (tall 828w) comes first, sizes 100vw", () => {
    const html = render(home, "home");
    const first = html.match(/<source[^>]*>/)![0];
    expect(first).toContain('media="(max-width: 767px)"');
    expect(first).toContain('type="image/avif"');
    expect(first).toContain("davis-torus-interior-tall-828.avif 828w");
    expect(html).toContain('sizes="100vw"');
  });

  it("hub hero and article plate share the view-transition name; home doesn't", () => {
    expect(render(hubBandFor("marathon", "gameplay")!, "hub")).toContain("view-transition-name:category-art");
    expect(render(hubBandFor("marathon", "gameplay")!, "plate")).toContain("view-transition-name:category-art");
    expect(render(home, "home")).not.toContain("view-transition-name");
  });
});

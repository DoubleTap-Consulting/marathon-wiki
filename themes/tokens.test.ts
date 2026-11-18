import { globSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import badFixture from "@/scripts/theme/bad-theme.fixture.ts";
import silksongFixture from "@/scripts/theme/silksong.fixture.ts";
import gta6 from "@/themes/gta6/theme.ts";
import marathon from "@/themes/marathon/theme.ts";
import { checkTheme, parseCoreTokens, renderCss, themeTokens, toHex } from "@/themes/tokens.ts";
import { themeManifest } from "@/themes/types.ts";

const globals = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const core = parseCoreTokens(globals);

describe("marathon theme", () => {
  it("turns the Marathon palette on: acid fill, darker light-mode link, square corners", () => {
    const theme = themeManifest.parse(marathon);
    expect(toHex(themeTokens(theme).primary)).toBe("#c0fe08");
    expect(toHex(themeTokens(theme)["primary-foreground"])).toBe(toHex(themeTokens(theme).foreground));
    expect(toHex(themeTokens(theme).link)).toBe("#4d6901");
    expect(toHex(themeTokens(theme, "dark").link)).toBe("#c0fe08");
    expect(renderCss(theme)).toContain("--radius: 0;");
  });

  it("matches the committed generated CSS", () => {
    const committed = readFileSync(new URL("../app/themes/generated/marathon.css", import.meta.url), "utf8");
    expect(renderCss(themeManifest.parse(marathon))).toBe(committed);
  });

  it("reads dark trust tokens from globals.css, with conflict still following destructive", () => {
    expect(core.dark["claim-unverified"]).toEqual({ l: 0.8, c: 0.15, h: 75 });
    expect(core.dark["claim-conflict"]).toEqual(core.dark.destructive);
    expect(core.dark.destructive).not.toEqual(core.light.destructive);
  });

  it("passes the contrast, band and hue checks in both schemes", () => {
    expect(checkTheme(themeManifest.parse(marathon), core).errors).toEqual([]);
  });
});


describe("gta6 theme", () => {
  it("uses a Vice-pink fill, pinned navy on-accent, ink links in light and teal in dark, and keeps the WikiDen subtitle", () => {
    const theme = themeManifest.parse(gta6);
    expect(theme.identity.descriptor).toBe("An unofficial guide to Grand Theft Auto VI");
    expect(theme.identity.siteName).toBe("WikiDen");
    expect(theme.identity.kicker).toBe("Field notes · Leonida");
    expect(theme.slug).toBe("gta6");
    expect(toHex(themeTokens(theme, "light")["primary-foreground"]).toLowerCase()).toBe("#0b1026");
    expect(toHex(themeTokens(theme).link)).toBe(toHex(themeTokens(theme).foreground));
    expect(toHex(themeTokens(theme).link)).not.toBe(toHex(themeTokens(theme).primary));
    expect(toHex(themeTokens(theme, "dark").link)).not.toBe(toHex(themeTokens(theme, "dark").primary));
  });

  it("matches the committed generated CSS", () => {
    const committed = readFileSync(new URL("../app/themes/generated/gta6.css", import.meta.url), "utf8");
    expect(renderCss(themeManifest.parse(gta6))).toBe(committed);
  });

  it("passes the contrast, band and hue checks in both schemes", () => {
    expect(checkTheme(themeManifest.parse(gta6), core).errors).toEqual([]);
  });
});

describe("checks", () => {
  it("map an out-of-gamut seed into sRGB, keeping lightness and hue", () => {
    const loud = { ...marathon, color: { ...marathon.color, accent: { l: 0.7, c: 0.37, h: 300 } } };
    const primary = themeTokens(themeManifest.parse(loud)).primary;
    expect(primary.l).toBe(0.7);
    expect(primary.h).toBe(300);
    expect(primary.c).toBeLessThan(0.37);
    expect(checkTheme(themeManifest.parse(loud), core).errors.some((line) => line.includes("outside sRGB"))).toBe(false);
  });

  it("fail an accent within 30° of a trust hue", () => {
    const { errors } = checkTheme(themeManifest.parse(badFixture), core);
    expect(errors).toContain("bad-fixture light accent hue 25 is 2° from destructive hue 27 (needs ≥ 30°)");
  });

  it("fail a text pair under its floor", () => {
    const dim = { ...marathon, color: { ...marathon.color, accent: { l: 0.5, c: 0.1, h: 250 } } };
    const { errors } = checkTheme(themeManifest.parse(dim), core);
    expect(errors.some((line) => line.startsWith("marathon dark link on background"))).toBe(true);
  });

  it("reject a manifest outside the type", () => {
    const loud = { ...marathon, color: { ...marathon.color, neutral: { h: 250, c: 0.08 } } };
    expect(themeManifest.safeParse(loud).success).toBe(false);
  });

  it("parse the Silksong manifest with the identity fields", () => {
    expect(themeManifest.parse(silksongFixture)).toMatchObject({
      chrome: "surface",
      type: { sectionIndex: "upper-roman" },
      identity: { descriptor: "An unofficial guide to Hollow Knight: Silksong", kicker: "Field notes · Pharloom" },
    });
  });
});

describe("component class names", () => {
  const sources = globSync("{app,components}/**/*.tsx", { cwd: new URL("..", import.meta.url) }).map((file) => ({
    file,
    text: readFileSync(new URL(`../${file}`, import.meta.url), "utf8"),
  }));
  const banned = {
    "raw palette color": /\b(?:[\w-]+:)*(?:bg|text|border|ring|fill|stroke|from|via|to|decoration|outline|divide|placeholder|caret|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g,
    "text-primary on text (use text-link)": /\btext-primary(?![-\w])/g,
    "size outside the type scale": /\b(?:[\w-]+:)*text-(?:xs|sm|base|lg|xl|[2-9]xl|\[\d+(?:px|rem)\])(?![-\w])/g,
    "ring focus (the global outline is the focus style)": /\b(?:[\w-]+:)*(?:focus(?:-visible)?:ring|outline-none)[\w/[\]-]*/g,
  };

  it("ban rounded corners outside components/ui, which read --radius", () => {
    const hits = sources
      .filter(({ file }) => !file.startsWith("components/ui/"))
      .flatMap(({ file, text }) => [...text.matchAll(/\b(?:[\w-]+:)*rounded(?:-[\w[\]]+)*(?![-\w])/g)].map((match) => `${file}: ${match[0]}`));
    expect(hits).toEqual([]);
  });

  for (const [rule, pattern] of Object.entries(banned)) {
    it(`ban ${rule}`, () => {
      const hits = sources.flatMap(({ file, text }) => [...text.matchAll(pattern)].map((match) => `${file}: ${match[0]}`));
      expect(hits).toEqual([]);
    });
  }
});

import { globSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import badFixture from "@/scripts/theme/bad-theme.fixture.ts";
import marathon from "@/themes/marathon/theme.ts";
import { checkTheme, HUE_EXEMPT_UNTIL_PR4, hueDistance, parseCoreTokens, renderCss, themeTokens, toHex } from "@/themes/tokens.ts";
import { themeManifest } from "@/themes/types.ts";

const globals = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const core = parseCoreTokens(globals);

const mainRoot = {
  background: "0.985 0.002 247",
  foreground: "0.16 0.02 250",
  card: "1 0 0",
  "card-foreground": "0.16 0.02 250",
  popover: "1 0 0",
  "popover-foreground": "0.16 0.02 250",
  primary: "0.44 0.13 160",
  "primary-foreground": "0.98 0.01 160",
  secondary: "0.94 0.01 247",
  "secondary-foreground": "0.21 0.02 250",
  muted: "0.94 0.01 247",
  "muted-foreground": "0.48 0.02 250",
  accent: "0.91 0.04 183",
  "accent-foreground": "0.2 0.04 183",
  border: "0.89 0.01 247",
  input: "0.89 0.01 247",
  ring: "0.55 0.13 160",
  link: "0.44 0.13 160",
};

const hexOf = (triple: string) => {
  const [l, c, h] = triple.split(" ").map(Number);
  return toHex({ l, c, h });
};

describe("marathon theme", () => {
  it("generates the same sRGB colors as main's :root (bb02a67), with link equal to its primary", () => {
    const generated = Object.fromEntries(Object.entries(themeTokens(themeManifest.parse(marathon))).map(([token, value]) => [token, toHex(value)]));
    const expected = Object.fromEntries(Object.entries(mainRoot).map(([token, triple]) => [token, hexOf(triple)]));
    expect(generated).toEqual(expected);
  });

  it("matches the committed generated CSS", () => {
    const committed = readFileSync(new URL("../app/themes/generated/marathon.css", import.meta.url), "utf8");
    expect(renderCss(themeManifest.parse(marathon))).toBe(committed);
  });

  it("passes the contrast and hue checks", () => {
    expect(checkTheme(themeManifest.parse(marathon), core).errors).toEqual([]);
  });
});

describe("checks", () => {
  it("keep a hue exemption only while the Marathon accent still needs it", () => {
    const cleared = [...HUE_EXEMPT_UNTIL_PR4].filter((token) => hueDistance(marathon.color.accent.h, core[token].h) >= 30);
    expect(cleared, "the accent now clears these trust hues: delete them from HUE_EXEMPT_UNTIL_PR4").toEqual([]);
  });

  it("fail an accent within 30° of a trust hue", () => {
    const { errors } = checkTheme(themeManifest.parse(badFixture), core);
    expect(errors).toContain("bad-fixture accent hue 25 is 2° from destructive hue 27 (needs ≥ 30°)");
  });

  it("fail a text pair under its floor", () => {
    const pale = { ...marathon, color: { ...marathon.color, accent: { l: 0.8, c: 0.1, h: 250 } } };
    const { errors } = checkTheme(themeManifest.parse(pale), core);
    expect(errors.some((line) => line.startsWith("marathon link on background"))).toBe(true);
  });

  it("reject a manifest outside the type", () => {
    const loud = { ...marathon, color: { ...marathon.color, neutral: { h: 250, c: 0.08 } } };
    expect(themeManifest.safeParse(loud).success).toBe(false);
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
  };

  for (const [rule, pattern] of Object.entries(banned)) {
    it(`ban ${rule}`, () => {
      const hits = sources.flatMap(({ file, text }) => [...text.matchAll(pattern)].map((match) => `${file}: ${match[0]}`));
      expect(hits).toEqual([]);
    });
  }
});

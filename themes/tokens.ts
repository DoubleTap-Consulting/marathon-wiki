import type { Oklch, ThemeManifest } from "./types.ts";

export type ThemeToken =
  | "background"
  | "foreground"
  | "card"
  | "card-foreground"
  | "popover"
  | "popover-foreground"
  | "primary"
  | "primary-foreground"
  | "secondary"
  | "secondary-foreground"
  | "muted"
  | "muted-foreground"
  | "accent"
  | "accent-foreground"
  | "border"
  | "input"
  | "ring"
  | "link"
  | "brand"
  | "primary-hover";

type Rule =
  | { seed: "neutral" | "accent"; l: number; c: number }
  | { seed: "accent"; dl: number }
  | "accent-seed"
  | "brand-seed"
  | "ink-on-primary"
  | ThemeToken;

// Chroma is a fraction of the seed's. The accent is a fill: light-mode links and rings use a darker
// step of its hue, so any seed works, however light (spec VI §2).
const LIGHT: Record<ThemeToken, Rule> = {
  background: { seed: "neutral", l: 0.985, c: 0.4 },
  foreground: { seed: "neutral", l: 0.18, c: 0.5 },
  card: { seed: "neutral", l: 1, c: 0 },
  "card-foreground": "foreground",
  popover: "card",
  "popover-foreground": "foreground",
  primary: "accent-seed",
  "primary-hover": { seed: "accent", dl: -0.06 },
  "primary-foreground": "ink-on-primary",
  secondary: { seed: "neutral", l: 0.93, c: 0.5 },
  "secondary-foreground": "foreground",
  muted: "secondary",
  "muted-foreground": { seed: "neutral", l: 0.47, c: 0.6 },
  accent: "secondary",
  "accent-foreground": "foreground",
  border: { seed: "neutral", l: 0.86, c: 0.5 },
  input: { seed: "neutral", l: 0.6, c: 0.6 },
  ring: { seed: "accent", l: 0.48, c: 0.54 },
  link: "ring",
  brand: "brand-seed",
};

const DARK: Record<ThemeToken, Rule> = {
  background: { seed: "neutral", l: 0.155, c: 0.3 },
  foreground: { seed: "neutral", l: 0.95, c: 0.4 },
  card: { seed: "neutral", l: 0.205, c: 0.3 },
  "card-foreground": "foreground",
  popover: "card",
  "popover-foreground": "foreground",
  primary: "accent-seed",
  "primary-hover": { seed: "accent", dl: -0.06 },
  "primary-foreground": "ink-on-primary",
  secondary: { seed: "neutral", l: 0.25, c: 0.4 },
  "secondary-foreground": "foreground",
  muted: "secondary",
  "muted-foreground": { seed: "neutral", l: 0.79, c: 0.5 },
  accent: "secondary",
  "accent-foreground": "foreground",
  border: { seed: "neutral", l: 0.32, c: 0.4 },
  input: { seed: "neutral", l: 0.55, c: 0.5 },
  ring: "accent-seed",
  link: "accent-seed",
  brand: "brand-seed",
};

export const SCHEMES = ["light", "dark"] as const;
export type Scheme = (typeof SCHEMES)[number];
const MAPPING: Record<Scheme, Record<ThemeToken, Rule>> = { light: LIGHT, dark: DARK };

type CoreToken = "destructive" | "claim-unverified" | "claim-conflict" | "diff-added" | "diff-added-surface";
type Token = ThemeToken | CoreToken;
export type CoreTokens = Record<Scheme, Record<CoreToken, Oklch>>;

const round = (n: number, digits: number) => Number(n.toFixed(digits));

export function themeTokens(theme: ThemeManifest, scheme: Scheme = "light"): Record<ThemeToken, Oklch> {
  const mapping = MAPPING[scheme];
  const { neutral, accent, brand = accent } = theme.color;
  const resolve = (rule: Rule): Oklch => {
    if (rule === "accent-seed") return toGamut(accent);
    if (rule === "brand-seed") return toGamut(brand);
    if (rule === "ink-on-primary") {
      const [primary, ink, paper] = [resolve(mapping.primary), resolve(mapping.foreground), resolve(mapping.background)];
      return wcagRatio(ink, primary) >= wcagRatio(paper, primary) ? ink : paper;
    }
    if (typeof rule === "string") return resolve(mapping[rule]);
    if ("dl" in rule) return toGamut({ ...accent, l: round(accent.l + rule.dl, 3) });
    const seed = rule.seed === "neutral" ? neutral : accent;
    return toGamut({ l: rule.l, c: round(seed.c * rule.c, 3), h: seed.h });
  };
  return Object.fromEntries(Object.entries(mapping).map(([token, rule]) => [token, resolve(rule)])) as Record<ThemeToken, Oklch>;
}

const inGamut = (color: Oklch) => linearRgb(color).every((x) => x >= -1e-4 && x <= 1 + 1e-4);

// Keeps lightness and hue and lowers chroma until the color fits sRGB.
function toGamut(color: Oklch): Oklch {
  if (inGamut(color)) return color;
  let [lo, hi] = [0, color.c];
  while (hi - lo > 1e-4) {
    const mid = (lo + hi) / 2;
    if (inGamut({ ...color, c: mid })) lo = mid;
    else hi = mid;
  }
  return { ...color, c: Math.floor(lo * 1000) / 1000 };
}

const formatOklch = ({ l, c, h }: Oklch) => `oklch(${round(l, 3)} ${round(c, 3)} ${round(h, 1)})`;

const RADIUS = { square: "0", soft: "6px" } as const;

export function renderCss(theme: ThemeManifest): string {
  const lines = (scheme: Scheme, indent: string) =>
    Object.entries(themeTokens(theme, scheme)).map(([token, value]) => `${indent}--${token}: ${formatOklch(value)};`).join("\n");
  const { display } = theme.type;
  const shape = [
    `  --radius: ${RADIUS[theme.shape.corners]};`,
    `  --display-case: ${display.case === "upper" ? "uppercase" : "none"};`,
    `  --display-tracking: ${display.tracking}em;`,
    `  --display-wdth: ${display.axes?.wdth ?? 100};`,
  ].join("\n");
  return `/* Generated by scripts/theme/build.ts from themes/${theme.slug}/theme.ts. Do not edit. */\n[data-theme="${theme.slug}"] {\n${shape}\n${lines("light", "  ")}\n\n  @variant dark {\n${lines("dark", "    ")}\n  }\n}\n`;
}

// Light values come from the first top-level `:root {}`, dark overrides from `:root { @variant dark {} }`.
export function parseCoreTokens(css: string): CoreTokens {
  const declarations = (block: string | undefined) =>
    [...(block ?? "").matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()] as const);
  const light = declarations(css.match(/^:root\s*{([^}]*)}/m)?.[1]);
  const dark = declarations(css.match(/^:root\s*{\s*@variant dark\s*{([^}]*)}/m)?.[1]);
  return { light: readCore(new Map(light), "light"), dark: readCore(new Map([...light, ...dark]), "dark") };
}

function readCore(raw: Map<string, string>, scheme: Scheme): Record<CoreToken, Oklch> {
  const read = (name: string): Oklch => {
    const value = raw.get(name);
    const alias = value?.match(/^var\(--([\w-]+)\)$/);
    if (alias) return read(alias[1]);
    const parts = value?.match(/^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/);
    if (!parts) throw new Error(`app/globals.css :root is missing a ${scheme} oklch value for --${name}`);
    return { l: Number(parts[1]), c: Number(parts[2]), h: Number(parts[3]) };
  };
  const names: CoreToken[] = ["destructive", "claim-unverified", "claim-conflict", "diff-added", "diff-added-surface"];
  return Object.fromEntries(names.map((name) => [name, read(name)])) as Record<CoreToken, Oklch>;
}

function linearRgb({ l: L, c, h }: Oklch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const clip = (x: number) => Math.min(1, Math.max(0, x));
const encode = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);

export const toHex = (color: Oklch) =>
  `#${linearRgb(color).map((x) => Math.round(clip(encode(clip(x))) * 255).toString(16).padStart(2, "0")).join("")}`;

export function wcagRatio(fg: Oklch, bg: Oklch): number {
  const luminance = (color: Oklch) => {
    const [r, g, b] = linearRgb(color).map(clip);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// APCA 0.0.98G-4g, the same simplified form as the spec's color.py.
export function apcaLc(fg: Oklch, bg: Oklch): number {
  const y = (color: Oklch) => {
    const [r, g, b] = linearRgb(color).map((x) => encode(clip(x)));
    const value = 0.2126729 * r ** 2.4 + 0.7151522 * g ** 2.4 + 0.072175 * b ** 2.4;
    return value > 0.022 ? value : value + (0.022 - value) ** 1.414;
  };
  const [text, back] = [y(fg), y(bg)];
  if (Math.abs(back - text) < 0.0005) return 0;
  const s = back > text ? (back ** 0.56 - text ** 0.57) * 1.14 : (back ** 0.65 - text ** 0.62) * 1.14;
  if (Math.abs(s) < 0.1) return 0;
  return Math.abs((s - Math.sign(s) * 0.027) * 100);
}

const FLOORS = {
  body: { ratio: 7, lc: 75 },
  text: { ratio: 4.5, lc: 60 },
  ui: { ratio: 3, lc: 0 },
} as const;

const PAIRS: [fg: Token, bg: Token, floor: keyof typeof FLOORS][] = [
  ["foreground", "background", "body"],
  ["foreground", "card", "body"],
  ["muted-foreground", "background", "text"],
  ["muted-foreground", "card", "text"],
  ["muted-foreground", "muted", "text"],
  ["secondary-foreground", "secondary", "text"],
  ["accent-foreground", "accent", "text"],
  ["primary-foreground", "primary", "text"],
  ["link", "background", "text"],
  ["link", "card", "text"],
  ["destructive", "background", "text"],
  ["destructive", "card", "text"],
  ["ring", "background", "ui"],
  ["ring", "card", "ui"],
  ["claim-unverified", "background", "ui"],
  ["claim-unverified", "card", "ui"],
  ["claim-conflict", "background", "ui"],
  ["claim-conflict", "card", "ui"],
  ["diff-added", "background", "ui"],
  ["foreground", "diff-added-surface", "body"],
  ["input", "background", "ui"],
  ["input", "card", "ui"],
  ["primary-foreground", "primary-hover", "text"],
];

const MIN_TRUST_HUE_DISTANCE = 30;
const TRUST_HUES: CoreToken[] = ["destructive", "claim-unverified", "claim-conflict", "diff-added"];

export const hueDistance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

export type CheckResult = { errors: string[]; lines: string[] };

// Keeps the shared trust values passing on every theme (spec §2).
const BACKGROUND_BAND: Record<Scheme, [min: number, max: number]> = { light: [0.95, 0.99], dark: [0.14, 0.22] };

export function checkTheme(theme: ThemeManifest, core: CoreTokens): CheckResult {
  const result: CheckResult = { errors: [], lines: [] };
  const check = (line: string, pass: boolean) => {
    result.lines.push(`${pass ? "PASS" : "FAIL"} ${line}`);
    if (!pass) result.errors.push(line);
  };

  for (const scheme of SCHEMES) {
    const name = `${theme.slug} ${scheme}`;
    const tokens: Record<Token, Oklch> = { ...themeTokens(theme, scheme), ...core[scheme] };

    for (const [token, value] of Object.entries(tokens)) {
      if (!inGamut(value)) check(`${name} ${token} ${formatOklch(value)} is outside sRGB`, false);
    }

    for (const [fg, bg, floor] of PAIRS) {
      const ratio = wcagRatio(tokens[fg], tokens[bg]);
      const lc = apcaLc(tokens[fg], tokens[bg]);
      const need = FLOORS[floor];
      const line = `${name} ${fg} on ${bg}: ${ratio.toFixed(2)}:1 Lc ${lc.toFixed(1)} (${floor} needs ${need.ratio}:1, Lc ${need.lc})`;
      check(line, ratio >= need.ratio && lc >= need.lc);
    }

    const [min, max] = BACKGROUND_BAND[scheme];
    const l = tokens.background.l;
    check(`${name} background L ${l} (needs ${min}–${max})`, l >= min && l <= max);

    const accentHue = theme.color.accent.h;
    for (const token of TRUST_HUES) {
      const distance = hueDistance(accentHue, core[scheme][token].h);
      const line = `${name} accent hue ${accentHue} is ${round(distance, 1)}° from ${token} hue ${core[scheme][token].h} (needs ≥ ${MIN_TRUST_HUE_DISTANCE}°)`;
      check(line, distance >= MIN_TRUST_HUE_DISTANCE);
    }
  }

  return result;
}

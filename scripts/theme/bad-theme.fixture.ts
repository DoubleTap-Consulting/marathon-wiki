import type { ThemeManifest } from "../../themes/types.ts";
import marathon from "../../themes/marathon/theme.ts";

export default {
  ...marathon,
  slug: "bad-fixture",
  color: { ...marathon.color, accent: { l: 0.5, c: 0.19, h: 25 } },
} satisfies ThemeManifest;

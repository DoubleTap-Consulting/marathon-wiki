type Env = Record<string, string | undefined>;

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

export type WikiAdPlacement = "sidebar" | "footer";

export type WikiAdSlot = {
  placement: WikiAdPlacement;
  slotId: string;
  minHeight: number;
};

export type WikiAdsConfig = {
  enabled: boolean;
  provider: "adsense";
  clientId: string;
  slots: WikiAdSlot[];
};

export type WikiPremiumConfig = {
  enabled: boolean;
  url: string;
  label: string;
  description: string;
};

export function readBoolean(
  value: string | undefined,
  defaultValue = false,
): boolean {
  if (!value) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();

  if (TRUE_VALUES.has(normalized)) {
    return true;
  }

  if (FALSE_VALUES.has(normalized)) {
    return false;
  }

  return defaultValue;
}

export function getWikiSiteBaseUrl(env: Env = process.env): URL {
  const configured =
    env.NEXT_PUBLIC_SITE_URL ??
    env.WIKI_PUBLIC_BASE_URL ??
    (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : undefined);

  return safeUrl(configured) ?? new URL("http://localhost:3000");
}

export function getWikiAdsConfig(env: Env = process.env): WikiAdsConfig | null {
  const enabled = readBoolean(env.WIKI_ADS_ENABLED, false);
  const clientId = env.WIKI_ADSENSE_CLIENT_ID?.trim();

  if (!enabled || !clientId) {
    return null;
  }

  const slots: WikiAdSlot[] = [
    buildAdSlot("sidebar", env.WIKI_AD_SLOT_SIDEBAR, 280),
    buildAdSlot("footer", env.WIKI_AD_SLOT_FOOTER, 120),
  ].filter((slot): slot is WikiAdSlot => Boolean(slot));

  if (slots.length === 0) {
    return null;
  }

  return {
    enabled: true,
    provider: "adsense",
    clientId,
    slots,
  };
}

export function getWikiPremiumConfig(
  env: Env = process.env,
): WikiPremiumConfig | null {
  const enabled = readBoolean(env.WIKI_PREMIUM_ENABLED, false);
  const url = safeUrl(env.WIKI_PREMIUM_URL);

  if (!enabled || !url) {
    return null;
  }

  return {
    enabled: true,
    url: url.toString(),
    label: env.WIKI_PREMIUM_LABEL?.trim() || "Support this wiki",
    description:
      env.WIKI_PREMIUM_DESCRIPTION?.trim() ||
      "Help keep the public wiki fast, readable, and source-backed.",
  };
}

export function isWikiIndexingEnabled(env: Env = process.env): boolean {
  const configured = env.WIKI_ROBOTS_INDEXING_ENABLED;

  if (configured) {
    return readBoolean(configured, false);
  }

  if (env.VERCEL_ENV) {
    return env.VERCEL_ENV === "production";
  }

  return true;
}

function buildAdSlot(
  placement: WikiAdPlacement,
  slotId: string | undefined,
  minHeight: number,
): WikiAdSlot | null {
  const normalizedSlotId = slotId?.trim();

  if (!normalizedSlotId) {
    return null;
  }

  return {
    placement,
    slotId: normalizedSlotId,
    minHeight,
  };
}

function safeUrl(value: string | undefined): URL | null {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url;
  } catch {
    return null;
  }
}

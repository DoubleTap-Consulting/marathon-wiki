type Env = Record<string, string | undefined>;

export const WIKI_ANALYTICS_EVENT_TYPES = [
  "page_view",
  "search_submit",
  "suggestion_cta",
  "suggestion_submit",
  "premium_cta",
  "ad_slot_view",
] as const;

export type WikiAnalyticsEventType = (typeof WIKI_ANALYTICS_EVENT_TYPES)[number];

export type WikiAnalyticsEvent = {
  type: WikiAnalyticsEventType;
  path: string;
  tenantSlug?: string;
  pageSlug?: string;
  label?: string;
  value?: string;
  clientTimestamp?: string;
};

const EVENT_TYPE_SET = new Set<string>(WIKI_ANALYTICS_EVENT_TYPES);

export function isWikiAnalyticsEnabled(env: Env = process.env) {
  return env.WIKI_ANALYTICS_ENABLED?.trim().toLowerCase() !== "false";
}

export function sanitizeWikiAnalyticsEvent(
  input: unknown,
): WikiAnalyticsEvent | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const payload = input as Record<string, unknown>;
  const type = stringValue(payload.type);
  const path = sanitizePath(payload.path);

  if (!type || !EVENT_TYPE_SET.has(type) || !path) {
    return null;
  }

  return compact({
    type: type as WikiAnalyticsEventType,
    path,
    tenantSlug: sanitizeSlug(payload.tenantSlug),
    pageSlug: sanitizeSlug(payload.pageSlug),
    label: sanitizeText(payload.label, 96),
    value: sanitizeText(payload.value, 160),
    clientTimestamp: sanitizeTimestamp(payload.clientTimestamp),
  });
}

export function redactWikiAnalyticsHeaders(headers: Headers) {
  return compact({
    referrer: sanitizeText(headers.get("referer"), 240),
    userAgent: sanitizeText(headers.get("user-agent"), 240),
  });
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : null;
}

function sanitizePath(value: unknown) {
  const path = stringValue(value);

  if (!path || !path.startsWith("/") || path.startsWith("//")) {
    return null;
  }

  return path.slice(0, 240);
}

function sanitizeSlug(value: unknown) {
  const slug = stringValue(value);

  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return undefined;
  }

  return slug.slice(0, 80);
}

function sanitizeText(value: unknown, maxLength: number) {
  const text = stringValue(value);

  if (!text) {
    return undefined;
  }

  return text.replace(/[\r\n\t]+/g, " ").slice(0, maxLength);
}

function sanitizeTimestamp(value: unknown) {
  const timestamp = stringValue(value);

  if (!timestamp) {
    return undefined;
  }

  const parsed = new Date(timestamp);

  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toISOString();
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}

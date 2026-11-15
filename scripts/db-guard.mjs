// Production database guard shared by scripts/vercel-build.mjs and scripts/seed-preview.ts.
//
// Matching is by Neon endpoint id, not by full hostname. A Neon host looks like
//   <endpoint-id>[-pooler].<region>.aws.neon.tech
// so the endpoint id is the first DNS label with any "-pooler" suffix removed. That makes
// the pooled and the direct (unpooled) host of one compute endpoint compare equal.
//
// Hostnames are not secrets, but this module still never logs a URL or a hostname.

/**
 * Neon endpoint id(s) of the PRODUCTION database (e.g. "ep-example-name-a1b2c3d4").
 * Host only: never put a connection string, user or password here.
 * Additional ids can be supplied through WIKI_PRODUCTION_DB_ENDPOINTS (comma-separated).
 */
/** @type {string[]} */
export const PRODUCTION_DB_ENDPOINT_IDS = [];

/** Every env var that can carry a database host for this app. */
export const DATABASE_HOST_VARS = [
  "DATABASE_URL_UNPOOLED",
  "DATABASE_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NO_SSL",
  "PGHOST_UNPOOLED",
  "PGHOST",
];

/**
 * Normalizes a hostname, URL or endpoint id to its Neon endpoint id (lowercase, no "-pooler").
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
export function endpointIdOf(value) {
  if (!value) return null;
  let host = String(value).trim();
  if (!host) return null;

  if (host.includes("://")) {
    try {
      host = new URL(host).hostname;
    } catch {
      return null;
    }
  }

  const label = host.toLowerCase().split(".")[0];
  if (!label) return null;
  return label.endsWith("-pooler") ? label.slice(0, -"-pooler".length) : label;
}

/** @param {Record<string, string | undefined>} [env] */
export function productionEndpointIds(env = process.env) {
  const fromEnv = (env.WIKI_PRODUCTION_DB_ENDPOINTS ?? "").split(",");
  return [...new Set([...PRODUCTION_DB_ENDPOINT_IDS, ...fromEnv].map(endpointIdOf).filter(Boolean))];
}

/** The URL migrations and the seed use on preview: unpooled first, then DATABASE_URL, then the legacy direct URL. */
/** @param {Record<string, string | undefined>} [env] */
export function previewTargetUrl(env = process.env) {
  return env.DATABASE_URL_UNPOOLED || env.DATABASE_URL || env.POSTGRES_URL_NON_POOLING || null;
}

/**
 * Decides whether the configured database is safe to treat as a non-production target.
 * Returns { ok: true } or { ok: false, reason } with a reason that never contains a host or URL.
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function checkNonProductionTarget(env = process.env) {
  const target = previewTargetUrl(env);
  if (!target) return { ok: false, reason: "no database URL is set (DATABASE_URL_UNPOOLED, DATABASE_URL, POSTGRES_URL_NON_POOLING)" };
  if (!endpointIdOf(target)) return { ok: false, reason: "the database URL could not be parsed" };

  const production = productionEndpointIds(env);
  if (production.length === 0) {
    return { ok: false, reason: "the production endpoint id is not configured, so the target cannot be proven non-production" };
  }

  for (const name of DATABASE_HOST_VARS) {
    const value = env[name];
    if (!value) continue;
    const id = endpointIdOf(value);
    if (id && production.includes(id)) {
      return { ok: false, reason: `${name} points at the production database endpoint` };
    }
  }

  return { ok: true };
}

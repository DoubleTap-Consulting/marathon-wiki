/** Classes allowed on cron summary log lines. Never put a raw exception message here. */
export const CRON_ERROR_CLASSES = ["fetch_failed", "db_error", "timeout", "no_enabled_tenants", "unknown"] as const;
export type CronErrorClass = (typeof CRON_ERROR_CLASSES)[number];

function haystack(error: unknown) {
  if (error instanceof Error) return `${error.name} ${error.message}`.toLowerCase();
  return String(error).toLowerCase();
}

/**
 * Maps a thrown value to a short class for cron stdout. Uses the message only
 * to pick a bucket; the returned string is never the message itself.
 */
export function classifyCronError(error: unknown): CronErrorClass {
  if (error === "no_enabled_tenants") return "no_enabled_tenants";
  const name = error instanceof Error ? error.name : "";
  const hay = haystack(error);
  if (name === "TimeoutError" || name === "AbortError" || hay.includes("timeout") || hay.includes("timed out") || hay.includes("aborted")) {
    return "timeout";
  }
  if (
    hay.includes("fetch") ||
    hay.includes("enotfound") ||
    hay.includes("econnreset") ||
    hay.includes("econnrefused") ||
    hay.includes("eai_again") ||
    hay.includes("socket") ||
    hay.includes("network")
  ) {
    return "fetch_failed";
  }
  if (hay.includes("postgres") || hay.includes("database") || hay.includes("kysely") || hay.includes("prisma") || hay.includes("neon")) {
    return "db_error";
  }
  return "unknown";
}

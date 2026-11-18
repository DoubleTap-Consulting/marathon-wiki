/**
 * What the article strip says about source freshness. Only what is true now: the latest time any
 * cited source was read (its snapshot fetch, a generation/paraphrase load, a later re-fetch check,
 * or the committed sources.manifest.json fetch date when the DB row has none). Without one, the
 * strip says the date is unknown, and mentions the daily re-check only when that job is switched on.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type SourceCheck = { kind: "checked"; at: string } | { kind: "unknown"; dailyRefetch: boolean };

export function summarizeSourceCheck(
  times: Array<Date | string | null | undefined>,
  env: Partial<NodeJS.ProcessEnv> = process.env,
): SourceCheck {
  const latest = times
    .flatMap((value) => (value ? [new Date(value).getTime()] : []))
    .filter((time) => Number.isFinite(time))
    .reduce<number | null>((max, time) => (max === null || time > max ? time : max), null);
  if (latest !== null) return { kind: "checked", at: new Date(latest).toISOString() };
  return { kind: "unknown", dailyRefetch: env.WIKI_SOURCE_REFETCH_CRON === "1" };
}

type ManifestEntry = { sourceKey?: string; fetchedAt?: string };

/** Fetch dates from the committed generation manifest, used when DB rows have no retrieved_at. */
export function manifestCheckTimes(tenantSlug: string, sourceKeys: string[], root = process.cwd()): string[] {
  if (sourceKeys.length === 0) return [];
  const wanted = new Set(sourceKeys);
  try {
    const raw = readFileSync(join(root, "content", tenantSlug, "generated", "sources.manifest.json"), "utf8");
    const entries = JSON.parse(raw) as ManifestEntry[];
    if (!Array.isArray(entries)) return [];
    return entries.flatMap((entry) =>
      entry.sourceKey && wanted.has(entry.sourceKey) && entry.fetchedAt ? [entry.fetchedAt] : [],
    );
  } catch {
    return [];
  }
}

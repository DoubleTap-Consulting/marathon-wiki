/**
 * What the article strip says about source freshness. Only what is true now: the latest time any
 * cited source was read (its snapshot fetch or a later re-fetch check). Without one, the strip says
 * the date is unknown, and mentions the daily re-check only when that job is switched on.
 */
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

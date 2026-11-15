import { describe, expect, it } from "vitest";

import { summarizeSourceCheck } from "./source-check";

describe("summarizeSourceCheck", () => {
  it("reports the latest time any cited source was read", () => {
    expect(summarizeSourceCheck(["2026-11-14T10:00:00.000Z", new Date("2026-11-15T21:50:00.000Z"), null, "not a date"])).toEqual({
      kind: "checked",
      at: "2026-11-15T21:50:00.000Z",
    });
  });

  it("says the date is unknown, and mentions the daily re-check only when that job is on", () => {
    expect(summarizeSourceCheck([], {})).toEqual({ kind: "unknown", dailyRefetch: false });
    expect(summarizeSourceCheck([null], { WIKI_SOURCE_REFETCH_CRON: "1" })).toEqual({ kind: "unknown", dailyRefetch: true });
  });
});

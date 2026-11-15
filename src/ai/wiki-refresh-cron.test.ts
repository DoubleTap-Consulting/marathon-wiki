import { describe, expect, it } from "vitest";

import { isAiRefreshCronRequestAuthorized } from "./wiki-refresh-cron";

describe("isAiRefreshCronRequestAuthorized", () => {
  const request = new Request("https://example.test/api/cron/wiki-update", {
    headers: { authorization: "Bearer secret" },
  });

  it("allows the right secret on production once the AI editor cron is switched on", () => {
    expect(isAiRefreshCronRequestAuthorized(request, { VERCEL_ENV: "production", CRON_SECRET: "secret", WIKI_AI_EDITOR_CRON: "1" })).toBe(true);
  });

  it("stays off on production until WIKI_AI_EDITOR_CRON=1", () => {
    expect(isAiRefreshCronRequestAuthorized(request, { VERCEL_ENV: "production", CRON_SECRET: "secret" })).toBe(false);
  });

  it("refuses preview deployments even with the right secret", () => {
    expect(isAiRefreshCronRequestAuthorized(request, { VERCEL_ENV: "preview", CRON_SECRET: "secret" })).toBe(false);
  });
});

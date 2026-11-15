import { describe, expect, it } from "vitest";

import { isAiRefreshCronRequestAuthorized } from "./wiki-refresh-cron";

describe("isAiRefreshCronRequestAuthorized", () => {
  const request = new Request("https://example.test/api/cron/wiki-update", {
    headers: { authorization: "Bearer secret" },
  });

  it("allows the right secret on production", () => {
    expect(isAiRefreshCronRequestAuthorized(request, { VERCEL_ENV: "production", CRON_SECRET: "secret" })).toBe(true);
  });

  it("refuses preview deployments even with the right secret", () => {
    expect(isAiRefreshCronRequestAuthorized(request, { VERCEL_ENV: "preview", CRON_SECRET: "secret" })).toBe(false);
  });
});

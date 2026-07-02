import { describe, expect, it } from "vitest";

import {
  isWikiAnalyticsEnabled,
  sanitizeWikiAnalyticsEvent,
} from "./wiki-events";

describe("wiki analytics events", () => {
  it("is enabled by default and can be disabled by env", () => {
    expect(isWikiAnalyticsEnabled({})).toBe(true);
    expect(isWikiAnalyticsEnabled({ WIKI_ANALYTICS_ENABLED: "false" })).toBe(
      false,
    );
  });

  it("accepts only allowlisted event types and local paths", () => {
    expect(
      sanitizeWikiAnalyticsEvent({
        type: "page_view",
        path: "/marathon/weapons",
        tenantSlug: "marathon",
        pageSlug: "weapons",
      }),
    ).toEqual({
      type: "page_view",
      path: "/marathon/weapons",
      tenantSlug: "marathon",
      pageSlug: "weapons",
    });

    expect(
      sanitizeWikiAnalyticsEvent({
        type: "admin_login",
        path: "/marathon",
      }),
    ).toBeNull();
    expect(
      sanitizeWikiAnalyticsEvent({
        type: "page_view",
        path: "https://example.com/marathon",
      }),
    ).toBeNull();
  });

  it("strips invalid slugs and normalizes timestamps", () => {
    expect(
      sanitizeWikiAnalyticsEvent({
        type: "premium_cta",
        path: "/marathon",
        tenantSlug: "marathon<script>",
        label: "Premium\nCTA",
        clientTimestamp: "2026-07-02T12:00:00-04:00",
      }),
    ).toEqual({
      type: "premium_cta",
      path: "/marathon",
      label: "Premium CTA",
      clientTimestamp: "2026-07-02T16:00:00.000Z",
    });
  });
});

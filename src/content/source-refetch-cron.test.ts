import { describe, expect, it } from "vitest";

import { formatSourceRefetchCronLog, runSourceRefetchCron } from "@/src/content/source-refetch-cron";
import type { SourceRecord } from "@/src/content/pipeline";

const tenants = [
  { id: "tenant-gta6", slug: "gta6" },
  { id: "tenant-marathon", slug: "marathon" },
];

function fakeRefetch(label: string, changed = 0, queued = 0) {
  return async (input: { tenantId: string; sources?: SourceRecord[] }) => {
    return {
      results: [
        ...Array.from({ length: changed }, (_, index) => ({ sourceKey: `${label}-changed-${index}`, outcome: "changed" as const })),
        ...Array.from({ length: Math.max((input.sources?.length ?? 0) - changed, 0) }, (_, index) => ({
          sourceKey: `${label}-unchanged-${index}`,
          outcome: "unchanged" as const,
        })),
      ],
      queued: Array.from({ length: queued }, (_, index) => ({
        id: `${label}-q-${index}`,
        tenantId: input.tenantId,
        pageId: null,
        targetSlug: `${label}-page-${index}`,
        pageTitle: "hidden from the log",
        reason: "source_update",
        source: "snapshot_hash",
        status: "queued" as const,
        scheduledFor: new Date(),
        attempts: 0,
        dedupeKey: `${label}-${index}`,
        lastError: null,
        errorMetadata: null,
        metadata: { sourceKey: "secret-key", text: "secret source text" },
        processedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    };
  };
}

describe("runSourceRefetchCron", () => {
  it("checks Marathon first, then GTA 6, logs counts only, and does not log keys or page content", async () => {
    const order: string[] = [];
    const lines: string[] = [];
    const gta6SourcesChecked: number[] = [];
    const { ok, summary } = await runSourceRefetchCron({
      db: {} as never,
      env: { VERCEL_ENV: "preview" },
      tenants,
      log: (line) => lines.push(line),
      refetch: async (input) => {
        order.push(input.tenantId);
        if (input.tenantId === "tenant-gta6") gta6SourcesChecked.push(input.sources?.length ?? 0);
        return fakeRefetch(input.tenantId, input.tenantId === "tenant-gta6" ? 1 : 2, input.tenantId === "tenant-gta6" ? 3 : 4)(input);
      },
      checkFeed: async ({ tenantId }) => {
        order.push(`feed:${tenantId}`);
        return { ok: true, newPosts: [{ title: "should not appear in the log", url: "https://example.test", publishedAt: null }] };
      },
    });

    expect(ok).toBe(true);
    expect(order).toEqual(["tenant-marathon", "feed:tenant-marathon", "tenant-gta6"]);
    expect(gta6SourcesChecked[0]).toBeGreaterThan(0);
    expect(summary.tenants.map((row) => row.slug)).toEqual(["marathon", "gta6"]);
    expect(summary.changedSources).toBe(3);
    expect(summary.queuedItems).toBe(7);
    expect(summary.spend).toBe(0);
    expect(summary.tenants[0]?.feedOk).toBe(true);
    expect(summary.tenants[1]?.feedOk).toBeNull();

    expect(lines).toHaveLength(1);
    const logged = JSON.parse(lines[0]) as typeof summary;
    expect(logged).toEqual(summary);
    const raw = lines[0];
    expect(raw).not.toMatch(/secret-key|secret source text|should not appear|hidden from the log|gta6-page|sourceKey/);
    expect(formatSourceRefetchCronLog(summary)).toBe(lines[0]);
  });

  it("skips GTA 6 in production until GTA6_ENABLED=1", async () => {
    const seen: string[] = [];
    const { summary } = await runSourceRefetchCron({
      db: {} as never,
      env: { VERCEL_ENV: "production" },
      tenants,
      log: () => undefined,
      refetch: async (input) => {
        seen.push(input.tenantId);
        return fakeRefetch(input.tenantId)(input);
      },
      checkFeed: async () => ({ ok: true, newPosts: [] }),
    });
    expect(seen).toEqual(["tenant-marathon"]);
    expect(summary.tenants.map((row) => row.slug)).toEqual(["marathon"]);
  });
});

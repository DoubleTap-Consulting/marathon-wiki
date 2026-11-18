import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const processDue = vi.fn();
const enqueueEvents = vi.fn();

vi.mock("@/src/ai/wiki-refresh-queue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/ai/wiki-refresh-queue")>();
  return {
    ...actual,
    processDueAiRefreshQueueItems: (...args: never[]) => processDue(...args),
    enqueueUpcomingEventRefreshes: (...args: never[]) => enqueueEvents(...args),
  };
});

vi.mock("@/src/sources/wiki-source-discovery", () => ({
  runWikiSourceDiscovery: vi.fn(),
}));

vi.mock("@/src/sources/wiki-source-ingestion", () => ({
  runCuratedWikiSourceIngestion: vi.fn(),
}));

vi.mock("@/src/wiki/cache", () => ({
  revalidateWikiPage: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const secretUrl = "https://api.example.test/v1/sources?token=wd_fake_secret_do_not_log_9f3c";
const fakeKey = "wd_fake_secret_do_not_log_9f3c";

describe("wiki-update HTTP JSON error field", () => {
  const envKeys = ["VERCEL_ENV", "WIKI_CRON_SECRET", "CRON_SECRET", "WIKI_AI_EDITOR_CRON"] as const;
  const previous: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const key of envKeys) {
      previous[key] = process.env[key];
    }
    delete process.env.VERCEL_ENV;
    delete process.env.WIKI_CRON_SECRET;
    delete process.env.CRON_SECRET;
    processDue.mockReset();
    enqueueEvents.mockReset();
    enqueueEvents.mockResolvedValue({ discoveredCount: 0, enqueued: [] });
    processDue.mockResolvedValue({
      processed: [],
      failed: [
        {
          item: {
            id: "item-1",
            targetSlug: "release-date",
            attempts: 1,
            status: "failed",
          },
          error: `Failed to fetch ${secretUrl} with key ${fakeKey}`,
        },
      ],
      skipped: null,
      spendUsd: 0,
    });
  });

  afterEach(() => {
    for (const key of envKeys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("returns a failure class only, never a URL or key from the thrown message", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/cron/wiki-update"));
    expect(response.status).toBe(200);
    const body = await response.json();
    const raw = JSON.stringify(body);
    expect(raw).not.toContain(secretUrl);
    expect(raw).not.toContain("https://");
    expect(raw).not.toContain(fakeKey);
    expect(raw).not.toContain("api.example.test");
    expect(body.process.failed).toEqual([
      {
        id: "item-1",
        targetSlug: "release-date",
        attempts: 1,
        status: "failed",
        error: "fetch_failed",
      },
    ]);
  });
});

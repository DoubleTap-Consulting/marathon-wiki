import { afterAll, beforeAll, describe, expect, it } from "vitest";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI can provide DATABASE_URL directly.
}

import { loadRenderedSnapshots, upsertRenderedSnapshots } from "./editor-store";
import type { PageSpec, SourceRecord } from "./pipeline";
import { checkBungieNewsFeed, extractReadableText, manualSources, parseRssItems, refetchPlan, refetchSources, uncoveredFeedPosts } from "./source-refetch";
import { getDb } from "@/src/db/client";
import { listSourceCheckTimes } from "@/src/db/wiki";

const paragraph = (text: string) => `<p>${text} ${"Runners extract loot from Tau Ceti IV and sell it to factions. ".repeat(14)}</p>`;
const page = (body: string) =>
  `<html><head><script>window.x=1</script><style>p{}</style></head><body><nav>Home | Guides</nav><article><h1>Marathon weapons</h1>${body}</article><footer>Footer links</footer></body></html>`;

describe("refetchPlan", () => {
  it("leaves bungie.net articles to the manual render and fetches everything else", () => {
    expect(refetchPlan({ url: "https://www.bungie.net/7/en/News/article/marathon-update-1-1-9-7" }).method).toBe("manual");
    expect(refetchPlan({ url: "https://allpatchnotes.com/g/marathon" }).method).toBe("manual");
    expect(refetchPlan({ url: "https://www.pcgamer.com/games/fps/marathon-review/" })).toEqual({ method: "http" });
    expect(refetchPlan({ url: "https://www.marathonthegame.com/" })).toEqual({ method: "http" });
  });
});

describe("extractReadableText", () => {
  it("keeps the article text, one block per line, without scripts, navigation or footer", () => {
    const text = extractReadableText(page(`${paragraph("The M77 uses Light Rounds.")}<table><tr><td>M77</td><td>Light Rounds</td></tr></table>`));
    expect(text.split("\n").slice(0, 2)).toEqual(["Marathon weapons", expect.stringContaining("The M77 uses Light Rounds.")]);
    expect(text).toContain("M77\nLight Rounds");
    expect(text).not.toMatch(/window\.x|Home \| Guides|Footer links/);
  });

  it("decodes entities", () => {
    expect(extractReadableText("<article><p>Marathon&#8217;s &amp; Bungie&rsquo;s</p></article>")).toBe("Marathon\u2019s & Bungie\u2019s");
  });
});

describe("parseRssItems", () => {
  it("reads title, absolute link and date from each item", () => {
    const xml = `<rss><channel><item><title>Marathon Update 1.1.9.7</title><link>/7/en/News/Article/marathon-update-1-1-9-7</link><pubDate>Tue, 10 Nov 2026 17:00:00 GMT</pubDate></item><item><title>This Week in Destiny &#8211; 11/12</title><link>https://www.bungie.net/7/en/News/Article/twid</link><pubDate>nope</pubDate></item></channel></rss>`;
    expect(parseRssItems(xml)).toEqual([
      { title: "Marathon Update 1.1.9.7", url: "https://www.bungie.net/7/en/News/Article/marathon-update-1-1-9-7", publishedAt: "2026-11-10T17:00:00.000Z" },
      { title: "This Week in Destiny \u2013 11/12", url: "https://www.bungie.net/7/en/News/Article/twid", publishedAt: null },
    ]);
  });
});

describe("official posts not yet sourced", () => {
  it("lists feed posts no registry source covers, whatever the URL's locale, without Destiny posts", () => {
    const items = [
      { title: "Marathon Update 1.1.9.7", url: "https://www.bungie.net/7/en/News/Article/marathon-update-1-1-9-7", publishedAt: null },
      { title: "Marathon Update 1.1.9.6", url: "https://www.bungie.net/7/en-us/News/Article/marathon-update-1-1-9-6/", publishedAt: null },
      { title: "Destiny 2 Update 9.7.0.3", url: "https://www.bungie.net/7/en/News/Article/d2", publishedAt: null },
    ];
    const sources = [{ url: "https://www.bungie.net/7/en/News/Article/marathon-update-1-1-9-6" }];
    expect(uncoveredFeedPosts(items, sources).map((item) => item.title)).toEqual(["Marathon Update 1.1.9.7"]);
  });

  it("names every registry source the daily re-fetch cannot read", () => {
    const manual = manualSources();
    expect(manual.length).toBe(17);
    expect(manual.every(({ source }) => refetchPlan(source).method === "manual")).toBe(true);
  });
});

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for the source re-fetch tests.");
}

describe.sequential("refetchSources on a throwaway wiki", () => {
  const db = getDb();
  const runId = `refetch_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const gameId = `${runId}_game`;
  const tenantId = `${runId}_tenant`;
  const tenantSlug = runId.replaceAll("_", "-");
  const now = new Date("2031-02-01T08:00:00.000Z");
  const source = (sourceKey: string, url: string): SourceRecord => ({
    sourceKey,
    sourceId: `src_${sourceKey}`,
    sourceType: "press",
    authorityTier: "reputable_editorial",
    authorityScore: 70,
    title: sourceKey,
    publisher: "Example",
    url,
    publishedDate: null,
  });
  const sources = [
    source("static-guide", "https://guides.example.test/marathon-weapons"),
    source("shell-page", "https://app.example.test/marathon"),
    source("bungie-article", "https://www.bungie.net/7/en/News/Article/marathon-update-1-1-9-7"),
  ];
  const specs = [{ slug: "weapons-drill", title: "Weapons Drill", preferredSources: ["static-guide"] } as PageSpec];
  let guideHtml = page(paragraph("The M77 uses Light Rounds."));
  const requested: string[] = [];
  const fetchImpl = (async (input: string | URL) => {
    const url = String(input);
    requested.push(url);
    if (url.includes("guides.example.test")) return new Response(guideHtml, { status: 200 });
    if (url.includes("app.example.test")) return new Response("<html><body><div id=root></div></body></html>", { status: 200 });
    if (url.includes("/en/rss/News")) {
      return new Response(
        `<rss><channel><item><title>Marathon Update 1.1.9.7</title><link>https://www.bungie.net/7/en/News/Article/marathon-update-1-1-9-7</link><pubDate>Tue, 10 Nov 2026 17:00:00 GMT</pubDate></item><item><title>Marathon Update 1.2.0.0</title><link>https://www.bungie.net/7/en/News/Article/marathon-update-1-2-0-0</link><pubDate>Tue, 1 Dec 2026 17:00:00 GMT</pubDate></item><item><title>Destiny 2 Update 9.7.0.3</title><link>https://www.bungie.net/7/en/News/Article/d2</link><pubDate>Tue, 1 Dec 2026 17:00:00 GMT</pubDate></item></channel></rss>`,
        { status: 200 },
      );
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  beforeAll(async () => {
    await db.insertInto("games").values({ id: gameId, slug: `${tenantSlug}-game`, title: "Marathon", franchise: "Marathon", developer: null, publisher: null, release_date: null, metadata: null }).execute();
    await db.insertInto("tenants").values({ id: tenantId, game_id: gameId, slug: tenantSlug, name: "Refetch Drill Wiki", status: "active", primary_locale: "en" }).execute();
    // The box's headless render of the guide: different text (and hash) from what a plain fetch extracts.
    await upsertRenderedSnapshots({ tenantId, sources, snapshots: [{ sourceKey: "static-guide", text: "Rendered guide text with widgets.", sha256: "rendered-sha", fetchedAt: "2031-01-01T00:00:00.000Z" }] }, db);
  });

  afterAll(async () => {
    await db.deleteFrom("ai_refresh_queue_items").where("tenant_id", "=", tenantId).execute();
    await db.deleteFrom("wiki_sources").where("tenant_id", "=", tenantId).execute();
    await db.deleteFrom("tenants").where("id", "=", tenantId).execute();
    await db.deleteFrom("games").where("id", "=", gameId).execute();
    await db.destroy();
  });

  it("records a baseline for a rendered snapshot, never fetches bungie.net articles, and fails app shells", async () => {
    const { results, queued } = await refetchSources({ tenantId, sources, specs, fetchImpl, now }, db);
    expect(results).toEqual([
      { sourceKey: "static-guide", outcome: "baseline" },
      { sourceKey: "shell-page", outcome: "failed", reason: expect.stringMatching(/characters of text/) },
      { sourceKey: "bungie-article", outcome: "manual", reason: expect.stringMatching(/render in the browser/) },
    ]);
    expect(queued).toEqual([]);
    expect(requested.some((url) => url.includes("/7/en/News"))).toBe(false);
    const [snapshot] = await loadRenderedSnapshots(tenantId, db);
    expect(snapshot.text).toBe("Rendered guide text with widgets.");
  });

  it("only records the check time when the page has not changed", async () => {
    const later = new Date("2031-02-02T08:00:00.000Z");
    const { results, queued } = await refetchSources({ tenantId, sources: sources.slice(0, 1), specs, fetchImpl, now: later }, db);
    expect(results).toEqual([{ sourceKey: "static-guide", outcome: "unchanged" }]);
    expect(queued).toEqual([]);
    expect(await listSourceCheckTimes(tenantId, ["static-guide"], db)).toContainEqual(later);
    const [snapshot] = await loadRenderedSnapshots(tenantId, db);
    expect(snapshot.text).toBe("Rendered guide text with widgets.");
  });

  it("stores the new text and queues the pages that use the source when the page changes, once", async () => {
    guideHtml = page(paragraph("The M77 uses Light Rounds.") + paragraph("The V75 SCAR uses a Volt Battery."));
    const first = await refetchSources({ tenantId, sources: sources.slice(0, 1), specs, fetchImpl, now }, db);
    expect(first.results).toEqual([{ sourceKey: "static-guide", outcome: "changed" }]);
    expect(first.queued.map((item) => [item.targetSlug, item.reason])).toEqual([["weapons-drill", "source_update"]]);
    const [snapshot] = await loadRenderedSnapshots(tenantId, db);
    expect(snapshot.text).toContain("The V75 SCAR uses a Volt Battery.");

    const again = await refetchSources({ tenantId, sources: sources.slice(0, 1), specs, fetchImpl, now }, db);
    expect(again.results).toEqual([{ sourceKey: "static-guide", outcome: "unchanged" }]);
    expect(again.queued).toEqual([]);
    const items = await db.selectFrom("ai_refresh_queue_items").select(["target_slug"]).where("tenant_id", "=", tenantId).execute();
    expect(items).toEqual([{ target_slug: "weapons-drill" }]);
  });

  it("lists official posts no source covers, skipping Destiny posts, and reports each once", async () => {
    const first = await checkBungieNewsFeed({ tenantId, sources, fetchImpl, now }, db);
    expect(first).toEqual({ ok: true, newPosts: [expect.objectContaining({ title: "Marathon Update 1.2.0.0" })] });
    const again = await checkBungieNewsFeed({ tenantId, sources, fetchImpl, now }, db);
    expect(again).toEqual({ ok: true, newPosts: [] });
  });
});

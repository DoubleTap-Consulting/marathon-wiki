import { CONTENT_SOURCES } from "@/src/content/editor-store";
import { fetchBungieNewsFeed, manualSources, uncoveredFeedPosts, type FeedItem } from "@/src/content/source-refetch";
import { listSourceIngestTimes } from "@/src/db/wiki";

export type OfficialSourceGaps = {
  /** Sources the daily re-fetch cannot read, oldest ingest first. */
  manual: Array<{ sourceKey: string; title: string; url: string; lastIngestedAt: string | null }>;
  /** Bungie news posts no source covers, newest first, read from the live feed. */
  feed: { ok: true; posts: FeedItem[] } | { ok: false; error: string };
};

/** What an editor still has to bring in by hand: manual sources and uncovered official posts. */
export async function loadOfficialSourceGaps(tenantId: string, fetchImpl: typeof fetch = fetch): Promise<OfficialSourceGaps> {
  const manual = manualSources(CONTENT_SOURCES);
  const [ingested, feed] = await Promise.all([
    listSourceIngestTimes(tenantId, manual.map(({ source }) => source.sourceKey)),
    fetchBungieNewsFeed(fetchImpl),
  ]);
  return {
    manual: manual
      .map(({ source }) => ({ sourceKey: source.sourceKey, title: source.title, url: source.url, lastIngestedAt: ingested.get(source.sourceKey)?.toISOString() ?? null }))
      .sort((a, b) => (a.lastIngestedAt ?? "").localeCompare(b.lastIngestedAt ?? "")),
    feed: feed.ok
      ? { ok: true, posts: uncoveredFeedPosts(feed.items, CONTENT_SOURCES).sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "")) }
      : feed,
  };
}

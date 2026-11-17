/**
 * The daily source re-fetch: re-reads every source that a plain HTTP fetch can read, stores a new
 * snapshot when its text changed, and queues the pages that use it. bungie.net articles are
 * rendered in the browser, so they stay manual (headless render on the box, then `editor.ts
 * ingest`); the Bungie news RSS feed is checked instead, to list official posts no source covers.
 */
import { createHash } from "node:crypto";

import type { Kysely } from "kysely";
import { sql } from "kysely";

import { CONTENT_SOURCES, snapshotRowId, upsertRenderedSnapshots, type SnapshotChange } from "./editor-store";
import { enqueueSourceChangeRefreshes } from "./editor-triggers";
import type { PageSpec, SourceRecord } from "./pipeline";
import type { AiRefreshQueueItem } from "@/src/ai/wiki-refresh-queue";
import { getDb } from "@/src/db/client";
import type { DB } from "@/src/db/types";

export const BUNGIE_NEWS_FEED_URL = "https://www.bungie.net/en/rss/News";
const USER_AGENT = "MarathonWikiSourceRefetch/1.0 (+https://wikiden.gg)";
/** A page that extracts to less text than this is an app shell or a bot wall, not the article. */
const MIN_TEXT_CHARS = 800;

export type FetchPlan = { method: "http" } | { method: "manual"; reason: string };

/** How each source can be re-read without a browser. */
export function refetchPlan(source: Pick<SourceRecord, "url">): FetchPlan {
  const url = new URL(source.url);
  if (url.hostname === "www.bungie.net" && url.pathname.startsWith("/7/")) {
    return {
      method: "manual",
      reason: "bungie.net articles render in the browser (plain HTML is an app shell) and the Bungie content API needs an X-API-Key",
    };
  }
  if (url.hostname === "allpatchnotes.com") {
    return { method: "manual", reason: "allpatchnotes.com builds its page in the browser (plain HTML has about 100 characters of text)" };
  }
  return { method: "http" };
}

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", rsquo: "\u2019", lsquo: "\u2018", rdquo: "\u201d", ldquo: "\u201c", mdash: "\u2014", ndash: "\u2013", hellip: "\u2026" };

function decodeEntities(text: string) {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match);
}

/**
 * The article text of a static HTML page, one block per line: the largest <article> (else <main>,
 * else <body>), without scripts, navigation, forms or other chrome. Deterministic, so an unchanged
 * page always hashes the same.
 */
export function extractReadableText(html: string) {
  let page = html.replace(/<!--[\s\S]*?-->/g, " ");
  for (const tag of ["script", "style", "noscript", "svg", "nav", "footer", "aside", "form", "iframe", "template", "button"]) {
    page = page.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, "gi"), " ");
  }
  const articles = [...page.matchAll(/<article\b[\s\S]*?<\/article>/gi)].map((match) => match[0]).sort((a, b) => b.length - a.length);
  const region = articles[0] ?? page.match(/<main\b[\s\S]*?<\/main>/i)?.[0] ?? page.match(/<body\b[\s\S]*<\/body>/i)?.[0] ?? page;
  const text = region
    .replace(/<(br|\/p|\/h[1-6]|\/li|\/div|\/tr|\/td|\/th|\/section|\/header|\/blockquote|\/figcaption)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function sha256(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

export type FetchedSource = { ok: true; text: string; sha256: string; httpStatus: number } | { ok: false; error: string };

export async function fetchSourceText(url: string, fetchImpl: typeof fetch = fetch): Promise<FetchedSource> {
  try {
    const response = await fetchImpl(url, { cache: "no-store", redirect: "follow", headers: { accept: "text/html", "user-agent": USER_AGENT }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    const text = extractReadableText(await response.text());
    if (text.length < MIN_TEXT_CHARS) return { ok: false, error: `only ${text.length} characters of text (an app shell or a bot check)` };
    return { ok: true, text, sha256: sha256(text), httpStatus: response.status };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export type RefetchOutcome =
  | { sourceKey: string; outcome: "unchanged" | "baseline" | "new" | "changed" }
  | { sourceKey: string; outcome: "manual" | "failed"; reason: string };

type SnapshotMetadata = { sha256?: string | null; fetchMethod?: string; httpSha256?: string | null };

/**
 * Re-fetches each static source and compares the extracted text's hash with the last HTTP fetch:
 * - no stored snapshot: the fetched text becomes the snapshot ("new", nothing queued);
 * - a rendered snapshot never fetched over HTTP: the hash is recorded as a baseline, the rendered
 *   text stays, and nothing is queued (the two methods extract different text, so their hashes
 *   are not comparable);
 * - a different hash: the fetched text becomes the snapshot and every page using it is queued.
 * Idempotent: a second run with the same pages only records the check time and queues nothing.
 */
export async function refetchSources(
  input: { tenantId: string; sources?: SourceRecord[]; specs?: PageSpec[]; fetchImpl?: typeof fetch; now?: Date },
  db: Kysely<DB> = getDb(),
): Promise<{ results: RefetchOutcome[]; queued: AiRefreshQueueItem[] }> {
  const now = input.now ?? new Date();
  const results: RefetchOutcome[] = [];
  const changes: SnapshotChange[] = [];
  for (const source of input.sources ?? CONTENT_SOURCES) {
    const plan = refetchPlan(source);
    if (plan.method === "manual") {
      results.push({ sourceKey: source.sourceKey, outcome: "manual", reason: plan.reason });
      continue;
    }
    const fetched = await fetchSourceText(source.url, input.fetchImpl);
    if (!fetched.ok) {
      results.push({ sourceKey: source.sourceKey, outcome: "failed", reason: fetched.error });
      continue;
    }
    const id = snapshotRowId(input.tenantId, source.sourceKey);
    const row = await db.selectFrom("wiki_sources").select(["metadata"]).where("id", "=", id).executeTakeFirst();
    const stored = (row?.metadata ?? null) as SnapshotMetadata | null;
    const lastHttp = stored?.fetchMethod === "http" ? stored.sha256 : stored?.httpSha256;
    if (row && !lastHttp) {
      await db
        .updateTable("wiki_sources")
        .set({ metadata: sql`coalesce(metadata, '{}'::jsonb) || ${JSON.stringify({ httpSha256: fetched.sha256, httpCheckedAt: now.toISOString() })}::jsonb` })
        .where("id", "=", id)
        .execute();
      results.push({ sourceKey: source.sourceKey, outcome: "baseline" });
      continue;
    }
    if (row && lastHttp === fetched.sha256) {
      // Only the check time moves, so the article strip can say when its sources were last checked.
      await db
        .updateTable("wiki_sources")
        .set({ metadata: sql`coalesce(metadata, '{}'::jsonb) || ${JSON.stringify({ httpCheckedAt: now.toISOString() })}::jsonb` })
        .where("id", "=", id)
        .execute();
      results.push({ sourceKey: source.sourceKey, outcome: "unchanged" });
      continue;
    }
    const [change] = await upsertRenderedSnapshots(
      { tenantId: input.tenantId, snapshots: [{ sourceKey: source.sourceKey, text: fetched.text, sha256: fetched.sha256, fetchedAt: now.toISOString(), fetchMethod: "http" }], sources: input.sources },
      db,
    );
    changes.push(change);
    results.push({ sourceKey: source.sourceKey, outcome: change.kind === "changed" ? "changed" : "new" });
  }
  const queued = await enqueueSourceChangeRefreshes({ tenantId: input.tenantId, changes, now, specs: input.specs }, db);
  return { results, queued };
}

// ---------------------------------------------------------------------------
// Bungie news feed

export type FeedItem = { title: string; url: string; publishedAt: string | null };

export function parseRssItems(xml: string, base = "https://www.bungie.net"): FeedItem[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].flatMap(([, item]) => {
    const field = (name: string) => decodeEntities(item.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`))?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim() ?? "");
    const title = field("title");
    const link = field("link");
    if (!title || !link) return [];
    const date = new Date(field("pubDate"));
    return [{ title, url: new URL(link, base).toString(), publishedAt: Number.isNaN(date.getTime()) ? null : date.toISOString() }];
  });
}

function articleKey(url: string) {
  return new URL(url).pathname.toLowerCase().replace(/^\/7\/en(-us)?\//, "/").replace(/\/$/, "");
}

/** Reads the Bungie news RSS feed. */
export async function fetchBungieNewsFeed(fetchImpl: typeof fetch = fetch): Promise<{ ok: true; items: FeedItem[] } | { ok: false; error: string }> {
  try {
    const response = await fetchImpl(BUNGIE_NEWS_FEED_URL, { cache: "no-store", headers: { accept: "application/rss+xml", "user-agent": USER_AGENT }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    return { ok: true, items: parseRssItems(await response.text()) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Feed posts that are not Destiny posts and that no source in the registry covers. */
export function uncoveredFeedPosts(items: FeedItem[], sources: Array<Pick<SourceRecord, "url">> = CONTENT_SOURCES) {
  const known = new Set(sources.flatMap((source) => (source.url.includes("bungie.net") ? [articleKey(source.url)] : [])));
  return items.filter((item) => !/destiny/i.test(item.title) && !known.has(articleKey(item.url)));
}

/** Sources that the daily re-fetch cannot read, so an editor re-ingests them by hand. */
export function manualSources(sources: SourceRecord[] = CONTENT_SOURCES) {
  return sources.flatMap((source) => {
    const plan = refetchPlan(source);
    return plan.method === "manual" ? [{ source, reason: plan.reason }] : [];
  });
}

/**
 * Official posts the wiki has no source for yet: Bungie news items that are not Destiny posts and
 * not already in the source registry. They are listed for an editor to render and add; their text
 * needs a browser, so nothing is generated from them automatically. Each item is reported once.
 */
export async function checkBungieNewsFeed(
  input: { tenantId: string; sources?: SourceRecord[]; fetchImpl?: typeof fetch; now?: Date },
  db: Kysely<DB> = getDb(),
): Promise<{ ok: true; newPosts: FeedItem[] } | { ok: false; error: string }> {
  const feed = await fetchBungieNewsFeed(input.fetchImpl);
  if (!feed.ok) return feed;
  const id = `feed_${input.tenantId}_bungie-news`;
  const row = await db.selectFrom("wiki_sources").select(["metadata"]).where("id", "=", id).executeTakeFirst();
  const seen = new Set(((row?.metadata ?? {}) as { seen?: string[] }).seen ?? []);
  const newPosts = uncoveredFeedPosts(feed.items, input.sources ?? CONTENT_SOURCES).filter((item) => !seen.has(item.url));
  if (newPosts.length || !row) {
    const metadata = JSON.stringify({ origin: "news_feed", feedUrl: BUNGIE_NEWS_FEED_URL, seen: [...seen, ...newPosts.map((item) => item.url)], checkedAt: (input.now ?? new Date()).toISOString() });
    await db
      .insertInto("wiki_sources")
      .values({ id, tenant_id: input.tenantId, page_id: null, source_key: "bungie-news-feed", source_type: "news_feed", title: "Bungie news RSS feed", url: BUNGIE_NEWS_FEED_URL, publisher: "Bungie", context_text: null, topic_slugs: [], retrieved_at: input.now ?? new Date(), metadata: sql`${metadata}::jsonb` })
      .onConflict((conflict) => conflict.column("id").doUpdateSet({ metadata: sql`${metadata}::jsonb`, retrieved_at: input.now ?? new Date(), updated_at: sql`CURRENT_TIMESTAMP` }))
      .execute();
  }
  return { ok: true, newPosts };
}

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI can provide DATABASE_URL directly.
}

import { getDb } from "@/src/db/client";
import { listWikiSourceContextForTopic } from "@/src/db/wiki";
import {
  buildDiscoveredWikiSourceKey,
  buildDiscoveredWikiSourceRowId,
  runWikiSourceDiscovery,
} from "@/src/sources/wiki-source-discovery";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for source discovery tests.");
}

describe.sequential("bounded wiki source discovery", () => {
  let db: ReturnType<typeof getDb>;
  const runId = `source_discovery_test_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}`;
  const gameId = `${runId}_game`;
  const tenantId = `${runId}_tenant`;
  const tenantSlug = runId.replaceAll("_", "-");
  const gameSlug = `${tenantSlug}-game`;
  const now = new Date("2026-07-06T14:00:00.000Z");

  beforeAll(async () => {
    db = getDb();

    await db
      .insertInto("games")
      .values({
        id: gameId,
        slug: gameSlug,
        title: "Marathon",
        franchise: "Marathon",
        developer: "Bungie",
        publisher: "Bungie",
        release_date: null,
        metadata: null,
      })
      .execute();

    await db
      .insertInto("tenants")
      .values({
        id: tenantId,
        game_id: gameId,
        slug: tenantSlug,
        name: "Source Discovery Test Wiki",
        status: "active",
        primary_locale: "en",
      })
      .execute();
  });

  afterAll(async () => {
    await db.deleteFrom("tenants").where("id", "=", tenantId).execute();
    await db.deleteFrom("games").where("id", "=", gameId).execute();
    await db.destroy();
  });

  it("upserts explicit candidate sources idempotently without provider calls", async () => {
    const candidateUrl = "https://example.com/marathon/factions-guide";
    const fetchImpl = vi.fn(async () => {
      throw new Error("explicit context should avoid fetch calls");
    }) as unknown as typeof fetch;

    const firstRun = await runWikiSourceDiscovery(
      {
        tenantSlug,
        topicSlug: "factions",
        query: "Marathon factions",
        candidates: [
          {
            title: "Marathon factions guide",
            url: candidateUrl,
            publisher: "Example Wiki",
            summary:
              "Arachne, Cyberacme, Nucaloric, Sekiguchi, Traxus, and MIDA are tracked as Marathon factions.",
            authorityTier: "community_wiki",
            authorityScore: 62,
          },
        ],
        now,
      },
      { db, fetchImpl },
    );
    const secondRun = await runWikiSourceDiscovery(
      {
        tenantSlug,
        topicSlug: "factions",
        query: "Marathon factions",
        candidates: [
          {
            title: "Marathon factions guide",
            url: candidateUrl,
            publisher: "Example Wiki",
            summary:
              "Updated source summary still references Arachne, Cyberacme, Nucaloric, Sekiguchi, Traxus, and MIDA.",
            authorityTier: "community_wiki",
            authorityScore: 64,
          },
        ],
        now: new Date("2026-07-07T14:00:00.000Z"),
      },
      { db, fetchImpl },
    );
    const rows = await db
      .selectFrom("wiki_sources")
      .select([
        "id",
        "source_key as sourceKey",
        "source_type as sourceType",
        "title",
        "url",
        "context_text as contextText",
        "topic_slugs as topicSlugs",
        "metadata",
      ])
      .where("tenant_id", "=", tenantId)
      .where("url", "=", candidateUrl)
      .execute();

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(firstRun).toMatchObject({
      tenantsProcessed: 1,
      providerUsed: null,
      candidatesDiscovered: 1,
      candidatesAttempted: 1,
      failed: [],
    });
    expect(secondRun.failed).toEqual([]);
    expect(secondRun.upserted.map((source) => source.id)).toEqual(
      firstRun.upserted.map((source) => source.id),
    );
    expect(rows).toEqual([
      expect.objectContaining({
        id: buildDiscoveredWikiSourceRowId(tenantId, "factions", candidateUrl),
        sourceKey: buildDiscoveredWikiSourceKey("factions", candidateUrl),
        sourceType: "discovered_reference",
        title: "Marathon factions guide",
        contextText: expect.stringContaining("Updated source summary"),
        topicSlugs: ["factions"],
        metadata: expect.objectContaining({
          origin: "source_discovery_candidate",
          discoveryQuery: "Marathon factions",
          discoveryProvider: "explicit_candidates",
          authorityTier: "community_wiki",
          authorityScore: 64,
          candidate: expect.objectContaining({
            explicitContextProvided: true,
          }),
        }),
      }),
    ]);
  });

  it("uses configured provider candidates with a strict per-run limit", async () => {
    const endpoint = "https://provider.example.test/wiki-source-discovery";
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(url.toString()).toBe(endpoint);
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        authorization: "Bearer discovery-token",
      });

      return Response.json({
        sources: [
          {
            title: "First provider source",
            url: "https://provider.example.test/first",
            summary: "First provider source context.",
            authorityScore: 70,
          },
          {
            title: "Second provider source",
            url: "https://provider.example.test/second",
            summary: "Second provider source context.",
            authorityScore: 69,
          },
          {
            title: "Third provider source",
            url: "https://provider.example.test/third",
            summary: "Third provider source context.",
            authorityScore: 68,
          },
        ],
      });
    }) as unknown as typeof fetch;

    const result = await runWikiSourceDiscovery(
      {
        tenantId,
        topicSlug: "provider-limit",
        query: "Marathon provider limit",
        limit: 2,
        now,
      },
      {
        db,
        fetchImpl,
        provider: {
          endpoint,
          token: "discovery-token",
        },
      },
    );
    const rows = await db
      .selectFrom("wiki_sources")
      .select(["title", "topic_slugs as topicSlugs"])
      .where("tenant_id", "=", tenantId)
      .where("source_type", "=", "discovered_reference")
      .where("url", "in", [
        "https://provider.example.test/first",
        "https://provider.example.test/second",
        "https://provider.example.test/third",
      ])
      .orderBy("title", "asc")
      .execute();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      providerUsed: endpoint,
      candidatesDiscovered: 3,
      candidatesAttempted: 2,
      failed: [],
    });
    expect(result.upserted).toHaveLength(2);
    expect(rows.map((row) => row.title)).toEqual([
      "First provider source",
      "Second provider source",
    ]);
  });

  it("fetches missing context once and exposes discovered sources to topic retrieval", async () => {
    const topicSlug = "phase-13-discovery";
    const candidateUrl = "https://example.com/marathon/cryo-archive";
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      expect(url.toString()).toBe(candidateUrl);

      return new Response(
        "<html><body><article>Cryo Archive coverage says Marathon runners are tracking factions and event clues for Phase 13 discovery.</article></body></html>",
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      );
    }) as unknown as typeof fetch;

    const result = await runWikiSourceDiscovery(
      {
        tenantId,
        topicSlug,
        candidates: [
          {
            title: "Phase 13 discovery source",
            url: candidateUrl,
            publisher: "Example News",
            authorityTier: "reputable_editorial",
            authorityScore: 81,
          },
        ],
        now,
      },
      { db, fetchImpl },
    );
    const sourceReferences = await listWikiSourceContextForTopic(
      {
        tenantId,
        targetSlug: topicSlug,
        pageTitle: "Phase 13 Discovery",
      },
      db,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.upserted).toEqual([
      expect.objectContaining({
        fetchedContext: true,
        sourceKey: buildDiscoveredWikiSourceKey(topicSlug, candidateUrl),
      }),
    ]);
    expect(sourceReferences).toEqual([
      expect.objectContaining({
        sourceKey: buildDiscoveredWikiSourceKey(topicSlug, candidateUrl),
        sourceType: "discovered_reference",
        title: "Phase 13 discovery source",
        publisher: "Example News",
        contextText: expect.stringContaining("Cryo Archive coverage"),
        topicSlugs: [topicSlug],
        metadata: expect.objectContaining({
          origin: "source_discovery_candidate",
          discoveryProvider: "explicit_candidates",
          authorityTier: "reputable_editorial",
          authorityScore: 81,
        }),
      }),
    ]);
  });
});

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI can provide DATABASE_URL directly.
}

import type { WikiActor } from "@/src/auth/wiki-auth";
import { getDb } from "@/src/db/client";
import {
  listWikiSourceContextForTopic,
  type WikiPageRevisionAiProvenance,
  type WikiTenant,
} from "@/src/db/wiki";
import {
  MARATHON_CURATED_SOURCE_REGISTRY,
  type CuratedWikiSource,
} from "@/src/sources/marathon-source-registry";
import {
  buildCuratedWikiSourceRowId,
  runCuratedWikiSourceIngestion,
} from "@/src/sources/wiki-source-ingestion";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for source ingestion tests.");
}

describe.sequential("curated wiki source ingestion", () => {
  let db: ReturnType<typeof getDb>;
  const runId = `source_ingestion_test_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}`;
  const gameId = `${runId}_game`;
  const tenantId = `${runId}_tenant`;
  const tenantSlug = runId.replaceAll("_", "-");
  const tenant: WikiTenant = {
    id: tenantId,
    slug: tenantSlug,
    name: "Source Ingestion Test Wiki",
    gameSlug: `${tenantSlug}-game`,
    gameTitle: "Marathon",
  };
  const testRegistry = MARATHON_CURATED_SOURCE_REGISTRY.map((source) => ({
    ...source,
    gameSlug: tenant.gameSlug,
  }));
  const actor: WikiActor = {
    id: "source-ingestion-test-worker",
    email: "source-ingestion@example.local",
    name: "Source Ingestion Test Worker",
    provider: "system",
  };
  const now = new Date("2026-07-05T16:00:00.000Z");

  beforeAll(async () => {
    db = getDb();

    await db
      .insertInto("games")
      .values({
        id: gameId,
        slug: tenant.gameSlug,
        title: tenant.gameTitle,
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
        name: tenant.name,
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

  it("fetches curated sources and upserts deduped authority-scored source records", async () => {
    const fetchImpl = buildFactionSourceFetch(testRegistry);

    const firstRun = await runCuratedWikiSourceIngestion(
      {
        tenantId,
        topicSlug: "factions",
        now,
      },
      {
        db,
        fetchImpl,
        registry: testRegistry,
      },
    );
    const secondRun = await runCuratedWikiSourceIngestion(
      {
        tenantId,
        topicSlug: "factions",
        now: new Date("2026-07-06T16:00:00.000Z"),
      },
      {
        db,
        fetchImpl,
        registry: testRegistry,
      },
    );
    const rows = await db
      .selectFrom("wiki_sources")
      .select([
        "id",
        "source_key as sourceKey",
        "source_type as sourceType",
        "title",
        "context_text as contextText",
        "topic_slugs as topicSlugs",
        "retrieved_at as retrievedAt",
        "metadata",
      ])
      .where("tenant_id", "=", tenantId)
      .where("metadata", "is not", null)
      .orderBy("source_key", "asc")
      .execute();

    expect(firstRun).toMatchObject({
      tenantsProcessed: 1,
      sourcesAttempted: testRegistry.length,
      failed: [],
    });
    expect(firstRun.upserted).toHaveLength(testRegistry.length);
    expect(secondRun.failed).toEqual([]);
    expect(secondRun.upserted.map((source) => source.id).sort()).toEqual(
      firstRun.upserted.map((source) => source.id).sort(),
    );
    expect(rows).toHaveLength(testRegistry.length);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: buildCuratedWikiSourceRowId(
            tenantId,
            "marathon-factions-pcgamer-guide",
          ),
          sourceType: "editorial_reference",
          contextText: expect.stringContaining("Arachne"),
          topicSlugs: expect.arrayContaining(["factions"]),
          metadata: expect.objectContaining({
            origin: "curated_source_ingestion",
            registrySourceId: "marathon-factions-pcgamer-guide",
            authorityTier: "reputable_editorial",
            authorityScore: 82,
            refreshCadenceDays: 7,
            extraction: expect.objectContaining({
              matchedTerms: expect.arrayContaining([
                "Arachne",
                "Cyberacme",
                "Sekiguchi",
                "Traxus",
                "MIDA",
              ]),
              usedFallbackContext: false,
            }),
          }),
        }),
      ]),
    );
  });

  it("retrieves ingested faction sources as topic context", async () => {
    const sourceReferences = await listWikiSourceContextForTopic(
      {
        tenantId,
        targetSlug: "factions",
        pageTitle: "Factions",
      },
      db,
    );

    expect(sourceReferences.map((source) => source.sourceKey)).toEqual([
      "marathon-factions-pcgamer-guide",
      "marathon-factions-techradar-launch-roadmap",
      "marathon-factions-gamesradar-cryo-archive",
    ]);
    expect(sourceReferences[0]).toMatchObject({
      publisher: "PC Gamer",
      metadata: expect.objectContaining({
        authorityTier: "reputable_editorial",
        authorityScore: 82,
      }),
    });
  });
});

function buildFactionSourceFetch(registry: CuratedWikiSource[]) {
  return vi.fn(async (url: RequestInfo | URL) => {
    const href = url.toString();
    const matchingSource = registry.find((source) => source.url === href);

    if (!matchingSource) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(
      `<html><body><article>${matchingSource.title}. Bungie revealed Arachne, Cyberacme, Nucaloric, NuCal, Sekiguchi, Traxus, MIDA, and Mida for Marathon faction coverage.</article></body></html>`,
      {
        status: 200,
        headers: { "content-type": "text/html" },
      },
    );
  }) as unknown as typeof fetch;
}

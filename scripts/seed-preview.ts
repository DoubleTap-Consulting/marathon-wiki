/**
 * SAMPLE DATA — PREVIEW / DEVELOPMENT DATABASES ONLY.
 *
 * Seeds AI revisions, provenance, sources and community notes on top of the
 * starter pages (prisma/seeds/marathon.sql) so the trust layer has something
 * realistic to render. Every row this script writes has an id starting with
 * `sample_`. Nothing here is a confirmed Marathon fact: bodies only restate what
 * the starter pages already say, and source titles are generic.
 *
 * Refuses to run unless ALL of these hold:
 *   - ALLOW_SAMPLE_SEED=1
 *   - VERCEL_ENV is not "production"
 *   - the target host is not WIKI_PRODUCTION_DB_HOST (when that is set)
 *   - the target database is marked as a preview database:
 *       COMMENT ON DATABASE <db> IS 'marathon-wiki:sample-preview';
 *     Production is never marked, so a mis-pointed DATABASE_URL fails closed.
 *
 * Usage: ALLOW_SAMPLE_SEED=1 DATABASE_URL=... node scripts/seed-preview.ts
 */
import { Pool } from "@neondatabase/serverless";

export const PREVIEW_DATABASE_MARKER = "marathon-wiki:sample-preview";

const DAY = 24 * 60 * 60 * 1000;

function fail(message: string): never {
  console.error(`seed-preview: refusing to run. ${message}`);
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (process.env.ALLOW_SAMPLE_SEED !== "1") fail("Set ALLOW_SAMPLE_SEED=1.");
if (process.env.VERCEL_ENV === "production") fail("VERCEL_ENV is production.");
if (!connectionString) fail("DATABASE_URL is not set.");

const targetHost = new URL(connectionString).hostname.replace("-pooler", "");
const productionHost = process.env.WIKI_PRODUCTION_DB_HOST?.trim().replace("-pooler", "");

if (productionHost && productionHost === targetHost) {
  fail("The target database host matches WIKI_PRODUCTION_DB_HOST.");
}

const pool = new Pool({ connectionString });
const marker = await pool.query(
  "select shobj_description(oid, 'pg_database') as comment from pg_database where datname = current_database()",
);

if (marker.rows[0]?.comment !== PREVIEW_DATABASE_MARKER) {
  await pool.end();
  fail(`The target database is not marked '${PREVIEW_DATABASE_MARKER}'.`);
}

const now = Date.now();
const at = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString();

type Source = {
  sourceId: string;
  sourceKey: string;
  sourceType: string;
  title: string;
  url: string | null;
  publisher: string | null;
  authorityTier: string;
  authorityScore: number;
  retrievedDaysAgo: number;
};

const SOURCES: Record<string, Source> = {
  site: {
    sourceId: "source_marathon_official_site",
    sourceKey: "marathon-official-site",
    sourceType: "official",
    title: "Official Marathon site",
    url: "https://www.marathonthegame.com/",
    publisher: "Bungie",
    authorityTier: "official",
    authorityScore: 95,
    retrievedDaysAgo: 3,
  },
  bungie: {
    sourceId: "source_marathon_bungie_page",
    sourceKey: "marathon-bungie-page",
    sourceType: "official",
    title: "Marathon at Bungie",
    url: "https://www.bungie.net/7/en/Marathon",
    publisher: "Bungie",
    authorityTier: "official",
    authorityScore: 92,
    retrievedDaysAgo: 3,
  },
  news: {
    sourceId: "sample_source_bungie_news",
    sourceKey: "bungie-news",
    sourceType: "patch_notes",
    title: "Bungie news and update notes",
    url: "https://www.bungie.net/7/en/News",
    publisher: "Bungie",
    authorityTier: "official",
    authorityScore: 90,
    retrievedDaysAgo: 4,
  },
  press: {
    sourceId: "sample_source_press_roundup",
    sourceKey: "press-roundup",
    sourceType: "press",
    title: "Marathon preview coverage roundup",
    url: null,
    publisher: "Editorial roundup",
    authorityTier: "reputable_editorial",
    authorityScore: 70,
    retrievedDaysAgo: 10,
  },
  community: {
    sourceId: "sample_source_community_thread",
    sourceKey: "community-thread",
    sourceType: "community",
    title: "Community discussion thread",
    url: null,
    publisher: "Community forum",
    authorityTier: "community",
    authorityScore: 35,
    retrievedDaysAgo: 5,
  },
};

type Claim = {
  claimText: string;
  status: "supported" | "unsupported" | "contradicted";
  sources: Source[];
  reason: string;
};

type Revision = {
  number: number;
  daysAgo: number;
  refreshReason: "scheduled_weekly" | "patch_notes" | "community_note";
  changeNote: string;
  body: string;
  sources: Source[];
  claims: Claim[];
};

const FACTIONS_V2 = `## Overview

Marathon is a sci-fi extraction shooter from Bungie.{{cite:marathon-official-site}} This page collects the factions and organizations that appear in its setting.

## How factions are documented

Each faction entry records its official name, its motives, and its relationships with other groups.{{cite:marathon-bungie-page}}`;

const FACTIONS_V3 = `## Overview

Marathon is a sci-fi extraction shooter from Bungie.{{cite:marathon-official-site}} This page collects the factions and organizations that appear in its setting.

## How factions are documented

Each faction entry records its official name, its motives, its relationships with other groups, and any gameplay implications tied to Marathon's setting.{{cite:marathon-bungie-page}}

## Source status

Official faction detail is still limited, so this page stays short on purpose. Patch notes and official news posts are checked weekly for new faction information.{{cite:bungie-news}}`;

const FACTIONS_V4 = `## Overview

Marathon is a sci-fi extraction shooter from Bungie.{{cite:marathon-official-site}} This page collects the factions and organizations that appear in its setting, as official sources name them.

## How factions are documented

Each faction entry records its official name, its motives, its relationships with other groups, and any gameplay implications tied to Marathon's setting.{{cite:marathon-bungie-page}}

Faction relationships are expected to shift as more of the setting is revealed.

### Naming

Names on this page follow the spelling used in official Bungie material. Community nicknames are noted only when a source documents them.

## Source status

Official faction detail is still limited, so this page stays short on purpose. Patch notes and official news posts are checked weekly for new faction information.{{cite:bungie-news}}

## What remains unconfirmed

Which factions players can align with, and whether alignment has gameplay effects, has not been confirmed by an official source.`;

const WEAPONS_V2 = `## Overview

Weapon pages on this wiki track archetypes, known names, damage behavior, perks, acquisition, and patch-sensitive changes once they are confirmed.{{cite:marathon-official-site}}

## Archetypes

Weapons are grouped by archetype first, then by name.`;

const WEAPONS_V3 = `## Overview

Weapon pages on this wiki track archetypes, known names, damage behavior, perks, acquisition, and patch-sensitive changes once they are confirmed.{{cite:marathon-official-site}}

## Archetypes

Weapons are grouped by archetype first, then by name. An archetype describes how a weapon is meant to be used rather than its exact numbers.

Damage values are listed only when patch notes publish them.{{cite:bungie-news}}

## Patch history

Balance changes are summarized here after each update, with a link to the patch notes that announced them.`;

const WEAPONS_V4 = `## Overview

Weapon pages on this wiki track archetypes, known names, damage behavior, perks, acquisition, and patch-sensitive changes once they are confirmed.{{cite:marathon-official-site}}

## Archetypes

Weapons are grouped by archetype first, then by name. An archetype describes how a weapon is meant to be used rather than its exact numbers. This page lists the complete weapon roster.

Damage values are listed only when patch notes publish them.{{cite:bungie-news}}

## Acquisition

How weapons are acquired has not been fully documented in official sources yet.

## Patch history

Balance changes are summarized here after each update, with a link to the patch notes that announced them.`;

const UNSUPPORTED_REASON = "None of the sources used for this page mention this yet.";

const PAGES: Array<{ pageId: string; slug: string; title: string; summary: string; revisions: Revision[] }> = [
  {
    pageId: "page_marathon_factions",
    slug: "factions",
    title: "Factions",
    summary: "The factions and organizations in Marathon's setting, and what official sources confirm about them.",
    revisions: [
      {
        number: 2,
        daysAgo: 26,
        refreshReason: "scheduled_weekly",
        changeNote: "Turned the starter text into an overview and explained how faction entries are recorded.",
        body: FACTIONS_V2,
        sources: [SOURCES.site, SOURCES.bungie],
        claims: [
          { claimText: "Marathon is a sci-fi extraction shooter from Bungie.", status: "supported", sources: [SOURCES.site], reason: "Matched against 1 source record." },
        ],
      },
      {
        number: 3,
        daysAgo: 12,
        refreshReason: "patch_notes",
        changeNote: "Added a Source status section after new update notes, and noted that faction entries cover gameplay implications.",
        body: FACTIONS_V3,
        sources: [SOURCES.site, SOURCES.bungie, SOURCES.news],
        claims: [
          { claimText: "Marathon is a sci-fi extraction shooter from Bungie.", status: "supported", sources: [SOURCES.site], reason: "Matched against 1 source record." },
          { claimText: "Patch notes and official news posts are checked weekly for new faction information.", status: "supported", sources: [SOURCES.news], reason: "Matched against 1 source record." },
        ],
      },
      {
        number: 4,
        daysAgo: 3,
        refreshReason: "community_note",
        changeNote: "A reader's note pointed out that names should follow official spelling, so a Naming section was added. One claim about faction names was held back because sources disagree.",
        body: FACTIONS_V4,
        sources: [SOURCES.site, SOURCES.bungie, SOURCES.news, SOURCES.press, SOURCES.community],
        claims: [
          { claimText: "Marathon is a sci-fi extraction shooter from Bungie.", status: "supported", sources: [SOURCES.site], reason: "Matched against 1 source record." },
          { claimText: "Names on this page follow the spelling used in official Bungie material.", status: "supported", sources: [SOURCES.bungie], reason: "Matched against 1 source record." },
          { claimText: "Patch notes and official news posts are checked weekly for new faction information.", status: "supported", sources: [SOURCES.news], reason: "Matched against 1 source record." },
          { claimText: "Faction relationships are expected to shift as more of the setting is revealed.", status: "unsupported", sources: [], reason: UNSUPPORTED_REASON },
          // Withheld: contradicted claims are never published, so this text is not in the body.
          { claimText: "Faction names are final for launch.", status: "contradicted", sources: [SOURCES.press, SOURCES.community], reason: "Sources disagree about whether names are final." },
        ],
      },
    ],
  },
  {
    pageId: "page_marathon_weapons",
    slug: "weapons",
    title: "Weapons",
    summary: "How this wiki documents Marathon weapons, archetypes and patch-sensitive changes.",
    revisions: [
      {
        number: 2,
        daysAgo: 20,
        refreshReason: "scheduled_weekly",
        changeNote: "Split the starter text into an overview and an Archetypes section.",
        body: WEAPONS_V2,
        sources: [SOURCES.site],
        claims: [],
      },
      {
        number: 3,
        daysAgo: 9,
        refreshReason: "patch_notes",
        changeNote: "New update notes: added a Patch history section and explained when damage values are listed.",
        body: WEAPONS_V3,
        sources: [SOURCES.site, SOURCES.news],
        claims: [
          { claimText: "Damage values are listed only when patch notes publish them.", status: "supported", sources: [SOURCES.news], reason: "Matched against 1 source record." },
        ],
      },
      {
        number: 4,
        daysAgo: 1,
        refreshReason: "community_note",
        changeNote: "Added an Acquisition section after a reader's note about where acquisition details first appear.",
        body: WEAPONS_V4,
        sources: [SOURCES.site, SOURCES.news, SOURCES.press],
        claims: [
          { claimText: "Damage values are listed only when patch notes publish them.", status: "supported", sources: [SOURCES.news], reason: "Matched against 1 source record." },
          { claimText: "An archetype describes how a weapon is meant to be used rather than its exact numbers.", status: "unsupported", sources: [], reason: UNSUPPORTED_REASON },
          // Legacy data: a contradicted claim that slipped into the published body; the reader view flags it.
          { claimText: "This page lists the complete weapon roster.", status: "contradicted", sources: [SOURCES.news, SOURCES.press], reason: "Update notes describe weapons being added over time." },
        ],
      },
    ],
  },
];

const NOTES = [
  {
    id: "sample_note_factions_official_news",
    pageId: "page_marathon_factions",
    noteType: "source",
    targetQuote: "Official faction detail is still limited",
    body: "Faction announcements tend to land in Bungie's news posts first. Check there before trusting a name you saw elsewhere.",
    sourceUrl: "https://www.bungie.net/7/en/News",
    daysAgo: 4,
  },
  {
    id: "sample_note_weapons_acquisition",
    pageId: "page_marathon_weapons",
    noteType: "clarification",
    targetQuote: "How weapons are acquired has not been fully documented",
    body: "Acquisition details usually show up in update notes before anywhere else, so community lists can lag behind.",
    sourceUrl: null,
    daysAgo: 2,
  },
];

function provenance(revision: Revision) {
  return {
    provider: "vercel-ai-gateway",
    modelId: "xai/grok-4-fast",
    promptVersion: "wiki-canonical-v3",
    generatedAt: at(revision.daysAgo),
    responseId: null,
    sourceContextSummary: `${revision.sources.length} sources considered.`,
    sourceReferences: revision.sources.map((source) => ({
      sourceId: source.sourceId,
      sourceKey: source.sourceKey,
      sourceType: source.sourceType,
      title: source.title,
      url: source.url,
      publisher: source.publisher,
      authorityTier: source.authorityTier,
      authorityScore: source.authorityScore,
    })),
    claimSupport: revision.claims.map((claim, index) => ({
      claimId: `claim_${revision.number}_${index + 1}`,
      claimText: claim.claimText,
      status: claim.status,
      supportScore: claim.status === "supported" ? 0.82 : claim.status === "unsupported" ? 0.2 : 0.1,
      matchedTerms: [],
      missingTerms: [],
      matchedSourceIds: claim.sources.map((source) => source.sourceId),
      matchedSourceKeys: claim.sources.map((source) => source.sourceKey),
      matchedSourceTitles: claim.sources.map((source) => source.title),
      reason: claim.reason,
    })),
    refreshReason: revision.refreshReason,
    requestedBy: "sample-seed",
  };
}

const client = await pool.connect();

try {
  await client.query("begin");
  await client.query("delete from wiki_sources where id like 'sample_%'");
  await client.query("delete from wiki_community_notes where id like 'sample_%'");
  await client.query("delete from wiki_page_revisions where id like 'sample_%'");

  for (const page of PAGES) {
    for (const revision of page.revisions) {
      const revisionId = `sample_rev_${page.slug}_${revision.number}`;

      await client.query(
        `insert into wiki_page_revisions (id, tenant_id, page_id, revision_number, title, summary, body_markdown, change_note, ai_provenance, created_by, created_at)
         values ($1, 'tenant_marathon', $2, $3, $4, $5, $6, $7, $8, 'ai-refresh', $9)`,
        [revisionId, page.pageId, revision.number, page.title, page.summary, revision.body, revision.changeNote, JSON.stringify(provenance(revision)), at(revision.daysAgo)],
      );

      for (const source of revision.sources) {
        await client.query(
          `insert into wiki_sources (id, tenant_id, page_id, revision_id, source_key, source_type, title, url, publisher, retrieved_at, metadata)
           values ($1, 'tenant_marathon', $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            `sample_src_${page.slug}_${revision.number}_${source.sourceKey}`,
            page.pageId,
            revisionId,
            source.sourceKey,
            source.sourceType,
            source.title,
            source.url,
            source.publisher,
            at(source.retrievedDaysAgo + revision.daysAgo),
            JSON.stringify({
              origin: "canonical_generation_context",
              copiedFromSourceId: source.sourceId,
              authorityTier: source.authorityTier,
              authorityScore: source.authorityScore,
              sample: true,
            }),
          ],
        );
      }
    }

    const latest = page.revisions[page.revisions.length - 1];
    await client.query(
      `update wiki_pages set summary = $2, body_markdown = $3, latest_revision_number = $4, updated_by = 'ai-refresh', updated_at = $5 where id = $1`,
      [page.pageId, page.summary, latest.body, latest.number, at(latest.daysAgo)],
    );
  }

  for (const note of NOTES) {
    await client.query(
      `insert into wiki_community_notes (id, tenant_id, page_id, status, note_type, body_markdown, source_url, target_quote, created_by, reviewed_by, reviewed_at, created_at, metadata)
       values ($1, 'tenant_marathon', $2, 'approved', $3, $4, $5, $6, 'sample-reader', 'sample-editor', $7, $7, '{"origin":"human","sample":true}')`,
      [note.id, note.pageId, note.noteType, note.body, note.sourceUrl, note.targetQuote, at(note.daysAgo)],
    );
  }

  await client.query("commit");
  console.log(`seed-preview: seeded ${PAGES.length} pages with sample revisions and ${NOTES.length} notes.`);
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
  await pool.end();
}

/**
 * SAMPLE DATA — PREVIEW / DEVELOPMENT DATABASES ONLY.
 *
 * Adds AI revisions, provenance, sources and approved community notes on top of the
 * starter pages so the trust layer has something realistic to render. Nothing here is
 * a confirmed Marathon fact: bodies only restate what the starter pages already say,
 * and source titles are generic.
 *
 * Safe on a Neon preview branch, which starts as a full copy of production data:
 *   - the tenant and pages are looked up by slug (a missing page is created with a
 *     `sample_` id; a missing tenant is an error);
 *   - every row this script inserts has an id starting with `sample_` and carries
 *     sample=true in its metadata/provenance; re-runs delete and recreate only those;
 *   - sample revision numbers continue after the page's highest non-sample revision;
 *   - the only non-sample rows it modifies are the seeded pages' current-content
 *     columns (summary, body_markdown, latest_revision_number, updated_by='sample-seed',
 *     updated_at), because the article reads its current text from the page row.
 *
 * Refuses to run unless ALL of these hold:
 *   - ALLOW_SAMPLE_SEED=1 (scripts/vercel-build.mjs sets it only on the preview path)
 *   - VERCEL_ENV is not "production"
 *   - the production endpoint id is known and no database var points at it
 *     (scripts/db-guard.mjs; pooled and unpooled hosts are matched by endpoint id)
 *
 * Usage: ALLOW_SAMPLE_SEED=1 DATABASE_URL_UNPOOLED=... node scripts/seed-preview.ts
 */
import { Pool, type PoolClient } from "@neondatabase/serverless";

import { checkNonProductionTarget, previewTargetUrl } from "./db-guard.mjs";

const DAY = 24 * 60 * 60 * 1000;
const TENANT_SLUG = "marathon";

function fail(message: string): never {
  console.error(`seed-preview: refusing to run. ${message}`);
  process.exit(1);
}

if (process.env.ALLOW_SAMPLE_SEED !== "1") fail("Set ALLOW_SAMPLE_SEED=1.");
if (process.env.VERCEL_ENV === "production") fail("VERCEL_ENV is production.");

const guard = checkNonProductionTarget();
if (!guard.ok) fail(`Database guard: ${guard.reason}.`);

const connectionString = previewTargetUrl() as string;
const pool = new Pool({ connectionString });

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
  step: number;
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

const PAGES: Array<{ slug: string; title: string; summary: string; revisions: Revision[] }> = [
  {
    slug: "factions",
    title: "Factions",
    summary: "The factions and organizations in Marathon's setting, and what official sources confirm about them.",
    revisions: [
      {
        step: 2,
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
        step: 3,
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
        step: 4,
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
    slug: "weapons",
    title: "Weapons",
    summary: "How this wiki documents Marathon weapons, archetypes and patch-sensitive changes.",
    revisions: [
      {
        step: 2,
        daysAgo: 20,
        refreshReason: "scheduled_weekly",
        changeNote: "Split the starter text into an overview and an Archetypes section.",
        body: WEAPONS_V2,
        sources: [SOURCES.site],
        claims: [],
      },
      {
        step: 3,
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
        step: 4,
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
    pageSlug: "factions",
    noteType: "source",
    targetQuote: "Official faction detail is still limited",
    body: "Faction announcements tend to land in Bungie's news posts first. Check there before trusting a name you saw elsewhere.",
    sourceUrl: "https://www.bungie.net/7/en/News",
    daysAgo: 4,
  },
  {
    id: "sample_note_weapons_acquisition",
    pageSlug: "weapons",
    noteType: "clarification",
    targetQuote: "How weapons are acquired has not been fully documented",
    body: "Acquisition details usually show up in update notes before anywhere else, so community lists can lag behind.",
    sourceUrl: null,
    daysAgo: 2,
  },
];

function provenance(revision: Revision, revisionNumber: number) {
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
      claimId: `claim_${revisionNumber}_${index + 1}`,
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
    sample: true,
  };
}

async function counts(client: PoolClient) {
  const result = await client.query(
    `select
       (select count(*) from tenants)::int as tenants,
       (select count(*) from wiki_pages)::int as pages,
       (select count(*) from wiki_page_revisions)::int as revisions,
       (select count(*) from wiki_sources)::int as sources,
       (select count(*) from wiki_community_notes)::int as notes`,
  );
  return result.rows[0] as Record<string, number>;
}

const client = await pool.connect();

try {
  await client.query("begin");

  const tenant = await client.query("select id from tenants where slug = $1", [TENANT_SLUG]);
  if (tenant.rows.length === 0) throw new Error(`Tenant '${TENANT_SLUG}' not found. Run the starter seed (pnpm db:seed) first.`);
  const tenantId: string = tenant.rows[0].id;

  // Re-runs: remove only rows this script created.
  await client.query("delete from wiki_sources where id like 'sample\\_%'");
  await client.query("delete from wiki_community_notes where id like 'sample\\_%'");
  await client.query("delete from wiki_page_revisions where id like 'sample\\_%'");

  const pageIds = new Map<string, string>();

  for (const page of PAGES) {
    const existing = await client.query("select id from wiki_pages where tenant_id = $1 and slug = $2", [tenantId, page.slug]);
    let pageId: string;

    if (existing.rows.length > 0) {
      pageId = existing.rows[0].id;
    } else {
      pageId = `sample_page_${page.slug}`;
      await client.query(
        `insert into wiki_pages (id, tenant_id, slug, title, summary, body_markdown, status, latest_revision_number, created_by, updated_by, published_at)
         values ($1, $2, $3, $4, $5, '', 'published', 0, 'sample-seed', 'sample-seed', now())`,
        [pageId, tenantId, page.slug, page.title, page.summary],
      );
    }
    pageIds.set(page.slug, pageId);

    const max = await client.query(
      "select coalesce(max(revision_number), 0)::int as max from wiki_page_revisions where tenant_id = $1 and page_id = $2",
      [tenantId, pageId],
    );
    const base: number = max.rows[0].max;
    let latestNumber = base;
    let latest: Revision | null = null;

    for (const revision of page.revisions) {
      const revisionNumber = base + revision.step - 1;
      const revisionId = `sample_rev_${page.slug}_${revision.step}`;

      await client.query(
        `insert into wiki_page_revisions (id, tenant_id, page_id, revision_number, title, summary, body_markdown, change_note, ai_provenance, created_by, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'sample-seed', $10)`,
        [revisionId, tenantId, pageId, revisionNumber, page.title, page.summary, revision.body, revision.changeNote, JSON.stringify(provenance(revision, revisionNumber)), at(revision.daysAgo)],
      );

      for (const source of revision.sources) {
        await client.query(
          `insert into wiki_sources (id, tenant_id, page_id, revision_id, source_key, source_type, title, url, publisher, retrieved_at, metadata)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            `sample_src_${page.slug}_${revision.step}_${source.sourceKey}`,
            tenantId,
            pageId,
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

      latestNumber = revisionNumber;
      latest = revision;
    }

    if (latest) {
      // The one change to a non-sample row: point the page at its newest sample revision.
      await client.query(
        `update wiki_pages set summary = $3, body_markdown = $4, latest_revision_number = $5, updated_by = 'sample-seed', updated_at = $6
         where tenant_id = $1 and id = $2`,
        [tenantId, pageId, page.summary, latest.body, latestNumber, at(latest.daysAgo)],
      );
    }
  }

  for (const note of NOTES) {
    await client.query(
      `insert into wiki_community_notes (id, tenant_id, page_id, status, note_type, body_markdown, source_url, target_quote, created_by, reviewed_by, reviewed_at, created_at, metadata)
       values ($1, $2, $3, 'approved', $4, $5, $6, $7, 'sample-reader', 'sample-editor', $8, $8, '{"origin":"human","sample":true}')`,
      [note.id, tenantId, pageIds.get(note.pageSlug), note.noteType, note.body, note.sourceUrl, note.targetQuote, at(note.daysAgo)],
    );
  }

  const after = await counts(client);
  await client.query("commit");
  console.log(`seed-preview: seeded ${PAGES.length} pages with sample revisions and ${NOTES.length} notes. Row counts: ${JSON.stringify(after)}`);
} catch (error) {
  await client.query("rollback");
  console.error(`seed-preview: failed, rolled back. ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}

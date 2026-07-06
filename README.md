# Marathon Wiki

Grokipedia-style AI-powered wiki for Marathon (and games like Arc).

## Product Requirements

Marathon Wiki is intended to be an AI-authored public wiki, not a traditional
human-written wiki with AI autocomplete. The canonical article body should be
generated and refreshed by AI, with humans contributing community notes,
corrections, source links, and disputes.

Core requirements:

- AI is the primary author of public canonical page content.
- Public pages show when the canonical AI content was last updated.
- AI refreshes use source material, retrieved context, prior revisions, and
  community notes to determine the current best factual synthesis.
- Community notes work like Twitter/X or Threads-style contextual notes: they
  can appear alongside the article and influence future AI refreshes, but they
  do not directly replace canonical content.
- Human editors moderate abuse, source quality, and disputed notes. They are
  not the default article authoring path.
- Every AI-generated canonical revision stores provenance such as model id,
  prompt version, generated-at time, source references, and response id when
  available.
- Vercel AI Gateway is the model routing layer. Grok/xAI can be preferred when
  model access is available, but the product should stay model-agnostic enough
  to route to another capable model.

## Architecture
- Next.js 16 App Router + ISR
- Neon Postgres (serverless, pooled)
- Prisma (schema/migrations only) + prisma-kysely generator
- Kysely (type-safe queries)
- Vercel deployment
- Multi-tenant (`tenant_id`)
- AI-authored canonical content with community notes

See full `implementation-plan.md` for details.

## Quick Start
1. Clone and install dependencies: `pnpm install`
2. Copy `.env.example` to `.env.local`
3. Set `DATABASE_URL` to a Neon pooled Postgres connection string
4. Generate Prisma and Kysely types: `pnpm db:generate`
5. Apply migrations: `pnpm db:migrate`
6. Seed the first tenant: `pnpm db:seed`
7. Run locally: `pnpm dev`

## Environment

| Name | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes for storage smoke checks | Neon pooled Postgres connection string used by Prisma migrations and Kysely queries. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes for deployed suggestions/review | Clerk publishable key for authenticated suggestion UI. |
| `CLERK_SECRET_KEY` | Yes for deployed suggestions/review | Clerk server key used by Server Actions and review pages. |
| `WIKI_EDITOR_USER_IDS` | Yes for deployed review | Comma-separated Clerk user IDs allowed to approve, reject, or request changes. |
| `WIKI_EDITOR_EMAILS` | Optional | Comma-separated editor emails. Useful while collecting Clerk user IDs. |
| `WIKI_ENABLE_DEV_AUTH` | Local only | Set to `true` outside production to enable the local preview auth fallback when Clerk keys are absent. |
| `WIKI_DEV_AUTH_ROLE` | Local only | Set to `editor` with `WIKI_ENABLE_DEV_AUTH=true` to preview the review surface locally. |
| `WIKI_DEV_USER_ID` / `WIKI_DEV_USER_EMAIL` | Local only | Attribution used by the local preview auth fallback. |
| `WIKI_AI_GATEWAY_MODEL` | Optional | Vercel AI Gateway model used for wiki drafts. Defaults to `openai/gpt-5-nano` and can be changed to any supported `provider/model` id. |
| `AI_GATEWAY_API_KEY` | Optional | Static AI Gateway key for non-Vercel environments. Local Vercel-linked development can use `VERCEL_OIDC_TOKEN`; Vercel deployments use OIDC automatically. |
| `CRON_SECRET` / `WIKI_CRON_SECRET` | Required for production cron | Secret expected in the cron `Authorization` bearer header. Set `CRON_SECRET` for Vercel Cron because Vercel sends it automatically; use `WIKI_CRON_SECRET` only for manual/local calls or keep both values identical. |
| `WIKI_WEEKLY_REFRESH_LIMIT` | Optional | Maximum stale AI-authored pages queued by the weekly scheduled update pass. Defaults to `3`. |
| `WIKI_PROCESS_REFRESH_LIMIT` | Optional | Maximum due refresh queue items processed per scheduled update invocation. Defaults to `1` to keep AI generation costs bounded. |
| `WIKI_REFRESH_STALE_AFTER_DAYS` | Optional | Age threshold for weekly refresh eligibility. Defaults to `7` days. |
| `WIKI_EVENT_REFRESH_TARGETS` | Optional | Comma-separated default event refresh targets, for example `factions:Factions,overview:Overview`. Used when discovered events do not include explicit targets. |
| `WIKI_EVENT_DISCOVERY_ENDPOINT` / `WIKI_EVENT_DISCOVERY_TOKEN` | Optional | Bounded provider hook used by the daily event pass to look for game events in the next 7 days. No event provider call is made when the endpoint is absent. |
| `WIKI_SOURCE_DISCOVERY_ENDPOINT` / `WIKI_SOURCE_DISCOVERY_TOKEN` | Optional | Bounded provider hook used by scheduled or manual source discovery. Explicit local candidate payloads can be used without this provider. |
| `WIKI_SCHEDULED_SOURCE_DISCOVERY_TOPICS` | Optional | Comma-separated topic slugs for scheduled source discovery. Requires a top-level tenant in the request or `WIKI_SCHEDULED_SOURCE_DISCOVERY_TENANT_SLUG`. |
| `WIKI_SCHEDULED_SOURCE_DISCOVERY_TENANT_SLUG` | Optional | Tenant slug used by aggregate scheduled source discovery when the request does not include a tenant slug. |
| `WIKI_SOURCE_DISCOVERY_LIMIT` | Optional | Per-topic source discovery cap for scheduled discovery. Defaults to `3` in the scheduled update route. |
| `NEXT_PUBLIC_SITE_URL` | Yes for production SEO | Public canonical origin used by metadata, robots, and sitemap URLs. Vercel `VERCEL_URL` is used as a fallback. |
| `WIKI_ROBOTS_INDEXING_ENABLED` | Optional | Overrides robots indexing. Defaults to enabled for Vercel Production and disabled for Vercel Preview. |
| `WIKI_ANALYTICS_ENABLED` | Optional | First-party pageview/product-event logging. Defaults to enabled; set to `false` to suppress client event capture and `/api/wiki/events` logging. |
| `WIKI_ADS_ENABLED` | Optional | Enables ad rendering only when set to `true` and slot/client env is present. Defaults to disabled. |
| `WIKI_ADSENSE_CLIENT_ID` | Required only when ads enabled | Public AdSense client id, for example `ca-pub-...`. Not treated as a secret. |
| `WIKI_AD_SLOT_SIDEBAR` / `WIKI_AD_SLOT_FOOTER` | Required only when ads enabled | AdSense slot IDs for reserved sidebar and footer placements. Missing slots do not render. |
| `WIKI_PREMIUM_ENABLED` | Optional | Enables the first premium/support CTA hook only when set to `true` with a valid URL. Defaults to disabled. |
| `WIKI_PREMIUM_URL` | Required only when premium enabled | Destination for the first monetization path. |
| `WIKI_PREMIUM_LABEL` / `WIKI_PREMIUM_DESCRIPTION` | Optional | Public CTA copy for the premium/support hook. |

The app can build without `DATABASE_URL`, but `/api/health` reports storage as unconfigured until the variable is present.

Public wiki reads remain unauthenticated. Suggestion creation and editorial
review use Clerk when Clerk keys are present. The dev auth fallback is disabled
in production and only exists so local preview can exercise the suggestion flow
without real third-party secrets.

### Clerk setup

The deployed auth app is GameWikiVerse (`app_3FxjLxxpKOAScNYzLPqHwOBV7uF`).
After signing in with the Clerk CLI, initialize this existing project with:

```bash
clerk init --app app_3FxjLxxpKOAScNYzLPqHwOBV7uF
clerk doctor
```

Keep `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in local or
Vercel environment variables only. After creating the first editor account,
set `WIKI_EDITOR_USER_IDS` to that Clerk user id, or use `WIKI_EDITOR_EMAILS`
while collecting user ids.

## Deployment

- Build command: `pnpm build`
- Vercel build command alias: `pnpm vercel:build`
- Install command: `pnpm install`
- Health check: `/api/health`

## Scheduled Content Updates

`vercel.json` wires two production cron entries to `/api/cron/wiki-update`.
Vercel Cron invokes the route with `GET` and includes the
`x-vercel-cron-schedule` header, so the shared route can infer which schedule
triggered it:

| Schedule | Mode | Work |
| --- | --- | --- |
| `0 8 * * 1` | `weekly` | Refresh curated source context, run optional configured source discovery, enqueue stale AI-authored pages, process due queue items, and revalidate changed public pages. |
| `0 9 * * *` | `events` | Discover game events in the next `7` days, enqueue targeted refreshes for event dates, process due queue items, and revalidate changed public pages. |

All cron routes also accept `POST` with explicit JSON payloads for local
verification. For Vercel scheduled invocations, set `CRON_SECRET`; Vercel sends
it as the bearer token automatically. Manual calls can use `WIKI_CRON_SECRET`,
but if both env vars are set they should have the same value because the route
checks `WIKI_CRON_SECRET` first. If neither secret is set, cron routes are open
only outside production for local development.

The standalone routes remain useful for narrow operations:

| Route | Purpose |
| --- | --- |
| `/api/cron/wiki-source-ingestion` | Fetch curated registry sources and upsert source context before generation. |
| `/api/cron/wiki-source-discovery` | Discover or explicitly submit bounded source candidates for one tenant/topic. |
| `/api/cron/ai-refresh/weekly` | Queue stale AI-authored pages. This route scopes by `tenantId`, not `tenantSlug`. |
| `/api/cron/ai-refresh/events` | Queue refreshes for upcoming events in the next `windowDays`, defaulting to `7`. |
| `/api/cron/ai-refresh/process` | Claim due queue items, generate canonical AI revisions, and revalidate affected wiki paths. |

Cost guardrails:

- No minute-level or hourly polling. The default production cadence is one daily
  event/due-queue sweep plus one weekly maintenance run.
- Queueing does not call the AI model. AI cost is concentrated in the process
  step, capped to `1` item per aggregate run by default.
- Weekly queue items dedupe by tenant, page slug, and UTC week. Event queue
  items dedupe by tenant, target slug, event date, and event key.
- Weekly refresh only considers published pages whose latest revision has AI
  provenance and is older than `staleAfterDays`.
- Source discovery is bounded to `3` candidates in the aggregate route and `5`
  at the module level. Explicit candidate payloads with `summary` or
  `contextText` avoid fetching candidate URLs during local checks.
- Leave `WIKI_SCHEDULED_SOURCE_DISCOVERY_TOPICS` unset until the provider and
  fetch costs are acceptable. Curated source ingestion already runs before
  weekly generation work.

Recommended production settings:

```bash
CRON_SECRET=<random 16+ character value>
WIKI_WEEKLY_REFRESH_LIMIT=3
WIKI_PROCESS_REFRESH_LIMIT=1
WIKI_REFRESH_STALE_AFTER_DAYS=7
WIKI_EVENT_REFRESH_TARGETS=factions:Factions,weapons:Weapons,gameplay:Gameplay
```

Add `WIKI_EVENT_DISCOVERY_ENDPOINT` only after the provider is ready. Add
`WIKI_SCHEDULED_SOURCE_DISCOVERY_TOPICS` only for narrow launch topics such as
`factions` or `weapons`.

## Testing

- Run automated tests: `pnpm test`
- Run the full local definition of done: `pnpm verify`

`pnpm verify` runs Vitest and the production build. The test suite includes
Neon-backed integration coverage for storage smoke checks, multi-tenant wiki
queries, public reader snapshots, and suggestion/review lifecycle behavior, so
`DATABASE_URL` must point at a migrated database before running it.

## Local human verification

When handing a localhost URL to a human reviewer, keep the server process
running until review is complete. Protected Vercel preview URLs can require
Vercel auth, so use a local URL for Codex browser verification.

For a production-like local reader check, load the local env file into the
server process:

```bash
set -a; source .env.local; set +a; pnpm exec next start -p 3101
```

Then verify `http://127.0.0.1:3101/marathon`.

### Local scheduled update verification

For cron verification, start the app with a migrated database and a local cron
secret:

```bash
set -a; source .env.local; set +a
export WIKI_CRON_SECRET=local-cron-secret
pnpm exec next start -p 3101
```

In another shell:

```bash
export BASE_URL=http://127.0.0.1:3101
export WIKI_CRON_SECRET=local-cron-secret
```

Bounded source discovery without external provider calls:

```bash
curl -sS -X POST "$BASE_URL/api/cron/wiki-source-discovery" \
  -H "authorization: Bearer $WIKI_CRON_SECRET" \
  -H "content-type: application/json" \
  --data '{
    "tenantSlug": "marathon",
    "topicSlug": "factions",
    "query": "Marathon factions verification",
    "limit": 1,
    "candidates": [
      {
        "title": "Manual Marathon factions source",
        "url": "https://example.com/marathon/factions",
        "publisher": "Manual verification",
        "summary": "Arachne, Cyberacme, Nucaloric, Sekiguchi, Traxus, and MIDA are tracked as Marathon factions.",
        "authorityTier": "community_wiki",
        "authorityScore": 60
      }
    ]
  }'
```

Curated source ingestion for one topic. This fetches the configured curated
source URLs:

```bash
curl -sS -X POST "$BASE_URL/api/cron/wiki-source-ingestion" \
  -H "authorization: Bearer $WIKI_CRON_SECRET" \
  -H "content-type: application/json" \
  --data '{
    "tenantSlug": "marathon",
    "topicSlug": "factions",
    "sourceIds": ["marathon-factions-pcgamer-guide"]
  }'
```

Weekly stale-page queueing. This enqueues only; it does not generate content:

```bash
curl -sS -X POST "$BASE_URL/api/cron/ai-refresh/weekly" \
  -H "authorization: Bearer $WIKI_CRON_SECRET" \
  -H "content-type: application/json" \
  --data '{
    "tenantId": "tenant_marathon",
    "staleAfterDays": 7,
    "limit": 1
  }'
```

Event discovery for the next seven days with an inline event payload:

```bash
curl -sS -X POST "$BASE_URL/api/cron/ai-refresh/events" \
  -H "authorization: Bearer $WIKI_CRON_SECRET" \
  -H "content-type: application/json" \
  --data '{
    "tenantId": "tenant_marathon",
    "windowDays": 7,
    "events": [
      {
        "title": "Manual Marathon Patch Day",
        "eventDate": "2026-07-08T15:00:00.000Z",
        "eventKey": "manual-marathon-patch-day",
        "summary": "Manual verification event for the scheduled update queue.",
        "targets": [
          {
            "targetSlug": "factions",
            "pageTitle": "Factions"
          }
        ]
      }
    ]
  }'
```

Process one due queue item. This can call AI Gateway and publish a canonical
revision if a due item exists:

```bash
curl -sS -X POST "$BASE_URL/api/cron/ai-refresh/process" \
  -H "authorization: Bearer $WIKI_CRON_SECRET" \
  -H "content-type: application/json" \
  --data '{ "limit": 1 }'
```

Full aggregate loop with explicit low limits. Use this only when you are ready
to let the route process one due item:

```bash
curl -sS -X POST "$BASE_URL/api/cron/wiki-update" \
  -H "authorization: Bearer $WIKI_CRON_SECRET" \
  -H "content-type: application/json" \
  --data '{
    "mode": "maintenance",
    "tenantId": "tenant_marathon",
    "tenantSlug": "marathon",
    "topicSlug": "factions",
    "sourceIngestion": false,
    "weeklyLimit": 1,
    "processLimit": 1,
    "staleAfterDays": 7,
    "windowDays": 7,
    "sourceDiscoveries": [
      {
        "tenantSlug": "marathon",
        "topicSlug": "factions",
        "limit": 1,
        "candidates": [
          {
            "title": "Manual aggregate factions source",
            "url": "https://example.com/marathon/aggregate-factions",
            "summary": "Manual source context for local aggregate verification."
          }
        ]
      }
    ],
    "events": [
      {
        "title": "Manual Aggregate Event",
        "eventDate": "2026-07-08T15:00:00.000Z",
        "targets": [
          {
            "targetSlug": "factions",
            "pageTitle": "Factions"
          }
        ]
      }
    ]
  }'
```

For deterministic local event processing, add a `now` ISO timestamp to the
payload and use the same value as the event's `eventDate`. Production cron calls
omit `now` and use the real invocation time.

## Database workflow

- Edit durable schema in `prisma/schema.prisma`.
- Add a timestamped migration under `prisma/migrations`.
- Regenerate Prisma and Kysely types with `pnpm db:generate`.
- Apply migrations to the configured Neon database with `pnpm db:migrate`.
- Seed the Marathon tenant and starter wiki records with `pnpm db:seed`.

The Phase 2 seed is idempotent and uses `ON CONFLICT`, so it is safe to rerun
after migration deploys in local, preview, or production environments.

### Vercel + Neon setup

1. Create or link a Vercel project for this repository.
2. Provision a Neon Postgres database with a pooled connection string.
3. Add `DATABASE_URL` to the Vercel project for Preview and Production.
4. Run migrations against the Neon database: `pnpm db:migrate`.
5. Seed the Marathon tenant: `pnpm db:seed`.
6. Deploy to Vercel.
7. Verify `/api/health` returns `"ok": true` and does not expose the raw connection string.

Phase 2 adds the reusable multi-tenant wiki schema, Kysely-backed query helpers,
and the idempotent starter Marathon tenant seed. AI generation and monetization
are intentionally deferred to later phases.

Phase 4 adds authenticated page suggestions and a lightweight editorial review
workflow:

- Users submit new-page or edit suggestions from `/:tenant/suggest` or
  `/:tenant/suggest/:pageSlug`.
- Suggestions are stored in `wiki_suggestions` with tenant, target page, status,
  attribution, and review metadata.
- Editors visit `/:tenant/review` to approve, reject, or request changes.
- Approvals create a new published page revision and revalidate the affected
  wiki cache tags.

Phase 5 currently adds AI-assisted editorial drafting through Vercel AI Gateway:

- Editors can request an AI draft from `/:tenant/review`.
- AI output is stored as a pending `wiki_suggestions` row with provenance
  metadata and is never published directly.
- Existing approval/rejection actions handle AI-assisted suggestions the same
  way they handle human suggestions.
- Public wiki reads do not require AI Gateway configuration. Missing or invalid
  Gateway access fails only the AI draft request and reports the error to the
  editor.

This Phase 5 workflow is a stepping stone, not the final AI product model. The
target product is AI-owned canonical content generation:

- AI generates and refreshes public article revisions directly through a
  controlled canonical content pipeline.
- Public article pages expose `Last AI update` and AI provenance.
- Human community notes are stored separately from canonical article body and
  become reviewable context for later AI refreshes.
- Marathon-specific pages should be generated from source-backed context rather
  than only from a small seed corpus.

Phase 6 prepares the public reader for traffic-driven launch:

- Public home, category, index, and article routes include canonical metadata,
  Open Graph/Twitter metadata, `robots.txt`, and dynamic `sitemap.xml` coverage.
- Public pageviews and key product events are captured through the first-party
  `/api/wiki/events` endpoint and emitted as sanitized server logs. No analytics
  vendor token is exposed to the browser.
- Ads are disabled unless `WIKI_ADS_ENABLED=true`, `WIKI_ADSENSE_CLIENT_ID`, and
  at least one slot env are configured. Placements reserve vertical space and
  avoid interrupting article body reading.
- Premium hooks are disabled unless `WIKI_PREMIUM_ENABLED=true` and
  `WIKI_PREMIUM_URL` are configured. This is intentionally only a CTA hook, not
  subscription management.

## Production launch checklist

1. Set production env: `DATABASE_URL`, Clerk editor env, AI Gateway access for
   canonical generation/review drafting, `NEXT_PUBLIC_SITE_URL`, and the Phase 6
   analytics/ad/premium envs needed for launch.
2. Run `pnpm db:migrate` against production Neon, then rerun
   `pnpm db:seed` if the Marathon seed needs to be refreshed.
3. Build with `pnpm build` or the Vercel `pnpm vercel:build` alias.
4. Smoke check `/api/health`, `/marathon`, `/marathon/pages`,
   `/sitemap.xml`, and `/robots.txt`.
5. Confirm public article readability on mobile and desktop before enabling ads.
   Ads should remain absent until the ad feature flag, client id, and slot IDs
   are all present.
6. Confirm first-party analytics logs include `page_view`, `search_submit`,
   `suggestion_cta` or `suggestion_submit`, and monetization events when those
   hooks are enabled.
7. Roll back by promoting the last known-good Vercel deployment. If the issue is
   monetization-only, first set `WIKI_ADS_ENABLED=false` or
   `WIKI_PREMIUM_ENABLED=false` and redeploy.

Target: AI-authored Marathon-specific coverage, clear `Last AI update`
provenance, community notes, clean UX, ISR performance, light ad monetization,
and a public reader ready to pursue 30k+ monthly pageviews.

# Marathon Wiki

Grokipedia-style AI-powered wiki for Marathon (and games like Arc).

## Architecture
- Next.js 16 App Router + ISR
- Neon Postgres (serverless, pooled)
- Prisma (schema/migrations only) + prisma-kysely generator
- Kysely (type-safe queries)
- Vercel deployment
- Multi-tenant (`tenant_id`)

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

Phase 5 adds AI-assisted editorial drafting through Vercel AI Gateway:

- Editors can request an AI draft from `/:tenant/review`.
- AI output is stored as a pending `wiki_suggestions` row with provenance
  metadata and is never published directly.
- Existing approval/rejection actions handle AI-assisted suggestions the same
  way they handle human suggestions.
- Public wiki reads do not require AI Gateway configuration. Missing or invalid
  Gateway access fails only the AI draft request and reports the error to the
  editor.

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
   review drafting, `NEXT_PUBLIC_SITE_URL`, and the Phase 6 analytics/ad/premium
   envs needed for launch.
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

Target: Clean UX, ISR performance, light ad monetization, and a public reader
ready to pursue 30k+ monthly pageviews.

# Production switches

Mike approves each switch below before anyone runs it. None of these run automatically on merge. This document does not contain secrets or connection strings.

The 25 approved Marathon revisions in this PR are sha256 `d6ab2e5efeb9ec5b581deca20fed2d1e53656a858a354966924847037e271fcf` (short `d6ab2e5efeb9`). They are already on the preview database (`ep-wandering-field-bd77ppbc`) only. The file hash did not change in this follow-up; the loader and confirm phrase did.

## (a) Apply the 25 approved Marathon revisions to production

**What it does.** For each page in `content/marathon/generated/approved-paraphrase-revisions.json`, inserts a new published revision. If no page row exists, it also inserts the page. Earlier revisions stay in history.

Today that is 24 updates plus 1 new page (`armory`). The public index on wikiden.gg has no `/marathon/armory` (HTML and `/marathon/armory.json` are 404). A live scrape of all 38 public Marathon HTML pages, `/marathon`, `/marathon/pages`, category pages, `/sitemap.xml`, and `search-index.json` found no href or `[[armory]]` link to it. Article bodies are not served as public JSON.

The approved file itself does contain `[[armory|Armory]]` on `arachne`, `cyberacme`, `gameplay`, `mida`, `nucaloric`, and `traxus`. Those six would become live broken links if (a) ran without creating `armory`. The generated `pages.json` also links from `sekiguchi-genetics` and `rarity-tiers`, but those two are not in the 25 and are not being applied here. Creating `armory` in this same load is what keeps the six approved links from breaking.

**Command** (operator machine, not Vercel):

```
WIKI_ALLOW_PROD_CONTENT_LOAD=1 node scripts/content/load-approved-revisions.ts \
  --tenant marathon --env-file .env.local --dry-run
WIKI_ALLOW_PROD_CONTENT_LOAD=1 node scripts/content/load-approved-revisions.ts \
  --tenant marathon --env-file .env.local \
  --confirm "apply 24 updated + 1 new revisions d6ab2e5efeb9 into production marathon"
```

The confirm phrase is produced by `approvedConfirmationPhrase` in `src/content/load-approved-revisions.ts` from the updated/new counts at confirm time. If the file hash or the 24+1 mix changes, the phrase changes and this one will be refused.

A production-secret-free dry run (what we used) is:

```
node scripts/content/load-approved-revisions.ts --tenant marathon --dry-run --public-base https://wikiden.gg
# or
node scripts/content/dry-run-prod-public.ts --base https://wikiden.gg
```

**Rollback.** History keeps the previous revision for the 24 updated pages. Public history on wikiden.gg, taken before this load, is the source of the revision numbers below. After the load, a new current revision will sit on top; restore by copying the prior revision into a new one (the previous row is not deleted):

```
WIKI_ALLOW_PROD_CONTENT_LOAD=1 node scripts/content/restore-revision.ts \
  --tenant marathon --slug ranked --revision 2 --dry-run
WIKI_ALLOW_PROD_CONTENT_LOAD=1 node scripts/content/restore-revision.ts \
  --tenant marathon --slug ranked --revision 2 \
  --confirm "restore ranked revision 2 into production marathon"
```

Prior public revisions (from `/marathon/<slug>/history` on 16 Nov 2026):

- r2: `factions`, `gameplay`, `locations`, `overview`, `ranked`, `recon`, `weapons`
- r1: `arachne`, `contracts`, `cores`, `cryo-archive`, `cyberacme`, `expedition`, `mida`, `night-marsh`, `nucaloric`, `perimeter`, `seasonal-resets`, `seasons`, `sentinel`, `the-cradle`, `thief`, `traxus`, `vandal`

`armory` would be created as r1. This PR does not add a page-delete script; restore-revision cannot hide a first revision. If we had to take `armory` down after creating it, that would be a separate, approved change.

The restore command was dry-run against the preview database (endpoint `ep-wandering-field-bd77ppbc`, not production) after an earlier file was applied there: it reported it would copy `the-cradle` r4 as a new r6 and made no write.

**Cost.** $0 model spend. The loader does not call the AI Gateway; it only writes the committed file.

**Proof.** `curl -sI https://wikiden.gg/marathon/the-cradle` is 200. The dek/meta description includes `season-limited`. `curl -sI https://wikiden.gg/marathon/armory` is 200. `/marathon/ranked` and `/marathon/recon` stay 200 with WikiDen titles. Re-run `node scripts/content/dry-run-prod-public.ts` (Cradle summary should then match; armory should be on the public index). `node scripts/e2e/gta6-flag.ts` still shows Marathon 200. Local or prod `LCP_BASE_URL=https://wikiden.gg LCP_PAGES=/marathon,/marathon/ranked,/marathon/armory LCP_RUNS=5 node scripts/perf/lcp-budget.ts`. Shots of `/marathon`, `/marathon/the-cradle`, and `/marathon/armory`.

## (b) GTA 6 production content import, then `GTA6_ENABLED=1`

**What it does.** One command loads `content/gta6/generated/pages.json` (41 pages, sha256 `0b65fb70372e`). In the same transaction, and behind the same confirm phrase and `WIKI_ALLOW_PROD_CONTENT_LOAD=1` gate, it upserts the `gta6` game, tenant, and categories (idempotent; same rows as `prisma/seeds/gta6.sql`). All 41 currently have `publishGate.decision = publish`. After the load is confirmed, Mike sets the Production env var `GTA6_ENABLED=1`. Do not set the flag in this PR. Until that flag is set, `/gta6` stays 404 with `x-robots-tag: noindex`.

```
WIKI_ALLOW_PROD_CONTENT_LOAD=1 node scripts/content/load-generated-once.ts \
  --tenant gta6 --env-file .env.local --dry-run
WIKI_ALLOW_PROD_CONTENT_LOAD=1 node scripts/content/load-generated-once.ts \
  --tenant gta6 --env-file .env.local \
  --confirm "load 41 pages 0b65fb70372e into production gta6"
```

The confirm phrase comes from `confirmationPhrase` in `src/content/load-once.ts`. The load key is `generated-pages:gta6`; a second run is refused. Public dry run (no secrets):

```
node scripts/content/load-generated-once.ts --tenant gta6 --dry-run --public-base https://wikiden.gg
```

**Rollback.** Unset `GTA6_ENABLED` (or set it to anything other than `1`). That path is already tested: production today, with the flag absent, returns 404 + `x-robots-tag: noindex` for `/gta6` and `/gta6/overview.json`. The one-time load cannot be re-run. Loaded rows would remain in the database while the site hides `/gta6`.

**Cost.** $0 model spend for the load and for the flag. The loader does not call the AI Gateway. (Generating those pages was earlier work; this switch only loads the committed file and flips the flag.)

**Proof.** Before the flag: `curl -sI https://wikiden.gg/gta6` is still 404 + `x-robots-tag: noindex`. After the flag: `/gta6` and `/gta6/overview` are 200, titles end with `WikiDen`, and the page is indexed (no `x-robots-tag: noindex`). `E2E_BASE_URL=https://wikiden.gg node scripts/e2e/gta6-flag.ts`. `LCP_BASE_URL=https://wikiden.gg LCP_PAGES=/gta6 LCP_RUNS=5 node scripts/perf/lcp-budget.ts`. Shots of `/gta6` at 390 and 1280, light and dark.

## (c) Enable `WIKI_SOURCE_REFETCH_CRON` and `WIKI_AI_EDITOR_CRON`

**What it does.** Vercel already schedules `/api/cron/source-refetch` at 08:00 UTC and `/api/cron/wiki-update` at 09:00 UTC (`vercel.json`). Both production routes stay off until their flag is `1`. The flags are independent. Preview and development always refuse.

**Env change** (Vercel Production, values only as shown):

- `WIKI_SOURCE_REFETCH_CRON=1` — re-fetch static sources over HTTP, store new snapshots when the text hash changes, queue affected pages, list uncovered Bungie news posts. No AI calls. See README production-switch table.
- `WIKI_AI_EDITOR_CRON=1` — queue event refreshes, then process up to 3 due queue items, stopping at $0.25 of AI spend, and revalidate changed pages. See README (`WIKI_PROCESS_REFRESH_LIMIT`, Cost guardrails).

Cron requests must use the existing `CRON_SECRET` bearer. Do not print that secret. Neither flag is in the Vercel project env list today.

**AI Gateway auth.** The $0.276 figure from the #47 preview rewrites is the sum of two local `scripts/content/paraphrase-pages.ts` runs recorded in `paraphrase-spend-ledger.json` (Marathon $0.1496 + GTA 6 $0.1261 = $0.27575, reported as $0.276). That script refuses to run on Vercel. It loads `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN` from the environment or `.env.local` (`loadGatewayCredential` in `scripts/content/paraphrase-pages.ts`). On the box that ran it, `AI_GATEWAY_API_KEY` was set and `VERCEL_OIDC_TOKEN` was not. It was a box-local key, not OIDC on a Vercel deployment.

The production editor cron uses the same credential check: `hasGatewayCredential` in `src/content/model-gateway.ts` is true when `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN` is present at runtime. `processDueAiRefreshQueueItems` in `src/ai/wiki-refresh-queue.ts` claims no items when that check fails. `AI_GATEWAY_API_KEY` is not in the Production or Preview env list (names and targets only). README says Vercel deployments use OIDC automatically and the static key is for non-Vercel environments. For production to authenticate, either:

- OIDC: `VERCEL_OIDC_TOKEN` must be present in the cron function at runtime, and the AI Gateway must accept it (this is the documented Vercel-deployment path; confirm the token name is present at runtime — do not print the value — before relying on it), or
- Mike sets a Production `AI_GATEWAY_API_KEY` himself (same kind of static key the box used).

**Manual run before enabling the schedule.** Setting `WIKI_AI_EDITOR_CRON=1` also arms the daily 09:00 UTC job, so fire one manual request immediately after the flag is set (and after auth is in place). If the run is not acceptable, unset the flag before 09:00 UTC. Do not print `CRON_SECRET`.

```
# After WIKI_AI_EDITOR_CRON=1 is set on Production. The $0.25 cap is the default;
# you do not need to set WIKI_AI_RUN_CAP_USD unless you are changing it.
curl -sS -X POST https://wikiden.gg/api/cron/wiki-update \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"processLimit":3}'
```

The cap is enforced in `createGatewayCaller` (`src/content/model-gateway.ts`): before each model call it refuses when `ledger.totalUsd() + worstCaseCallUsd(...)` would pass `capUsd`. The cron worker passes `capUsd: Number(env.WIKI_AI_RUN_CAP_USD ?? DEFAULT_RUN_CAP_USD)` with `DEFAULT_RUN_CAP_USD = 0.25` in `src/ai/wiki-refresh-queue.ts`. A per-run ledger starts at zero; this is not a monthly cap.

Read the cost from the JSON response: `process.spendUsd` is the priced token usage for that run, and `process.capUsd` is the cap that was applied. `spendUsd` comes from `MemoryLedger.totalUsd()` / `priceUsage` in `src/content/model-gateway.ts`. Also check Vercel function logs for the route (no secrets).

The $0.276 paraphrase total is not a measured editor-cron spend (that flag has never been on in production) and was run under a $4.50 paraphrase cap, not the $0.25 editor cap.

**Rollback.** Remove the flag or set it to anything other than `1`. The next scheduled run will refuse. Already-published editor revisions stay in history and can be rolled back with `restore-revision.ts` the same way as (a).

**Cost.** Source re-fetch: $0 model spend (README and `app/api/cron/source-refetch/route.ts`: no AI calls). Editor cron: no production run has been measured because the flag has never been on; the documented cap is $0.25 per run and at most 3 items (README, `DEFAULT_RUN_CAP_USD`). Do not treat that cap as an observed spend. The $0.276 figure is the earlier local paraphrase rewrite, cited above.

**Proof.** After the manual run, the curl JSON should be `ok: true` (or explain any `process.failed`). Look at `/marathon/<slug>/history` if a page was processed. Re-run `LCP_BASE_URL=https://wikiden.gg LCP_PAGES=/marathon LCP_RUNS=5 node scripts/perf/lcp-budget.ts` if a visible page changed.

## (d) Snapshot import that restores ranked and recon

**Covered by (a).** `ranked` and `recon` are both in the 25 approved revisions. Production already serves them (ranked r2, recon r2, including the earlier editor re-check). Applying (a) publishes a new revision from the approved file on top of those. There is no remaining separate snapshot-import script for these two pages.

## Public dry run of (a) and (b)

Taken on 16 Nov 2026 against `https://wikiden.gg`. No production database and no Production env secrets were used. Body markdown is not exposed on a public JSON endpoint, so a matching summary does not mean the body is unchanged; the approved file is the #47 paraphrase and most bodies would still change.

```
== public dry run against https://wikiden.gg (no database, no secrets) ==

-- (a) approved Marathon revisions --
GET https://wikiden.gg/marathon/search-index.json -> 200 application/json
public search index: 38 pages.
approved file: 25 revisions, sha256 d6ab2e5efeb9.
would update 24 existing public page(s) and create 1 new page(s).
summary changes: 1; title changes: 0; pages missing from the public index: 1.
body markdown is not served on a public JSON endpoint; only titles, summaries, and headings from search-index.json, plus revision numbers from /history, were compared.
  arachne: current r1; summary unchanged; title unchanged; would supersede r1 with a new published revision.
  armory: not on the public index (history HTTP 404). would insert the page row and its first published revision (new page).
  contracts: current r1; summary unchanged; title unchanged; would supersede r1 with a new published revision.
  cores: current r1; summary unchanged; title unchanged; would supersede r1 with a new published revision.
  cryo-archive: current r1; summary unchanged; title unchanged; would supersede r1 with a new published revision.
  cyberacme: current r1; summary unchanged; title unchanged; would supersede r1 with a new published revision.
  expedition: current r1; summary unchanged; title unchanged; would supersede r1 with a new published revision.
  factions: current r2; summary unchanged; title unchanged; would supersede r2 with a new published revision.
  gameplay: current r2; summary unchanged; title unchanged; would supersede r2 with a new published revision.
  locations: current r2; summary unchanged; title unchanged; would supersede r2 with a new published revision.
  mida: current r1; summary unchanged; title unchanged; would supersede r1 with a new published revision.
  night-marsh: current r1; summary unchanged; title unchanged; would supersede r1 with a new published revision.
  nucaloric: current r1; summary unchanged; title unchanged; would supersede r1 with a new published revision.
  overview: current r2; summary unchanged; title unchanged; would supersede r2 with a new published revision.
  perimeter: current r1; summary unchanged; title unchanged; would supersede r1 with a new published revision.
  ranked: current r2; summary unchanged; title unchanged; would supersede r2 with a new published revision.
  recon: current r2; summary unchanged; title unchanged; would supersede r2 with a new published revision.
  seasonal-resets: current r1; summary unchanged; title unchanged; would supersede r1 with a new published revision.
  seasons: current r1; summary unchanged; title unchanged; would supersede r1 with a new published revision.
  sentinel: current r1; summary unchanged; title unchanged; would supersede r1 with a new published revision.
  the-cradle: current r1; SUMMARY CHANGES; title unchanged; from "The Cradle is Marathon Season 2’s system for turning loot into shared Runner shell stat progression and perks." to "The Cradle is Marathon Season 2’s system for turning loot into shared, season-limited Runner shell stat progression and perks."; would supersede r1 with a new published revision.
  thief: current r1; summary unchanged; title unchanged; would supersede r1 with a new published revision.
  traxus: current r1; summary unchanged; title unchanged; would supersede r1 with a new published revision.
  vandal: current r1; summary unchanged; title unchanged; would supersede r1 with a new published revision.
  weapons: current r2; summary unchanged; title unchanged; would supersede r2 with a new published revision.
confirm phrase if this file is later applied to production: apply 24 updated + 1 new revisions d6ab2e5efeb9 into production marathon

-- (b) GTA 6 generated pages --
GET https://wikiden.gg/gta6 -> HTTP 404 content-type=text/html x-robots-tag=noindex
GET https://wikiden.gg/gta6/overview.json -> HTTP 404 content-type=application/json x-robots-tag=noindex
GET https://wikiden.gg/gta6/search-index.json -> HTTP 404 content-type=application/json x-robots-tag=noindex
production currently serves 0 GTA 6 pages (the tenant is hidden). A one-time load would upsert the gta6 game, tenant, and categories (idempotent, same transaction) and introduce all 41 generated pages as new (sha256 0b65fb70372e).
confirm phrase if this file is later applied to production: load 41 pages 0b65fb70372e into production gta6
```

## Open decisions

- **CI Lighthouse LCP workflow.** Still open. `scripts/perf/lighthouse.workflow.yml` is not in `.github/workflows/` on `main`. Enabling it still needs a GitHub push with the `workflow` scope (move the file to `.github/workflows/lighthouse.yml`) and the repository secret `VERCEL_AUTOMATION_BYPASS_SECRET` for Vercel Protection Bypass for Automation. This PR does not add the workflow file and does not route around that refusal.
- **(d) vs (a).** Covered by (a). `ranked` and `recon` are in the 25. See (d) above.
- **AI Gateway auth for the editor cron.** The $0.276 preview rewrite used a box-local `AI_GATEWAY_API_KEY`, not Vercel OIDC. Production does not have `AI_GATEWAY_API_KEY` in the env list (names and targets only). Confirm `VERCEL_OIDC_TOKEN` is present at cron runtime, or have Mike set a Production `AI_GATEWAY_API_KEY`, before turning `WIKI_AI_EDITOR_CRON` on. See (c).
- **`GTA6_ENABLED` and the two cron flags.** Also absent from the Vercel env list, which is expected until Mike sets them.
- **`armory` on production.** In the 25-file and currently a public 404. (a) now creates the page row and its first published revision in the same transaction as the 24 updates.

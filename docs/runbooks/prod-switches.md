# Production switches

Mike approves each switch below before anyone runs it. None of these run automatically on merge. This document does not contain secrets or connection strings.

The 25 approved Marathon revisions in this PR are sha256 `d6ab2e5efeb9ec5b581deca20fed2d1e53656a858a354966924847037e271fcf` (short `d6ab2e5efeb9`). They are already on the preview database (`ep-wandering-field-bd77ppbc`) only.

## (a) Apply the 25 approved Marathon revisions to production

**What it does.** Inserts a new published revision for each page in `content/marathon/generated/approved-paraphrase-revisions.json`. It does not create missing pages. Earlier revisions stay in history.

**Command** (operator machine, not Vercel):

```
WIKI_ALLOW_PROD_CONTENT_LOAD=1 node scripts/content/load-approved-revisions.ts \
  --tenant marathon --env-file .env.local --dry-run
WIKI_ALLOW_PROD_CONTENT_LOAD=1 node scripts/content/load-approved-revisions.ts \
  --tenant marathon --env-file .env.local \
  --confirm "apply 25 approved revisions d6ab2e5efeb9 into production marathon"
```

The confirm phrase is produced by `approvedConfirmationPhrase` in `src/content/load-approved-revisions.ts`. If the file hash changes, the phrase changes and this one will be refused.

A production-secret-free dry run (what we used) is:

```
node scripts/content/load-approved-revisions.ts --tenant marathon --dry-run --public-base https://wikiden.gg
# or
node scripts/content/dry-run-prod-public.ts --base https://wikiden.gg
```

**Rollback.** History keeps the previous revision. Public history on wikiden.gg, taken before this load, is the source of the revision numbers below. After the load, a new current revision will sit on top; restore by copying the prior revision into a new one (the previous row is not deleted):

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

`armory` is in the 25-file but is not a public production page today (`/marathon/armory` and its history return 404). The loader skips slugs that have no page row. The restore command was dry-run against the preview database (endpoint `ep-wandering-field-bd77ppbc`, not production) after this file was applied there: it reported it would copy `the-cradle` r4 as a new r6 and made no write.

**Cost.** $0 model spend. The loader does not call the AI Gateway; it only writes the committed file.

**Proof.** `curl -sI https://wikiden.gg/marathon/the-cradle` is 200. The dek/meta description includes `season-limited`. `/marathon/ranked` and `/marathon/recon` stay 200 with WikiDen titles. Re-run `node scripts/content/dry-run-prod-public.ts` (Cradle summary should then match). `node scripts/e2e/gta6-flag.ts` still shows Marathon 200. Local or prod `LCP_BASE_URL=https://wikiden.gg LCP_PAGES=/marathon,/marathon/ranked LCP_RUNS=5 node scripts/perf/lcp-budget.ts`. Shots of `/marathon` and `/marathon/the-cradle`.

## (b) GTA 6 production content import, then `GTA6_ENABLED=1`

**What it does, in two steps Mike approves separately.**

1. One-time load of `content/gta6/generated/pages.json` (41 pages, sha256 `0b65fb70372e`). All 41 currently have `publishGate.decision = publish`.

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

2. Only after the load is confirmed, Mike sets the Production env var `GTA6_ENABLED=1` in the Vercel project. Do not set it in this PR. Until that flag is set, `/gta6` stays 404 with `x-robots-tag: noindex`.

**Limit.** `load-generated-once.ts` requires a `gta6` tenant row already in the database. `scripts/seed-gta6-preview.ts` refuses production. Public pages cannot tell us whether that tenant row exists. If the load reports `no wiki with slug 'gta6'`, stop; do not invent a production seed.

**Rollback.** Unset `GTA6_ENABLED` (or set it to anything other than `1`). That path is already tested: production today, with the flag absent, returns 404 + `x-robots-tag: noindex` for `/gta6` and `/gta6/overview.json`. The one-time load cannot be re-run. Loaded rows would remain in the database while the site hides `/gta6`.

**Cost.** $0 model spend for the load and for the flag. The loader does not call the AI Gateway. (Generating those pages was earlier work; this switch only loads the committed file and flips the flag.)

**Proof.** Before the flag: `curl -sI https://wikiden.gg/gta6` is still 404 + `x-robots-tag: noindex`. After the flag: `/gta6` and `/gta6/overview` are 200, titles end with `WikiDen`, and the page is indexed (no `x-robots-tag: noindex`). `E2E_BASE_URL=https://wikiden.gg node scripts/e2e/gta6-flag.ts`. `LCP_BASE_URL=https://wikiden.gg LCP_PAGES=/gta6 LCP_RUNS=5 node scripts/perf/lcp-budget.ts`. Shots of `/gta6` at 390 and 1280, light and dark.

## (c) Enable `WIKI_SOURCE_REFETCH_CRON` and `WIKI_AI_EDITOR_CRON`

**What it does.** Vercel already schedules `/api/cron/source-refetch` at 08:00 UTC and `/api/cron/wiki-update` at 09:00 UTC (`vercel.json`). Both production routes stay off until their flag is `1`. The flags are independent. Preview and development always refuse.

**Env change** (Vercel Production, values only as shown):

- `WIKI_SOURCE_REFETCH_CRON=1` — re-fetch static sources over HTTP, store new snapshots when the text hash changes, queue affected pages, list uncovered Bungie news posts. No AI calls. See README production-switch table.
- `WIKI_AI_EDITOR_CRON=1` — queue event refreshes, then process up to 3 due queue items, stopping at $0.25 of AI spend, and revalidate changed pages. See README (`WIKI_PROCESS_REFRESH_LIMIT`, Cost guardrails).

Cron requests must use the existing `CRON_SECRET` bearer. Do not print that secret. Neither flag is in the Vercel project env list today.

**Rollback.** Remove the flag or set it to anything other than `1`. The next scheduled run will refuse. Already-published editor revisions stay in history and can be rolled back with `restore-revision.ts` the same way as (a).

**Cost.** Source re-fetch: $0 model spend (README and `app/api/cron/source-refetch/route.ts`: no AI calls). Editor cron: no production run has been measured because the flag has never been on; the documented cap is $0.25 per run and at most 3 items (README). Do not treat that cap as an observed spend.

**Proof.** After a scheduled run, check Vercel function logs for the cron routes (no secrets). For the editor, look at `/marathon/<slug>/history` for a new revision the same day, and re-run `LCP_BASE_URL=https://wikiden.gg LCP_PAGES=/marathon LCP_RUNS=5 node scripts/perf/lcp-budget.ts` if a visible page changed.

## (d) Snapshot import that restores ranked and recon

**Covered by (a).** `ranked` and `recon` are both in the 25 approved revisions. Production already serves them (ranked r2, recon r2, including the earlier editor re-check). Applying (a) publishes a new revision from the approved file on top of those. There is no remaining separate snapshot-import script for these two pages.

## Public dry run of (a) and (b)

Taken on 16 Nov 2026 against `https://wikiden.gg`. No production database and no Production env secrets were used. Body markdown is not exposed on a public JSON endpoint, so a matching summary does not mean the body is unchanged; the approved file is the #47 paraphrase and most bodies would still change.

```
== public dry run against https://wikiden.gg (no database, no secrets) ==

-- (a) 25 approved Marathon revisions --
GET https://wikiden.gg/marathon/search-index.json -> 200 application/json
public search index: 38 pages.
approved file: 25 revisions, sha256 d6ab2e5efeb9.
would insert a new published revision for 25 approved page(s).
summary changes: 1; title changes: 0; pages missing from the public index: 1.
body markdown is not served on a public JSON endpoint; only titles, summaries, and headings from search-index.json, plus revision numbers from /history, were compared.
  arachne: current r1; summary unchanged; title unchanged; would supersede r1 with a new published revision.
  armory: not on the public index (history HTTP 404). would be a new published revision if the page exists in the database.
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
confirm phrase if this file is later applied to production: apply 25 approved revisions d6ab2e5efeb9 into production marathon

-- (b) GTA 6 generated pages --
GET https://wikiden.gg/gta6 -> HTTP 404 content-type=text/html x-robots-tag=noindex
GET https://wikiden.gg/gta6/overview.json -> HTTP 404 content-type=application/json x-robots-tag=noindex
GET https://wikiden.gg/gta6/search-index.json -> HTTP 404 content-type=application/json x-robots-tag=noindex
production currently serves 0 GTA 6 pages (the tenant is hidden). A one-time load of content/gta6/generated/pages.json would introduce all 41 generated pages as new (sha256 0b65fb70372e).
confirm phrase if this file is later applied to production: load 41 pages 0b65fb70372e into production gta6

```

## Open decisions

- **CI Lighthouse LCP workflow.** Still open. `scripts/perf/lighthouse.workflow.yml` is not in `.github/workflows/` on `main`. Enabling it still needs a GitHub push with the `workflow` scope (move the file to `.github/workflows/lighthouse.yml`) and the repository secret `VERCEL_AUTOMATION_BYPASS_SECRET` for Vercel Protection Bypass for Automation. This PR does not add the workflow file and does not route around that refusal.
- **(d) vs (a).** Covered by (a). `ranked` and `recon` are in the 25. See (d) above.
- **`AI_GATEWAY_API_KEY` in Production.** Not present. A Vercel project env list (names and targets only, values not read) has no `AI_GATEWAY_API_KEY` on Production or Preview. README says Vercel deployments use OIDC automatically, and the static key is for non-Vercel environments. The editor cron in (c) still needs a working Gateway credential at run time; confirm OIDC is enough before turning `WIKI_AI_EDITOR_CRON` on.
- **`GTA6_ENABLED` and the two cron flags.** Also absent from the Vercel env list, which is expected until Mike sets them.
- **`armory` on production.** In the 25-file, but not a public production page (404). (a) will skip it if there is no page row.
- **`gta6` tenant row.** Public endpoints cannot show whether production already has the tenant. If (b) fails with `no wiki with slug 'gta6'`, stop.

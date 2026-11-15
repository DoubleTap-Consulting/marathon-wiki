# Marathon real content

The content pipeline writes real, cited wiki pages. Everything here is committed. Full source renders are not, because the repo is public.

| File | Written by | Holds |
|---|---|---|
| `sources.json` | hand | Source registry: URL, publisher, `authorityTier` (`official`, `reputable_editorial`, `community_wiki`, `community`) |
| `pages.json` | hand | The 40 page specs from the content plan: slug, category, scope, keywords, preferred sources, hub children |
| `generated/pages.json` | `scripts/content/generate.ts` | Page bodies and `aiProvenance` that the preview seed loads |
| `generated/sources.manifest.json` | `scripts/content/generate.ts` | Per source: URL, fetch date, content sha256, and only the extracts a published claim cites |

## Run it

All of this runs locally on the box. Nothing here runs on Vercel.

```sh
# 1. Render every source in headless Chrome. Text goes to ../marathon-wiki-content/snapshots (outside git).
PLAYWRIGHT_DIR=/path/to/dir/with/playwright node scripts/content/snapshot.mjs

# 2. Build every prompt and estimate cost. No AI calls.
node scripts/content/generate.ts --dry-run

# 3. Generate. Needs AI_GATEWAY_API_KEY (or VERCEL_OIDC_TOKEN) in the env or .env.local. Spend is capped (CONTENT_SPEND_CAP_USD, default 15).
node scripts/content/generate.ts            # all pages
node scripts/content/generate.ts recon      # one page
```

The model is `openai/gpt-5-mini`, with `openai/gpt-5-nano` as the fallback. Claim rules are enforced in `src/content/pipeline.ts` and covered by its tests:

- Every sentence cites extracts the model was actually given.
- "Supported" requires a verbatim quote found in an official or press extract.
- A claim backed only by community sources is published as unsupported.
- Unverifiable sentences are dropped.
- "Sources disagree" needs two verified quotes from different sources.
- Patch-sensitive sentences name the update and its date.

## The AI editor loop

Generation runs through one path: `composePage` in `src/content/editor.ts`. Both the local generator and the refresh-queue worker call it.

1. **Snapshots in the database.** `editor.ts ingest` stores each render as a `wiki_sources` row with `origin: rendered_snapshot`, in the private database. When a stored sha256 changes, every page that lists or cites that source is queued with reason `source_update`.
2. **Triggers.** A changed source hash, an approved reader note (`community_note`, shown as "Prompted by a reader's note"), a weekly schedule, or a manual run each create an `AiRefreshQueueItem`. The dedupe key makes each trigger idempotent.
3. **Worker.** `processDueAiRefreshQueueItems` claims due items atomically and regenerates each page from the stored snapshots. Approved reader notes are passed to the model as hints, never as sources. The worker writes a "What changed" note that compares the old and new claims.
4. **Publish gate.** A revision is published automatically only when at least 80% of its statements are supported, at least 3 are supported, and at most 3 are backed only by community sources. Anything else becomes a pending AI suggestion in Review. Approving it keeps its provenance.
5. **Cost and safety.**
   - A per-run spend cap (`WIKI_AI_RUN_CAP_USD`, default $1) applies. When the cap is reached, the run stops and claimed items go back to the queue.
   - Calls are spaced at least `WIKI_AI_MIN_CALL_INTERVAL_MS` (default 1s) apart, and a run processes at most 20 items.
   - Without a credential, the worker claims nothing.
   - The scheduled cron runs only on Production, and only when `WIKI_AI_EDITOR_CRON=1`.

### Manual trigger (preview and local)

```sh
node --import ./scripts/content/register-ts-paths.mjs scripts/content/editor.ts status
node --import ./scripts/content/register-ts-paths.mjs scripts/content/editor.ts ingest
node --import ./scripts/content/register-ts-paths.mjs scripts/content/editor.ts enqueue recon
node --import ./scripts/content/register-ts-paths.mjs scripts/content/editor.ts process --limit 3
node --import ./scripts/content/register-ts-paths.mjs scripts/content/editor.ts drill runner-shells [--model]
```

The script refuses to run on Vercel. It also refuses any database that `scripts/db-guard.mjs` cannot prove is non-production.

`drill` runs one full refresh cycle on a temporary wiki and deletes the wiki afterwards:

1. Write the page.
2. Edit a cited snapshot.
3. Detect the hash change and queue the page.
4. Regenerate it, then diff the two revisions.

Without `--model`, the drill uses a scripted stand-in model, so it spends nothing.

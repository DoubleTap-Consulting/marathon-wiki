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

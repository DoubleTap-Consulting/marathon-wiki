# Grand Theft Auto VI wiki content

This folder is the page plan and source registry for the `gta6` tenant (`wikiden.gg/gta6`). The network brand is WikiDen; the game name appears in the subtitle, not as a competing brand.

## What lives here

- `pages.json` — about 40 starter pages aimed at pre-launch searches (release date, platforms, price and editions, characters, Leonida / Vice City, trailers, and so on).
- `sources.json` — official Rockstar pages and Newswire posts first, then platform-holder and parent-company pages, then a short list of reputable editorials.
- `images.json` — empty on purpose. No Rockstar or Take-Two artwork, logos, or screenshots are used. The theme allows tiers B and C only.
- `wiki.json` — writing context for the content pipeline (subject and official publisher name).
- `generated/` — committed page bodies after a local generate run. Not written to the production database by this folder existing.

## Generate locally

Snapshots and spend ledgers stay outside the repo:

```sh
CONTENT_WORK_DIR=../marathon-wiki-content/gta6 node scripts/content/snapshot.mjs --wiki gta6
CONTENT_WORK_DIR=../marathon-wiki-content/gta6 node scripts/content/generate.ts --wiki gta6 --dry-run
CONTENT_WORK_DIR=../marathon-wiki-content/gta6 node scripts/content/generate.ts --wiki gta6
```

The generate script never touches a database. Loading generated pages into a preview database uses `scripts/seed-preview.ts` (non-production only) or `scripts/content/load-generated-once.ts --tenant gta6`. A production import still needs an explicit confirmation phrase and `WIKI_ALLOW_PROD_CONTENT_LOAD=1`.

## Rules for these pages

- Cite public sources. Prefer Rockstar Newswire and rockstargames.com.
- Mark disagreements (for example the earlier November 12 pre-load date versus the later official November 10 date) as conflicts; do not pick a winner in prose.
- Do not state rumors or unofficial estimates as fact. A PC version has not been announced by Rockstar.
- Official materials present Grand Theft Auto VI as a single-player experience. Do not invent a VI online mode.

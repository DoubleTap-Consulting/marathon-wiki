# Marathon Wiki Implementation Plan

## Overview
Multi-tenant Grokipedia-style wiki for Marathon (and games like Arc) using
Next.js + Vercel, Neon Postgres, Prisma for schema/migrations only, and Kysely
for type-safe queries. Focus on AI-authored canonical pages, ISR performance,
ad monetization, and easy replication across games.

## Product Model

The public wiki is not a traditional human-written wiki with AI drafting help.
It should work more like Grokipedia:

- AI is the primary author of canonical article content.
- AI determines the current best factual synthesis for a page from configured
  source material, retrieved context, prior page revisions, and community notes.
- Public pages clearly show when the canonical AI content was last updated.
- Human input is captured as community notes, corrections, source submissions,
  and disputes rather than direct edits to the canonical article body.
- Community notes are visible on the article and feed future AI regeneration,
  but they do not replace canonical content until the AI refresh process
  incorporates or rejects them.
- Human editors moderate abuse, sources, and disputed notes; they are not the
  default content production path.

In this product, "truth" means the latest AI-generated, source-backed synthesis
the system is willing to publish. The UI must make that status legible by
showing last update time, update provenance, and community-note context.

## Tech Stack
- **Frontend**: Next.js 16 App Router (ISR, Server Components, Server Actions)
- **Hosting**: Vercel
- **Database**: Neon Postgres (serverless, pooled driver)
- **Schema/Migrations**: Prisma (dev-only, prisma-kysely generator)
- **Queries**: Kysely (lightweight, type-safe)
- **Auth**: Clerk or Better Auth
- **Styling**: Tailwind + shadcn/ui
- **AI**: Vercel AI Gateway, with Grok/xAI preferred when account access and
  model availability allow it
- **Monetization**: Light ads + premium

## Architecture
- Multi-tenant via path/subdomain + `tenant_id`
- ISR with `revalidateTag` on AI content refresh and approved moderation events
- Canonical page data separates AI-authored article body from community notes
- AI content updates preserve revision history with model, prompt, source,
  retrieval, and generation metadata
- Data flow: Sources + existing page + community notes → AI synthesis → canonical
  page revision → public page + `last updated` indicator
- Scheduled update flow: weekly stale-page queueing plus daily event discovery
  feed the same bounded refresh queue; curated source ingestion and optional
  source discovery run before generation so refreshed pages can pick up new
  source context without editor-triggered regeneration.
- Human flow: Community note/source submission → moderation → AI refresh context
  → canonical page revision when incorporated

## Required AI Content Capabilities

- Generate new canonical pages for Marathon-specific topics such as weapons,
  factions, maps, mechanics, and lore.
- Refresh existing canonical pages when source material or community notes
  change.
- Store AI provenance for every canonical revision, including model id, prompt
  version, generated-at timestamp, source references, and response id when
  available.
- Surface public `Last AI update` metadata on article pages and list views.
- Keep public pages readable even when AI Gateway is temporarily unavailable;
  failures should block only new refresh jobs, not existing public content.
- Support model-agnostic routing through Vercel AI Gateway while allowing a
  Grok/xAI model to be selected when available.
- Keep scheduled updates low-cost through per-run limits, queue dedupe keys,
  stale-page eligibility checks, explicit event targets, and bounded source
  discovery.

## Phase 14 Scheduled Update Loop

The scheduled update system should keep canonical pages fresh without turning
launch into a high-frequency crawler or model-spend loop.

- `vercel.json` schedules `/api/cron/wiki-update` for a weekly maintenance run
  at `0 8 * * 1` UTC and a daily event/due-queue sweep at `0 9 * * *` UTC.
- The aggregate route uses Vercel's `x-vercel-cron-schedule` header to infer
  `weekly` or `events` mode. Manual local checks can pass `mode` explicitly.
- Weekly maintenance runs curated source ingestion first, then optional
  configured source discovery, then stale-page queueing, then due queue
  processing. This keeps source context ahead of generation.
- Event discovery looks ahead `7` days and schedules targeted refreshes for the
  event date. Events can come from a provider endpoint or explicit local
  payloads.
- Queue processing is the only default step that can call AI Gateway. The
  aggregate route defaults to `WIKI_PROCESS_REFRESH_LIMIT=1`; weekly enqueueing
  defaults to `WIKI_WEEKLY_REFRESH_LIMIT=3`; source discovery defaults to `3`
  candidates and is hard-capped at `5`.
- The queue is reconciliation-oriented: weekly items dedupe by UTC week, event
  items dedupe by event key/date/target, and duplicate cron delivery should be
  harmless.
- Local verification should use explicit POST payloads documented in
  `README.md` so source discovery, source ingestion, queueing, event discovery,
  and due processing can be checked independently.

## Community Notes

- Signed-in users can submit notes, corrections, source links, and disputed
  claims on any article.
- Notes have moderation status and lightweight reputation/attribution metadata.
- Approved notes appear alongside the canonical article body.
- Notes are part of the context for future AI refreshes.
- Pages distinguish between canonical AI content and community notes visually
  and semantically.

## Folder Structure
```
marathon-wiki/
├── app/
├── src/db/          # Kysely types + connection
├── prisma/          # schema.prisma only
└── README.md
```

## Next Steps
- Expand the starter Marathon corpus beyond the currently generated pages.
- Add a configured low-cost event/source discovery provider when provider cost
  and quality are acceptable.
- Improve claim verification from heuristic support matching toward stronger
  source-aware contradiction handling.
- Continue tuning public provenance so readers can inspect why AI-authored
  content is trusted without turning articles into process logs.

Goal: 30k+ pageviews with clean, scalable UX.

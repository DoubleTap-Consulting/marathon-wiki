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
- Replace the current editor-only AI draft workflow with AI canonical page
  generation and refresh jobs.
- Add Marathon-specific source ingestion and retrieval so pages are generated
  from source-backed context rather than generic model knowledge.
- Add community notes as the human contribution surface.
- Add article UI for `Last AI update`, AI provenance, community notes, and
  source references.
- Bulk-generate a useful starter Marathon corpus before launch.

Goal: 30k+ pageviews with clean, scalable UX.

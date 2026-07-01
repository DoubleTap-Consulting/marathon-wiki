# Marathon Wiki Implementation Plan

## Overview
Multi-tenant Grokipedia-style wiki for Marathon (and games like Arc) using Next.js + Vercel, Neon Postgres, Prisma for schema/migrations only, Kysely for type-safe queries. Focus on ISR for performance, ad monetization, and easy replication across games.

## Tech Stack
- **Frontend**: Next.js 16 App Router (ISR, Server Components, Server Actions)
- **Hosting**: Vercel
- **Database**: Neon Postgres (serverless, pooled driver)
- **Schema/Migrations**: Prisma (dev-only, prisma-kysely generator)
- **Queries**: Kysely (lightweight, type-safe)
- **Auth**: Clerk or Better Auth
- **Styling**: Tailwind + shadcn/ui
- **AI**: Grok API
- **Monetization**: Light ads + premium

## Architecture
- Multi-tenant via path/subdomain + `tenant_id`
- ISR with `revalidateTag` on edits
- Data flow: Suggestions → AI review → DB → webhook revalidate

## Folder Structure
```
marathon-wiki/
├── app/
├── src/db/          # Kysely types + connection
├── prisma/          # schema.prisma only
└── README.md
```

## Next Steps
- Add game-specific pages
- Implement AI generation
- Test monetization

Goal: 30k+ pageviews with clean, scalable UX.
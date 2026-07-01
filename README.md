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
1. Clone & `pnpm install`
2. Set `DATABASE_URL` (Neon pooled)
3. `npx prisma generate`
4. `pnpm dev`

Target: Clean UX, ISR performance, ad monetization.
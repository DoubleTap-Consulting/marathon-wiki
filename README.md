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
5. Run locally: `pnpm dev`

## Environment

| Name | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes for storage smoke checks | Neon pooled Postgres connection string used by Prisma migrations and Kysely queries. |

The app can build without `DATABASE_URL`, but `/api/health` reports storage as unconfigured until the variable is present.

## Deployment

- Build command: `pnpm build`
- Vercel build command alias: `pnpm vercel:build`
- Install command: `pnpm install`
- Health check: `/api/health`

### Vercel + Neon setup

1. Create or link a Vercel project for this repository.
2. Provision a Neon Postgres database with a pooled connection string.
3. Add `DATABASE_URL` to the Vercel project for Preview and Production.
4. Run migrations against the Neon database: `pnpm db:migrate`.
5. Deploy to Vercel.
6. Verify `/api/health` returns `"ok": true` and does not expose the raw connection string.

Phase 1 proves the deployment surface, dependency graph, Prisma generation, Kysely generation, and Neon connectivity. Real wiki content, auth, AI generation, and monetization are intentionally deferred to later phases.

Target: Clean UX, ISR performance, ad monetization.

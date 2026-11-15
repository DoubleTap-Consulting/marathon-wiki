// Vercel build entry. Runs `prisma migrate deploy` only against the database that
// belongs to the environment being built:
//   - production: always (VERCEL_ENV=production uses the production DATABASE_URL).
//   - preview: only when WIKI_DATABASE_ROLE=preview AND the target database carries
//     the preview marker comment. Anything else skips migrations, so a preview that
//     still inherits production credentials can never migrate production.
//   - anything else (development, local): never.
// Never runs `migrate dev` or `db push`. Never prints connection strings.
import { execSync } from "node:child_process";

import { Pool } from "@neondatabase/serverless";

const PREVIEW_DATABASE_MARKER = "marathon-wiki:sample-preview";

function run(command) {
  execSync(command, { stdio: "inherit" });
}

function migrationUrl() {
  // Same precedence as prisma.config.ts.
  return (
    process.env.DATABASE_URL_UNPOOLED ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.DATABASE_URL
  );
}

async function isMarkedPreviewDatabase(connectionString) {
  const pool = new Pool({ connectionString });

  try {
    const result = await pool.query(
      "select shobj_description(oid, 'pg_database') as comment from pg_database where datname = current_database()",
    );

    return result.rows[0]?.comment === PREVIEW_DATABASE_MARKER;
  } catch (error) {
    console.warn(`vercel-build: could not read the database marker (${error.code ?? "error"}).`);
    return false;
  } finally {
    await pool.end();
  }
}

async function shouldMigrate() {
  const vercelEnv = process.env.VERCEL_ENV;
  const url = migrationUrl();

  if (!url) return { migrate: false, why: "no database URL is configured" };
  if (vercelEnv === "production") return { migrate: true, why: "production build" };

  if (vercelEnv === "preview") {
    if (process.env.WIKI_DATABASE_ROLE !== "preview") {
      return { migrate: false, why: "WIKI_DATABASE_ROLE is not 'preview' for this branch" };
    }

    if (!(await isMarkedPreviewDatabase(url))) {
      return { migrate: false, why: "the target database is not marked as a preview database" };
    }

    return { migrate: true, why: "marked preview database" };
  }

  return { migrate: false, why: `VERCEL_ENV is ${vercelEnv ?? "unset"}` };
}

run("prisma generate");

const decision = await shouldMigrate();
console.log(`vercel-build: ${decision.migrate ? "running" : "skipping"} prisma migrate deploy (${decision.why}).`);

if (decision.migrate) run("prisma migrate deploy");

run("next build");

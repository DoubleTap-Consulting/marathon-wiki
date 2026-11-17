// Vercel build entry.
//   - every environment: the theme checks run first (scripts/theme/build.ts), then the image license gate
//     (scripts/images/check.ts), then the source-fidelity / editor-note check
//     (scripts/content/check-source-overlap.ts); a failing theme, image, or content check fails the build.
//   - production: prisma migrate deploy, then next build (unchanged behaviour).
//   - preview: the database must be proven non-production first (see scripts/db-guard.mjs).
//     With Neon branch-per-preview, Neon injects the branch's connection vars at deploy time.
//     If no URL is set, or any database var points at the production endpoint, the build
//     FAILS. Otherwise: prisma migrate deploy, then the Marathon and GTA 6 preview seeds, then next build.
//   - anything else (development, local): no migrations, no seed.
// Never runs `migrate dev` or `db push`. Never prints connection strings or hostnames.
import { execSync } from "node:child_process";

import { checkNonProductionTarget } from "./db-guard.mjs";

function run(command, env = process.env) {
  execSync(command, { stdio: "inherit", env });
}

function failBuild(message) {
  console.error(`vercel-build: FAILING the build. ${message}`);
  process.exit(1);
}

run("node scripts/theme/build.ts");
run("node scripts/images/check.ts");
run("node scripts/content/check-source-overlap.ts");

const vercelEnv = process.env.VERCEL_ENV;

if (vercelEnv === "preview") {
  // Check before anything touches a database (prisma generate does not connect).
  const guard = checkNonProductionTarget();
  if (!guard.ok) failBuild(`Preview database guard: ${guard.reason}. Nothing was migrated or seeded.`);
  console.log("vercel-build: preview database guard passed (target endpoint is not production).");
}

run("prisma generate");

if (vercelEnv === "production") {
  console.log("vercel-build: running prisma migrate deploy (production build).");
  run("prisma migrate deploy");
} else if (vercelEnv === "preview") {
  console.log("vercel-build: running prisma migrate deploy (preview database).");
  run("prisma migrate deploy");
  console.log("vercel-build: running the sample seed (preview database).");
  run("node scripts/seed-preview.ts", { ...process.env, ALLOW_SAMPLE_SEED: "1" });
  console.log("vercel-build: running the GTA 6 preview seed (preview database).");
  run("node scripts/seed-gta6-preview.ts", { ...process.env, ALLOW_SAMPLE_SEED: "1" });
} else {
  console.log(`vercel-build: skipping migrations and seed (VERCEL_ENV is ${vercelEnv ?? "unset"}).`);
}

run("next build");

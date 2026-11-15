import { Pool, defaults, types } from "@neondatabase/serverless";
import { Kysely, PostgresDialect, type PostgresDialectConfig } from "kysely";

import type { DB } from "./types";

let db: Kysely<DB> | null = null;

// Prisma's TIMESTAMP(3) columns hold UTC wall time. Read and write them as UTC so a process whose
// TZ is not UTC (local dev, scripts) agrees with Vercel, which always runs in UTC.
const TIMESTAMP_WITHOUT_TZ = 1114;
types.setTypeParser(TIMESTAMP_WITHOUT_TZ, (value: string) => new Date(`${value.replace(" ", "T")}Z`));
defaults.parseInputDatesAsUTC = true;

export function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}

export function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!db) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    }) as unknown as PostgresDialectConfig["pool"];

    db = new Kysely<DB>({
      dialect: new PostgresDialect({
        pool,
      }),
    });
  }

  return db;
}

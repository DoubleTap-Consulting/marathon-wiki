import { Pool } from "@neondatabase/serverless";
import { Kysely, PostgresDialect, type PostgresDialectConfig } from "kysely";

import type { DB } from "./types";

let db: Kysely<DB> | null = null;

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

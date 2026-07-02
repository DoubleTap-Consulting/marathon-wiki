import { sql } from "kysely";

import { getDb, hasDatabaseUrl } from "./client";

export type StorageSmokeResult =
  | {
      ok: true;
      configured: true;
      checkedAt: string;
      latencyMs: number;
    }
  | {
      ok: false;
      configured: false;
      checkedAt: string;
      message: string;
    }
  | {
      ok: false;
      configured: true;
      checkedAt: string;
      latencyMs: number;
      message: string;
    };

export async function checkStorage(): Promise<StorageSmokeResult> {
  const checkedAt = new Date().toISOString();

  if (!hasDatabaseUrl()) {
    return {
      ok: false,
      configured: false,
      checkedAt,
      message: "DATABASE_URL is not configured.",
    };
  }

  const start = performance.now();

  try {
    await sql`select 1 as ok`.execute(getDb());

    return {
      ok: true,
      configured: true,
      checkedAt,
      latencyMs: Math.round(performance.now() - start),
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      checkedAt,
      latencyMs: Math.round(performance.now() - start),
      message: error instanceof Error ? error.message : "Unknown database error.",
    };
  }
}

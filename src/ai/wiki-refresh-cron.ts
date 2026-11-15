import { NextResponse } from "next/server";

/** Each scheduled job has its own Production switch, so turning one on never turns on the other. */
export const CRON_FLAGS = {
  editor: "WIKI_AI_EDITOR_CRON",
  sourceRefetch: "WIKI_SOURCE_REFETCH_CRON",
} as const;

export type CronJob = keyof typeof CRON_FLAGS;

export function isAiRefreshCronRequestAuthorized(
  request: Request,
  env: Partial<NodeJS.ProcessEnv> = process.env,
  job: CronJob = "editor",
) {
  // Scheduled AI work spends AI credits and writes to the database, so it only
  // runs on Production. Vercel Cron only fires there; this also blocks manual
  // calls against Preview deployments.
  if (env.VERCEL_ENV && env.VERCEL_ENV !== "production") {
    return false;
  }

  // Even on Production, each scheduled job stays off until its own flag is set to 1.
  if (env.VERCEL_ENV === "production" && env[CRON_FLAGS[job]] !== "1") {
    return false;
  }

  const secret = env.WIKI_CRON_SECRET?.trim() || env.CRON_SECRET?.trim();

  if (!secret) {
    return env.NODE_ENV !== "production";
  }

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export function unauthorizedCronResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: "Unauthorized cron request.",
    },
    { status: 401 },
  );
}

export async function readCronJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

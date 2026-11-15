import { NextResponse } from "next/server";

export function isAiRefreshCronRequestAuthorized(
  request: Request,
  env: Partial<NodeJS.ProcessEnv> = process.env,
) {
  // Scheduled AI work spends AI credits and writes to the database, so it only
  // runs on Production. Vercel Cron only fires there; this also blocks manual
  // calls against Preview deployments.
  if (env.VERCEL_ENV && env.VERCEL_ENV !== "production") {
    return false;
  }

  // Even on Production, the AI editor's scheduled work stays off until it is switched on explicitly.
  if (env.VERCEL_ENV === "production" && env.WIKI_AI_EDITOR_CRON !== "1") {
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

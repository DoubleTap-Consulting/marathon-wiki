import { NextResponse } from "next/server";

export function isAiRefreshCronRequestAuthorized(
  request: Request,
  env: Partial<NodeJS.ProcessEnv> = process.env,
) {
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

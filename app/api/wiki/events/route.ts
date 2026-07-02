import { NextResponse } from "next/server";

import {
  isWikiAnalyticsEnabled,
  redactWikiAnalyticsHeaders,
  sanitizeWikiAnalyticsEvent,
} from "@/src/analytics/wiki-events";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isWikiAnalyticsEnabled()) {
    return new NextResponse(null, { status: 204 });
  }

  const event = sanitizeWikiAnalyticsEvent(await readJson(request));

  if (!event) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  console.info(
    "wiki_analytics_event",
    JSON.stringify({
      ...event,
      receivedAt: new Date().toISOString(),
      ...redactWikiAnalyticsHeaders(request.headers),
    }),
  );

  return new NextResponse(null, { status: 204 });
}

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

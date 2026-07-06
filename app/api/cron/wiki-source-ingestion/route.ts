import { NextResponse } from "next/server";

import {
  isAiRefreshCronRequestAuthorized,
  readCronJson,
  unauthorizedCronResponse,
} from "@/src/ai/wiki-refresh-cron";
import { runCuratedWikiSourceIngestion } from "@/src/sources/wiki-source-ingestion";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleWikiSourceIngestionCron(request);
}

export async function POST(request: Request) {
  return handleWikiSourceIngestionCron(request, await readCronJson(request));
}

async function handleWikiSourceIngestionCron(request: Request, body?: unknown) {
  if (!isAiRefreshCronRequestAuthorized(request)) {
    return unauthorizedCronResponse();
  }

  const url = new URL(request.url);
  const payload = normalizePayload(body);
  const result = await runCuratedWikiSourceIngestion({
    tenantId:
      readString(payload.tenantId) ??
      readString(url.searchParams.get("tenantId")),
    tenantSlug:
      readString(payload.tenantSlug) ??
      readString(url.searchParams.get("tenantSlug")),
    topicSlug:
      readString(payload.topicSlug) ??
      readString(url.searchParams.get("topicSlug")),
    sourceIds:
      readStringList(payload.sourceIds) ??
      readCommaList(url.searchParams.get("sourceIds")),
  });

  return NextResponse.json({
    ok: result.failed.length === 0,
    tenantsProcessed: result.tenantsProcessed,
    sourcesAttempted: result.sourcesAttempted,
    upsertedCount: result.upserted.length,
    failedCount: result.failed.length,
    upserted: result.upserted.map((source) => ({
      id: source.id,
      sourceKey: source.sourceKey,
      title: source.title,
      topicSlugs: source.topicSlugs,
      authorityTier: source.authorityTier,
      authorityScore: source.authorityScore,
      usedFallbackContext: source.usedFallbackContext,
    })),
    failed: result.failed,
  });
}

function normalizePayload(value: unknown) {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);

  return values.length > 0 ? values : undefined;
}

function readCommaList(value: string | null) {
  if (!value?.trim()) {
    return undefined;
  }

  const values = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return values.length > 0 ? values : undefined;
}

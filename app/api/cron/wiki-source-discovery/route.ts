import { NextResponse } from "next/server";

import {
  isAiRefreshCronRequestAuthorized,
  readCronJson,
  unauthorizedCronResponse,
} from "@/src/ai/wiki-refresh-cron";
import {
  runWikiSourceDiscovery,
  type WikiSourceDiscoveryCandidate,
} from "@/src/sources/wiki-source-discovery";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleWikiSourceDiscoveryCron(request);
}

export async function POST(request: Request) {
  return handleWikiSourceDiscoveryCron(request, await readCronJson(request));
}

async function handleWikiSourceDiscoveryCron(request: Request, body?: unknown) {
  if (!isAiRefreshCronRequestAuthorized(request)) {
    return unauthorizedCronResponse();
  }

  const url = new URL(request.url);
  const payload = normalizePayload(body);
  const result = await runWikiSourceDiscovery({
    tenantId:
      readString(payload.tenantId) ??
      readString(url.searchParams.get("tenantId")),
    tenantSlug:
      readString(payload.tenantSlug) ??
      readString(url.searchParams.get("tenantSlug")),
    topicSlug:
      readString(payload.topicSlug) ??
      readString(url.searchParams.get("topicSlug")) ??
      "",
    query:
      readString(payload.query) ?? readString(url.searchParams.get("query")),
    limit:
      readPositiveInteger(payload.limit) ??
      readPositiveInteger(url.searchParams.get("limit")),
    candidates:
      readCandidateSources(payload.candidates) ??
      readCandidateSources(payload.candidateSources) ??
      readCandidateSources(payload.sources),
  });

  return NextResponse.json({
    ok: result.failed.length === 0,
    tenantsProcessed: result.tenantsProcessed,
    providerUsed: result.providerUsed,
    query: result.query,
    candidatesDiscovered: result.candidatesDiscovered,
    candidatesAttempted: result.candidatesAttempted,
    upsertedCount: result.upserted.length,
    failedCount: result.failed.length,
    upserted: result.upserted.map((source) => ({
      id: source.id,
      sourceKey: source.sourceKey,
      title: source.title,
      url: source.url,
      topicSlugs: source.topicSlugs,
      authorityTier: source.authorityTier,
      authorityScore: source.authorityScore,
      fetchedContext: source.fetchedContext,
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

function readPositiveInteger(value: unknown) {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  return Number.isFinite(number) && number > 0
    ? Math.floor(number)
    : undefined;
}

function readCandidateSources(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const candidates = value.filter(
    (entry): entry is WikiSourceDiscoveryCandidate =>
      typeof entry === "object" && entry !== null,
  );

  return candidates.length > 0 ? candidates : undefined;
}

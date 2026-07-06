import type { WikiSourceReference } from "@/src/db/wiki";

export type WikiClaimSupportStatus =
  | "supported"
  | "unsupported"
  | "contradicted";

export type WikiClaimSupport = {
  claimId: string;
  claimText: string;
  status: WikiClaimSupportStatus;
  supportScore: number;
  matchedTerms: string[];
  missingTerms: string[];
  matchedSourceIds: string[];
  matchedSourceKeys: Array<string | null>;
  matchedSourceTitles: string[];
  reason: string;
};

const STOP_WORDS = new Set([
  "about",
  "after",
  "also",
  "among",
  "because",
  "before",
  "being",
  "between",
  "could",
  "current",
  "details",
  "during",
  "future",
  "general",
  "include",
  "includes",
  "including",
  "known",
  "marathon",
  "might",
  "public",
  "should",
  "source",
  "sources",
  "their",
  "there",
  "these",
  "those",
  "through",
  "within",
  "would",
]);

const CLAIM_VERB_PATTERN =
  /\b(are|can|contains?|depends?|described|expected|has|have|identif(?:y|ies|ied)|include|involves?|is|list(?:s|ed)?|named?|noted?|requires?|reports?|says?|shows?|uses?)\b/i;

export function verifyCanonicalClaims(input: {
  title: string;
  summary: string | null;
  bodyMarkdown: string;
  sourceReferences: WikiSourceReference[];
  limit?: number;
}): WikiClaimSupport[] {
  const claims = extractImportantClaims(
    [input.summary, input.bodyMarkdown].filter(Boolean).join("\n\n"),
    input.limit ?? 8,
  );
  const sources = input.sourceReferences
    .filter((source) => source.contextText?.trim())
    .map((source) => ({
      source,
      text: normalizeText(
        [
          source.title,
          source.publisher,
          source.sourceKey,
          source.contextText,
        ]
          .filter(Boolean)
          .join(" "),
      ),
    }));

  return claims.map((claim, index) =>
    verifyClaimAgainstSources(claim, index, sources),
  );
}

export function extractImportantClaims(value: string, limit = 8) {
  const candidates = value
    .replace(/^#{1,6}\s+/gm, "")
    .split(/\n+|(?<=[.!?])\s+/)
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .flatMap((line) => splitLongClaimLine(line))
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 40)
    .filter((line) => CLAIM_VERB_PATTERN.test(line));
  const seen = new Set<string>();
  const claims: string[] = [];

  for (const candidate of candidates) {
    const key = candidate.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    claims.push(candidate);

    if (claims.length >= limit) {
      break;
    }
  }

  return claims;
}

function verifyClaimAgainstSources(
  claimText: string,
  index: number,
  sources: Array<{ source: WikiSourceReference; text: string }>,
): WikiClaimSupport {
  const claimTerms = extractClaimTerms(claimText);
  const minimumMatches = Math.min(
    4,
    Math.max(2, Math.ceil(claimTerms.length * 0.35)),
  );
  const matches = sources
    .map(({ source, text }) => {
      const matchedTerms = claimTerms.filter((term) => text.includes(term));
      const supportScore =
        claimTerms.length > 0 ? matchedTerms.length / claimTerms.length : 0;
      const contradiction = detectsNegationConflict(
        claimText,
        text,
        matchedTerms,
      );

      return {
        source,
        matchedTerms,
        supportScore,
        contradiction,
      };
    })
    .filter(
      (match) =>
        match.matchedTerms.length >= minimumMatches || match.contradiction,
    )
    .sort((a, b) => b.supportScore - a.supportScore);
  const contradicted = matches.some((match) => match.contradiction);
  const matchedTerms = Array.from(
    new Set(matches.flatMap((match) => match.matchedTerms)),
  );
  const missingTerms = claimTerms.filter((term) => !matchedTerms.includes(term));
  const supported =
    !contradicted && matches.some((match) => match.supportScore >= 0.35);
  const status: WikiClaimSupportStatus = contradicted
    ? "contradicted"
    : supported
      ? "supported"
      : "unsupported";

  return {
    claimId: `claim_${index + 1}`,
    claimText,
    status,
    supportScore: Math.round((matches[0]?.supportScore ?? 0) * 100) / 100,
    matchedTerms,
    missingTerms,
    matchedSourceIds: matches.map((match) => match.source.id),
    matchedSourceKeys: matches.map((match) => match.source.sourceKey),
    matchedSourceTitles: matches.map((match) => match.source.title),
    reason: buildReason(status, matches.length, missingTerms),
  };
}

function splitLongClaimLine(line: string) {
  if (line.length <= 280) {
    return [line];
  }

  return line
    .split(/;\s+|\.\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractClaimTerms(value: string) {
  const normalized = normalizeText(value);
  const terms = normalized
    .split(/\s+/)
    .map((term) => term.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""))
    .filter((term) => term.length >= 4)
    .filter((term) => !STOP_WORDS.has(term));

  return Array.from(new Set(terms)).slice(0, 18);
}

function detectsNegationConflict(
  claimText: string,
  sourceText: string,
  matchedTerms: string[],
) {
  if (matchedTerms.length < 3) {
    return false;
  }

  const normalizedClaim = normalizeText(claimText);
  const claimOfficial = /\bofficial\b.*\b(canonical\s+)?list\b/.test(
    normalizedClaim,
  );
  const claimDeniesOfficial = deniesOfficialList(normalizedClaim);
  const sourceDeniesOfficial = deniesOfficialList(sourceText);
  const sourceAssertsOfficial =
    assertsOfficialList(sourceText) && !sourceDeniesOfficial;

  if (claimOfficial && !claimDeniesOfficial && sourceDeniesOfficial) {
    return true;
  }

  if (claimOfficial && claimDeniesOfficial && sourceAssertsOfficial) {
    return true;
  }

  return false;
}

function deniesOfficialList(value: string) {
  return /\b(no|not|lack|lacks|without)\b.{0,50}\bofficial\b.{0,70}\b(canonical\s+)?list\b/.test(
    value,
  );
}

function assertsOfficialList(value: string) {
  return /\bofficial\b.{0,70}\b(canonical\s+)?list\b/.test(value);
}

function buildReason(
  status: WikiClaimSupportStatus,
  matchedSourceCount: number,
  missingTerms: string[],
) {
  if (status === "supported") {
    return `Matched against ${matchedSourceCount} source record${
      matchedSourceCount === 1 ? "" : "s"
    }.`;
  }

  if (status === "contradicted") {
    return "Potential negation or official-status conflict detected in source context.";
  }

  return missingTerms.length > 0
    ? `No source record matched key terms: ${missingTerms.slice(0, 6).join(", ")}.`
    : "No source record matched this claim.";
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

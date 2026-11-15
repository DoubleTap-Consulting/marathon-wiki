/**
 * The AI editor's page step, with no I/O: it takes a page spec, the rendered source corpus and a
 * model caller, and returns a page revision, its aiProvenance, the publish-gate decision and a
 * "What changed" note. The local generator script and the refresh-queue worker both call it, so
 * there is one generation path.
 */
import type { ZodType } from "zod";

import {
  CHECK_SYSTEM,
  DRAFT_SYSTEM,
  assembleMarkdown,
  buildCheckPrompt,
  buildDraftPrompt,
  buildProvenance,
  chunkSnapshot,
  countReadableWords,
  datePatchClaims,
  isHubSpec,
  isTableShapedExtract,
  claimCheckSchema,
  draftSchema,
  parseWeaponTable,
  quoteOccursIn,
  resolveClaims,
  selectExtracts,
  validateDraft,
  type ClaimStatus,
  type Extract,
  type PageSpec,
  type Rejection,
  type ResolvedClaim,
  type SourceRecord,
} from "./pipeline.ts";

export type ModelStep = "draft" | "claim-check";

export type StructuredCall = <T>(request: {
  page: string;
  step: ModelStep;
  system: string;
  prompt: string;
  schema: ZodType<T>;
}) => Promise<{ output: T; modelId: string; responseId: string | null }>;

/** One rendered source document. Full text lives outside git: on the box, or in the private database. */
export type Snapshot = { sourceKey: string; text: string; sha256: string | null; fetchedAt: string | null };

export type Corpus = {
  sources: Map<string, SourceRecord>;
  snapshots: Map<string, Snapshot>;
  extractsBySource: Map<string, Extract[]>;
  extractsById: Map<string, Extract>;
};

export function buildCorpus(sources: SourceRecord[], snapshots: Snapshot[]): Corpus {
  const registry = new Map(sources.map((source) => [source.sourceKey, source]));
  const usable = snapshots.filter((snapshot) => registry.has(snapshot.sourceKey) && snapshot.text.trim());
  const extractsBySource = new Map(usable.map((snapshot) => [snapshot.sourceKey, chunkSnapshot(snapshot.sourceKey, snapshot.text)]));
  return {
    sources: registry,
    snapshots: new Map(usable.map((snapshot) => [snapshot.sourceKey, snapshot])),
    extractsBySource,
    extractsById: new Map([...extractsBySource.values()].flat().map((extract) => [extract.id, extract])),
  };
}

// ---------------------------------------------------------------------------
// Publish gate

export type PublishPolicy = { minSupportedRatio: number; minSupportedClaims: number; maxUnsupported: number; minHubWords: number };

/**
 * Auto-publish only when nearly every statement is backed by an official or press quote, and a
 * hub page is long enough to be worth landing on (a thin hub goes to Review instead).
 */
export const DEFAULT_PUBLISH_POLICY: PublishPolicy = { minSupportedRatio: 0.8, minSupportedClaims: 3, maxUnsupported: 3, minHubWords: 250 };

/** What the gate needs to know about the page itself, beyond its claims. */
export type GateShape = { hub: boolean; words: number };

export type GateResult = {
  decision: "publish" | "needs_review";
  supported: number;
  unsupported: number;
  contradicted: number;
  supportedRatio: number;
  reasons: string[];
  policy: PublishPolicy;
  shape?: GateShape;
};

/**
 * Contradicted claims count as honest, since resolveClaims only keeps a disagreement when two
 * sources' quotes verify. Unsupported claims (community-only) pull the ratio down.
 */
export function evaluatePublishGate(
  claims: Array<{ status: ClaimStatus }>,
  policy: PublishPolicy = DEFAULT_PUBLISH_POLICY,
  shape?: GateShape,
): GateResult {
  const count = (status: ClaimStatus) => claims.filter((claim) => claim.status === status).length;
  const supported = count("supported");
  const unsupported = count("unsupported");
  const contradicted = count("contradicted");
  const supportedRatio = supported + unsupported === 0 ? 0 : supported / (supported + unsupported);
  const reasons: string[] = [];
  if (supported < policy.minSupportedClaims) reasons.push(`only ${supported} supported statements (need ${policy.minSupportedClaims})`);
  if (supportedRatio < policy.minSupportedRatio) {
    reasons.push(`${Math.round(supportedRatio * 100)}% of statements supported (need ${Math.round(policy.minSupportedRatio * 100)}%)`);
  }
  if (unsupported > policy.maxUnsupported) reasons.push(`${unsupported} statements only community sources back (max ${policy.maxUnsupported})`);
  if (shape?.hub && shape.words < policy.minHubWords) reasons.push(`hub page has ${shape.words} words (need ${policy.minHubWords})`);
  return { decision: reasons.length ? "needs_review" : "publish", supported, unsupported, contradicted, supportedRatio, reasons, policy, ...(shape ? { shape } : {}) };
}

// ---------------------------------------------------------------------------
// "What changed"

type ClaimLike = { claimText: string; status: string };

function key(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const TRIGGER_PHRASE: Record<string, string> = {
  new_page: "First version of the page, written from cited sources.",
  source_update: "A cited source changed",
  community_note: "A reader's note prompted a re-check",
  scheduled_weekly: "Weekly re-check against the sources",
  manual_refresh: "An editor asked for a re-check",
};

function words(text: string) {
  return new Set(key(text).split(" ").filter((word) => word.length > 2));
}

/** Two statements are "the same" when most of their words overlap, so a reworded sentence is not counted as new. */
export function sameStatement(a: string, b: string) {
  const left = words(a);
  const right = words(b);
  const shared = [...left].filter((word) => right.has(word)).length;
  return shared / Math.max(1, new Set([...left, ...right]).size) >= 0.6;
}

/** A plain-language revision note that compares claim sets. Shown as "What changed". */
export function describeChanges(input: { previous: ClaimLike[] | null; next: ClaimLike[]; refreshReason: string; changedSources?: string[] }) {
  if (!input.previous?.length) return TRIGGER_PHRASE.new_page;
  const previous = input.previous;
  const match = (claim: ClaimLike, pool: ClaimLike[]) => pool.find((candidate) => key(candidate.claimText) === key(claim.claimText) || sameStatement(candidate.claimText, claim.claimText));
  const added = input.next.filter((claim) => !match(claim, previous)).length;
  const removed = previous.filter((claim) => !match(claim, input.next)).length;
  const disputed = input.next.filter((claim) => claim.status === "contradicted" && match(claim, previous)?.status !== "contradicted").length;
  const parts = [
    added && `${added} statement${added === 1 ? "" : "s"} added`,
    removed && `${removed} removed`,
    disputed && `${disputed} now marked as sources disagreeing`,
  ].filter(Boolean);
  const lead = TRIGGER_PHRASE[input.refreshReason] ?? "Re-checked against the sources";
  const sources = input.changedSources?.length ? ` (${input.changedSources.join(", ")})` : "";
  return `${lead}${sources}: ${parts.length ? parts.join(", ") : "no statements changed"}.`;
}

// ---------------------------------------------------------------------------
// Compose one page

export type ComposedPage = {
  slug: string;
  title: string;
  summary: string;
  category: string;
  bodyMarkdown: string;
  aiProvenance: ReturnType<typeof buildProvenance> & { publishGate: GateResult };
  rejected: Rejection[];
  citedExtractIds: string[];
  /** The extract texts behind each cited id (the only source text that may be committed or copied to revision rows). */
  citedExtracts: Extract[];
  gate: GateResult;
};

function weaponsTable(corpus: Corpus) {
  const text = corpus.snapshots.get("gamesradar-weapons")?.text ?? "";
  const rows = parseWeaponTable(text);
  const quote = "Marathon will feature 28 weapons at launch";
  if (rows.length === 0 || !quoteOccursIn(quote, text)) return null;
  const bungieQuote = "28 weapons, plus mods, implants, cores";
  const bungie = corpus.extractsBySource.get("bungie-introducing-seasons")?.find((extract) => quoteOccursIn(bungieQuote, extract.text));
  const press: Extract = {
    id: "gamesradar-weapons#table",
    sourceKey: "gamesradar-weapons",
    text: [quote, ...rows.map((row) => `${row.weaponClass}: ${row.name} (${row.ammo})`)].join("\n"),
  };
  const quotes = [...(bungie ? [{ extractId: bungie.id, quote: bungieQuote }] : []), { extractId: press.id, quote }];
  const intro: ResolvedClaim = {
    claimId: "claim_weapons_table",
    claimText: `Marathon launched with ${rows.length} weapons, listed below by class and ammo type as published by GamesRadar+ on February 26, 2026.`,
    status: "supported",
    sourceKeys: bungie ? ["bungie-introducing-seasons", "gamesradar-weapons"] : ["gamesradar-weapons"],
    extractIds: quotes.map((entry) => entry.extractId),
    quotes,
    reason: "Verified against quoted passages from official and reputable editorial sources.",
    patchRef: null,
    heading: "Launch weapons",
    paragraph: 0,
  };
  return { heading: "Launch weapons", intro, columns: ["Weapon", "Class", "Ammo"], rows: rows.map((row) => [row.name, row.weaponClass, row.ammo]), extract: press };
}

/** Verifies each editor-flagged disagreement's quotes against the rendered sources. */
export function resolveKnownConflicts(spec: PageSpec, corpus: Corpus): { claims: ResolvedClaim[]; dropped: Rejection[] } {
  const claims: ResolvedClaim[] = [];
  const dropped: Rejection[] = [];
  (spec.knownConflicts ?? []).forEach((conflict, conflictIndex) => {
    const positions = conflict.positions.flatMap((position) => {
      const extract = corpus.extractsBySource.get(position.sourceKey)?.find((candidate) => quoteOccursIn(position.quote, candidate.text));
      return extract ? [{ extractId: extract.id, quote: position.quote }] : [];
    });
    const sourceKeys = [...new Set(positions.map((position) => position.extractId.split("#")[0]))];
    if (positions.length < conflict.positions.length || sourceKeys.length < 2) {
      dropped.push({ text: conflict.sentence, reason: "editor-flagged disagreement: a quote no longer appears in its source" });
      return;
    }
    claims.push({
      claimId: `claim_${spec.slug}_disagreement_${conflictIndex + 1}`,
      claimText: conflict.sentence,
      status: "contradicted",
      sourceKeys,
      extractIds: positions.map((position) => position.extractId),
      quotes: positions,
      reason: positions
        .map((position) => {
          const source = corpus.sources.get(position.extractId.split("#")[0]);
          return `${source ? `${source.publisher} (${source.title})` : position.extractId} says: "${position.quote}"`;
        })
        .join(" "),
      patchRef: null,
      heading: conflict.heading,
      paragraph: 99,
    });
  });
  return { claims, dropped };
}

export async function composePage(input: {
  spec: PageSpec;
  corpus: Corpus;
  titles: Map<string, string>;
  today: string;
  call: StructuredCall;
  refreshReason?: string;
  requestedBy?: string;
  readerNotes?: string[];
  previousClaims?: ClaimLike[] | null;
  policy?: PublishPolicy;
  now?: Date;
}): Promise<ComposedPage> {
  const { spec, corpus } = input;
  const tableContext = spec.contextTables?.includes("weapons") ? weaponsTable(corpus) : null;
  const selected = selectExtracts(spec, corpus.extractsBySource, spec.extracts);
  const extracts = tableContext
    ? [...selected.filter((extract) => !(extract.sourceKey === tableContext.extract.sourceKey && isTableShapedExtract(extract.text))), tableContext.extract]
    : selected;
  if (extracts.length === 0) throw new Error(`No relevant extracts for ${spec.slug}.`);
  const extractsById = new Map(corpus.extractsById);
  if (tableContext) extractsById.set(tableContext.extract.id, tableContext.extract);
  const known = new Set(extracts.map((extract) => extract.id));

  const draftCall = await input.call({
    page: spec.slug,
    step: "draft",
    system: DRAFT_SYSTEM,
    prompt: buildDraftPrompt(spec, extracts, corpus.sources, input.today, input.readerNotes, input.previousClaims?.map((claim) => claim.claimText)),
    schema: draftSchema,
  });
  const draft = validateDraft(draftCall.output, known);

  let index = 0;
  const checkable = draft.sections.flatMap((section) =>
    section.paragraphs.flatMap((paragraph) =>
      paragraph.map((sentence) => ({ claimId: `claim_${spec.slug}_${(index += 1)}`, text: sentence.text, extractIds: sentence.extractIds })),
    ),
  );
  // Editor-flagged disagreements replace the model's own on that page.
  const modelConflictsDropped: Rejection[] = spec.knownConflicts?.length
    ? draft.conflicts.map((conflict) => ({ text: conflict.sentence, reason: "superseded by an editor-flagged disagreement" }))
    : [];
  if (spec.knownConflicts?.length) draft.conflicts = [];
  const conflicts = draft.conflicts.map((conflict, conflictIndex) => ({ conflictId: `conflict_${conflictIndex + 1}`, sentence: conflict.sentence, positions: conflict.positions }));
  const checkCall =
    checkable.length || conflicts.length
      ? await input.call({ page: spec.slug, step: "claim-check", system: CHECK_SYSTEM, prompt: buildCheckPrompt(checkable, extractsById, conflicts), schema: claimCheckSchema })
      : { output: { checks: [], conflicts: [] }, modelId: draftCall.modelId, responseId: null };
  const conflictVerdicts = new Map(
    conflicts.flatMap((conflict, conflictIndex) => {
      const verdict = checkCall.output.conflicts.find((entry) => entry.conflictId === conflict.conflictId);
      return verdict ? [[conflictIndex, verdict] as const] : [];
    }),
  );

  const resolved = resolveClaims(draft, checkCall.output.checks, extractsById, corpus.sources, spec.slug, conflictVerdicts);
  const flagged = resolveKnownConflicts(spec, corpus);
  const claims = datePatchClaims([...resolved.claims, ...flagged.claims], corpus.sources);
  const dropped = [...resolved.dropped, ...flagged.dropped, ...modelConflictsDropped];
  const table = spec.table === "weapons" ? weaponsTable(corpus) : null;
  const allClaims = table ? [...claims, table.intro] : claims;
  const bodyMarkdown = assembleMarkdown({
    claims,
    sectionOrder: draft.sections.map((section) => section.heading),
    table,
    hubLinks: spec.hubChildren.map((slug) => ({ slug, title: input.titles.get(slug) ?? slug })),
    related: spec.related.filter((slug) => !spec.hubChildren.includes(slug)).map((slug) => ({ slug, title: input.titles.get(slug) ?? slug })),
  });
  const gate = evaluatePublishGate(allClaims, input.policy, { hub: isHubSpec(spec), words: countReadableWords(bodyMarkdown) });

  const extractLookup = new Map(extractsById);
  if (table) extractLookup.set(table.extract.id, table.extract);
  const citedExtractIds = [...new Set(allClaims.flatMap((claim) => claim.quotes.map((quote) => quote.extractId)))];

  return {
    slug: spec.slug,
    title: spec.title,
    summary: draft.summary,
    category: spec.category,
    bodyMarkdown,
    aiProvenance: {
      ...buildProvenance({
        claims: allClaims,
        sources: corpus.sources,
        modelId: draftCall.modelId,
        checkModelId: checkCall.modelId,
        responseId: draftCall.responseId,
        generatedAt: (input.now ?? new Date()).toISOString(),
        extractCount: extracts.length,
        refreshReason: input.refreshReason,
        requestedBy: input.requestedBy,
      }),
      publishGate: gate,
    },
    rejected: [...draft.rejected, ...dropped],
    citedExtractIds,
    citedExtracts: citedExtractIds.flatMap((id) => extractLookup.get(id) ?? []),
    gate,
  };
}

/** A spec for a page outside the content plan (for example a reader-suggested topic): scope from its title. */
export function specForTitle(slug: string, title: string, category = "overview"): PageSpec {
  const keywords = title.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2);
  return { slug, title, category, group: "other", scope: `What the sources say about ${title} in Marathon.`, keywords, preferredSources: [], hubChildren: [], related: [], table: null };
}

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
  countProseWords,
  datePatchClaims,
  groundSentence,
  isHubSpec,
  isTableShapedExtract,
  claimCheckSchema,
  draftSchema,
  parseWeaponTable,
  quoteOccursIn,
  resolveClaims,
  selectExtracts,
  renderExtracts,
  validateDraft,
  type ClaimStatus,
  type Extract,
  type PageSpec,
  type Rejection,
  type ResolvedClaim,
  type SourceRecord,
} from "./pipeline.ts";
import {
  PATCH_SYSTEM,
  buildPatchPrompt,
  findRegressions,
  patchSchema,
  planPatch,
  reverifyClaim,
  sameStatement,
  tryParseRevision,
  type Regression,
  type RevisionSentence,
  type StoredClaim,
} from "./patch.ts";

export type ModelStep = "draft" | "patch" | "claim-check";

export type StructuredCall = <T>(request: {
  page: string;
  step: ModelStep;
  system: string;
  prompt: string;
  schema: ZodType<T>;
}) => Promise<{ output: T; modelId: string; responseId: string | null }>;

/** One rendered source document. Full text lives outside git: on the box, or in the private database. */
export type Snapshot = {
  sourceKey: string;
  text: string;
  sha256: string | null;
  fetchedAt: string | null;
  /** How the text was read: rendered in headless Chrome on the box (default), or a plain HTTP fetch by the re-fetch cron. */
  fetchMethod?: "rendered" | "http";
};

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
 * hub page has enough prose to be worth landing on (a thin hub goes to Review instead).
 */
export const DEFAULT_PUBLISH_POLICY: PublishPolicy = { minSupportedRatio: 0.8, minSupportedClaims: 3, maxUnsupported: 3, minHubWords: 150 };

/**
 * What the gate needs to know about the page itself, beyond its claims. `words` counts prose only
 * (countProseWords). `regressions` are supported statements the revision drops although their
 * sources did not change.
 */
export type GateShape = { hub: boolean; words: number; regressions?: Regression[] };

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
  if (shape?.hub && shape.words < policy.minHubWords) reasons.push(`hub page has ${shape.words} words of prose (need ${policy.minHubWords})`);
  if (shape?.regressions?.length) {
    const list = shape.regressions.map((regression) => `"${regression.claimText}"`).join("; ");
    reasons.push(`drops ${shape.regressions.length} supported statement${shape.regressions.length === 1 ? "" : "s"} whose sources did not change: ${list}`);
  }
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
  manual_refresh: "An editor asked for a re-check",
};

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
  aiProvenance: ReturnType<typeof buildProvenance> & {
    publishGate: GateResult;
    editMode: "draft" | "patch";
    sourceHashes: Record<string, string | null>;
    changeNote: string;
  };
  rejected: Rejection[];
  citedExtractIds: string[];
  /** The extract texts behind each cited id (the only source text that may be committed or copied to revision rows). */
  citedExtracts: Extract[];
  gate: GateResult;
  changeNote: string;
  /** A refresh that left the body exactly as it was: nothing to publish. */
  unchanged: boolean;
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

/** The revision a refresh edits: its body, its claims and the source hashes it was written from. */
export type PreviousRevision = {
  bodyMarkdown: string;
  summary: string | null;
  claims: StoredClaim[];
  /** sha256 per cited source when the revision was written; null or missing when unknown. */
  sourceHashes: Record<string, string | null>;
};

type ComposeInput = {
  spec: PageSpec;
  corpus: Corpus;
  titles: Map<string, string>;
  today: string;
  call: StructuredCall;
  refreshReason?: string;
  requestedBy?: string;
  /** Approved reader notes and editor instructions. Hints for the model, never sources. */
  readerNotes?: string[];
  previous?: PreviousRevision | null;
  /** Sources the trigger says changed (a queue item's sourceKey), on top of hash differences. */
  changedSources?: string[];
  policy?: PublishPolicy;
  now?: Date;
};

/** Sources whose text differs from what the previous revision was written from. */
function changedSourcesSince(previous: PreviousRevision | null | undefined, corpus: Corpus, flagged: string[] = []) {
  const changed = new Set(flagged);
  for (const [sourceKey, sha256] of Object.entries(previous?.sourceHashes ?? {})) {
    if (sha256 && corpus.snapshots.get(sourceKey)?.sha256 !== sha256) changed.add(sourceKey);
  }
  return changed;
}

/** The extracts a page is written from: the best-scoring passages, with parsed tables in place of raw table text. */
function pageExtracts(spec: PageSpec, corpus: Corpus, changedSources: ReadonlySet<string>) {
  const tableContext = spec.contextTables?.includes("weapons") ? weaponsTable(corpus) : null;
  const selected = selectExtracts(spec, corpus.extractsBySource, spec.extracts);
  // A changed source is always offered, so the editor can see what changed in it.
  const picked = new Set(selected.map((extract) => extract.id));
  const fromChanged = [...changedSources].flatMap((sourceKey) =>
    (corpus.extractsBySource.get(sourceKey) ?? []).filter((extract) => !picked.has(extract.id)).slice(0, 3),
  );
  const extracts = [...selected, ...fromChanged];
  const final = tableContext
    ? [...extracts.filter((extract) => !(extract.sourceKey === tableContext.extract.sourceKey && isTableShapedExtract(extract.text))), tableContext.extract]
    : extracts;
  if (final.length === 0) throw new Error(`No relevant extracts for ${spec.slug}.`);
  const extractsById = new Map(corpus.extractsById);
  const table = weaponsTable(corpus);
  if (table) extractsById.set(table.extract.id, table.extract);
  return { extracts: final, extractsById };
}

type Written = {
  summary: string | null;
  claims: ResolvedClaim[];
  sectionOrder: string[];
  rejected: Rejection[];
  modelId: string;
  checkModelId: string;
  responseId: string | null;
  extractCount: number;
  /** Previous claim ids a verified replacement took over. */
  superseded: Set<string>;
  /** Set by the patch path: what the edit did, for the change note. */
  edits: { revised: number; added: number; removed: number } | null;
};

/** A whole page from the extracts: used for new pages and for revisions the patch path cannot read. */
async function draftPage(input: ComposeInput, extracts: Extract[], extractsById: Map<string, Extract>): Promise<Written> {
  const { spec, corpus } = input;
  const known = new Set(extracts.map((extract) => extract.id));
  const draftCall = await input.call({
    page: spec.slug,
    step: "draft",
    system: DRAFT_SYSTEM,
    prompt: buildDraftPrompt(spec, extracts, corpus.sources, input.today, input.readerNotes, input.previous?.claims.map((claim) => claim.claimText)),
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
  return {
    summary: draft.summary,
    claims: datePatchClaims([...resolved.claims, ...flagged.claims], corpus.sources),
    sectionOrder: draft.sections.map((section) => section.heading),
    rejected: [...draft.rejected, ...resolved.dropped, ...flagged.dropped, ...modelConflictsDropped],
    modelId: draftCall.modelId,
    checkModelId: checkCall.modelId,
    responseId: draftCall.responseId,
    extractCount: extracts.length,
    superseded: new Set(),
    edits: null,
  };
}

/**
 * The editor's refresh: the model sees the current sentences and returns targeted edits. Only
 * replaced and added sentences are fact-checked by the model; kept sentences are re-verified in
 * code against the current source text and published again word for word.
 */
async function patchExistingPage(
  input: ComposeInput,
  sentences: RevisionSentence[],
  extracts: Extract[],
  extractsById: Map<string, Extract>,
  changedSources: ReadonlySet<string>,
): Promise<Written> {
  const { spec, corpus } = input;
  const known = new Set(extracts.map((extract) => extract.id));
  const highest = Math.max(0, ...input.previous!.claims.map((claim) => Number(claim.claimId.match(/_(\d+)$/)?.[1] ?? 0)));
  let counter = highest;
  const hub = isHubSpec(spec);
  const words = countProseWords(input.previous!.bodyMarkdown);
  const patchCall = await input.call({
    page: spec.slug,
    step: "patch",
    system: PATCH_SYSTEM,
    prompt: buildPatchPrompt({
      title: spec.title,
      slug: spec.slug,
      scope: spec.scope,
      today: input.today,
      why: TRIGGER_PHRASE[input.refreshReason ?? ""] ?? "Re-check against the sources",
      sentences,
      notes: input.readerNotes ?? [],
      changedSources: [...changedSources],
      lengthHint:
        hub && words < 220
          ? `This is a hub page with ${words} words of prose. If the extracts support it, add the scope's missing topics so it reaches 180 to 300 words, one fact per sentence.`
          : null,
      renderedExtracts: renderExtracts(extracts, corpus.sources),
    }),
    schema: patchSchema,
  });
  const plan = planPatch({ sentences, edits: patchCall.output.edits, knownExtractIds: known, nextClaimId: () => `claim_${spec.slug}_${(counter += 1)}` });

  const checkable = plan.order.flatMap((entry) => (entry.kind === "kept" ? [] : [{ claimId: entry.claimId, text: entry.next.text, extractIds: entry.next.extractIds }]));
  const checkCall = checkable.length
    ? await input.call({ page: spec.slug, step: "claim-check", system: CHECK_SYSTEM, prompt: buildCheckPrompt(checkable, extractsById), schema: claimCheckSchema })
    : { output: { checks: [], conflicts: [] }, modelId: patchCall.modelId, responseId: null };

  const extractsBySource = new Map(corpus.extractsBySource);
  const table = weaponsTable(corpus);
  if (table) extractsBySource.set(table.extract.sourceKey, [...(extractsBySource.get(table.extract.sourceKey) ?? []), table.extract]);
  const rejected: Rejection[] = [...plan.rejected];
  const claims: ResolvedClaim[] = [];
  const superseded = new Set<string>();
  const edits = { revised: 0, added: 0, removed: plan.removed.length };
  const keep = (sentence: RevisionSentence) => {
    const kept = reverifyClaim({ sentence, extractsBySource, sources: corpus.sources });
    if (kept) claims.push(kept);
    else {
      edits.removed += 1;
      rejected.push({ text: sentence.claim.claimText, reason: "its source no longer states this" });
    }
  };

  for (const entry of plan.order) {
    if (entry.kind === "kept") {
      keep(entry.sentence);
      continue;
    }
    const place = entry.kind === "replace" ? entry.sentence : entry;
    const grounded = groundSentence({ sentence: entry.next, claimId: entry.claimId, checks: checkCall.output.checks, extractsById, sources: corpus.sources, heading: place.heading, paragraph: place.paragraph });
    if (!("status" in grounded)) {
      rejected.push(grounded);
      // An unverifiable replacement leaves the original sentence in place.
      if (entry.kind === "replace") keep(entry.sentence);
      continue;
    }
    const [dated] = datePatchClaims([grounded], corpus.sources);
    claims.push(dated);
    if (entry.kind === "replace") {
      superseded.add(entry.sentence.claim.claimId);
      edits.revised += 1;
    } else edits.added += 1;
  }

  for (const conflict of resolveKnownConflicts(spec, corpus).claims) {
    if (!claims.some((claim) => claim.claimText === conflict.claimText)) claims.push(conflict);
  }

  return {
    summary: null,
    claims,
    sectionOrder: [...new Set(sentences.map((sentence) => sentence.heading))],
    rejected,
    modelId: patchCall.modelId,
    checkModelId: checkCall.modelId,
    responseId: patchCall.responseId,
    extractCount: extracts.length,
    superseded,
    edits,
  };
}

function describeEdits(edits: { revised: number; added: number; removed: number }, refreshReason: string, changedSources: string[]) {
  const counts = [
    [edits.revised, "revised"],
    [edits.added, "added"],
    [edits.removed, "removed"],
  ].filter(([count]) => count) as Array<[number, string]>;
  const parts = counts.map(([count, verb], index) => (index === 0 ? `${count} statement${count === 1 ? "" : "s"} ${verb}` : `${count} ${verb}`));
  const lead = TRIGGER_PHRASE[refreshReason] ?? "Re-checked against the sources";
  const sources = changedSources.length ? ` (${changedSources.join(", ")})` : "";
  return `${lead}${sources}: ${parts.length ? parts.join(", ") : "no statements changed"}.`;
}

export async function composePage(input: ComposeInput): Promise<ComposedPage> {
  const { spec, corpus } = input;
  const changedSources = changedSourcesSince(input.previous, corpus, input.changedSources);
  const { extracts, extractsById } = pageExtracts(spec, corpus, changedSources);
  const sentences = input.previous ? tryParseRevision(input.previous.bodyMarkdown, input.previous.claims) : null;
  const written = sentences
    ? await patchExistingPage(input, sentences, extracts, extractsById, changedSources)
    : await draftPage(input, extracts, extractsById);

  const table = spec.table === "weapons" ? weaponsTable(corpus) : null;
  const allClaims = table ? [...written.claims, table.intro] : written.claims;
  const bodyMarkdown = assembleMarkdown({
    claims: written.claims,
    sectionOrder: written.sectionOrder,
    table,
    hubLinks: spec.hubChildren.map((slug) => ({ slug, title: input.titles.get(slug) ?? slug })),
    related: spec.related.filter((slug) => !spec.hubChildren.includes(slug)).map((slug) => ({ slug, title: input.titles.get(slug) ?? slug })),
  });
  const regressions = input.previous
    ? findRegressions({ previous: input.previous.claims, next: allClaims, superseded: written.superseded, changedSources })
    : [];
  const gate = evaluatePublishGate(allClaims, input.policy, { hub: isHubSpec(spec), words: countProseWords(bodyMarkdown), regressions });

  const reason = input.previous ? (input.refreshReason ?? "manual_refresh") : "new_page";
  const changedList = [...changedSources].filter((key) => (input.changedSources ?? []).includes(key) || input.previous?.sourceHashes[key]);
  const changeNote = written.edits
    ? describeEdits(written.edits, reason, changedList)
    : describeChanges({ previous: input.previous?.claims ?? null, next: allClaims, refreshReason: reason, changedSources: changedList });

  const extractLookup = new Map(extractsById);
  const citedExtractIds = [...new Set(allClaims.flatMap((claim) => claim.quotes.map((quote) => quote.extractId)))];
  const citedSources = [...new Set(allClaims.flatMap((claim) => claim.sourceKeys))];

  return {
    slug: spec.slug,
    title: spec.title,
    summary: written.summary ?? input.previous?.summary ?? spec.title,
    category: spec.category,
    bodyMarkdown,
    aiProvenance: {
      ...buildProvenance({
        claims: allClaims,
        sources: corpus.sources,
        modelId: written.modelId,
        checkModelId: written.checkModelId,
        responseId: written.responseId,
        generatedAt: (input.now ?? new Date()).toISOString(),
        extractCount: written.extractCount,
        refreshReason: input.refreshReason,
        requestedBy: input.requestedBy,
      }),
      editMode: written.edits ? "patch" : "draft",
      sourceHashes: Object.fromEntries(citedSources.map((key) => [key, corpus.snapshots.get(key)?.sha256 ?? null])),
      changeNote,
      publishGate: gate,
    },
    rejected: written.rejected,
    citedExtractIds,
    citedExtracts: citedExtractIds.flatMap((id) => extractLookup.get(id) ?? []),
    gate,
    changeNote,
    unchanged: Boolean(input.previous) && bodyMarkdown.trim() === input.previous!.bodyMarkdown.trim(),
  };
}

/** A spec for a page outside the content plan (for example a reader-suggested topic): scope from its title. */
export function specForTitle(slug: string, title: string, category = "overview"): PageSpec {
  const keywords = title.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2);
  return { slug, title, category, group: "other", scope: `What the sources say about ${title} in Marathon.`, keywords, preferredSources: [], hubChildren: [], related: [], table: null };
}

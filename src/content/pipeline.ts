/**
 * Real-content pipeline for the Marathon wiki: pure, testable steps.
 *
 * snapshot text -> extracts -> draft prompt -> (model) -> validated draft
 *   -> claim check prompt -> (model) -> grounded claim verdicts -> markdown + aiProvenance
 *
 * Rules enforced here, not just requested in prompts:
 *   - every published sentence cites at least one extract that was actually given to the model;
 *   - a "supported" verdict needs a verbatim quote that really occurs in a cited official or
 *     reputable_editorial extract; community-only support is published as "unsupported";
 *   - sentences no cited source supports are dropped (never published as fact);
 *   - a "Sources disagree" sentence needs two or more verified quotes from different sources;
 *   - patch-sensitive sentences must name the patch and its date in the sentence itself.
 *
 * Erasable TypeScript only: scripts run this file directly with Node's type stripping.
 */
import { z } from "zod";

export const CONTENT_PROMPT_VERSION = "marathon-real-content-v6";
export const CLAIM_CHECK_PROMPT_VERSION = "marathon-claim-check-v2";

export type AuthorityTier = "official" | "reputable_editorial" | "community_wiki" | "community";

export type SourceRecord = {
  sourceKey: string;
  sourceId: string;
  sourceType: string;
  authorityTier: AuthorityTier;
  authorityScore: number;
  title: string;
  publisher: string;
  url: string;
  publishedDate: string | null;
};

export type PageSpec = {
  slug: string;
  title: string;
  category: string;
  group: string;
  scope: string;
  keywords: string[];
  preferredSources: string[];
  hubChildren: string[];
  related: string[];
  table: string | null;
  /**
   * Disagreements an editor flagged while planning. Each quote is checked verbatim against the
   * rendered source before it is shown as "Sources disagree", so a stale quote is dropped.
   */
  knownConflicts?: Array<{ heading: string; sentence: string; positions: Array<{ sourceKey: string; quote: string }> }>;
  /** A topic hub without child pages (hubChildren already marks a page as a hub). Hubs must meet the gate's length minimum. */
  hub?: boolean;
  /**
   * Parsed tables given to the model as clean rows ("Assault rifle: M77 (Light Rounds)") in place of
   * the raw table text, where column headers sit next to values and get misread.
   */
  contextTables?: Array<"weapons">;
  /** Wider source context for pages that came out thin: overrides selectExtracts' budget and per-source cap. */
  extracts?: { budget?: number; perSource?: number };
};

export function isHubSpec(spec: Pick<PageSpec, "hubChildren" | "hub">) {
  return Boolean(spec.hub) || spec.hubChildren.length > 0;
}

/**
 * Words of prose a reader actually reads. Headings, citation markers, tables and the link-only
 * "See also" / child-page lists are not counted.
 */
export function countProseWords(markdown: string) {
  return markdown
    .replace(/\{\{cite:[^}]+\}\}/g, " ")
    .split("\n")
    .filter((line) => !/^\s*#/.test(line) && !/^\s*\|/.test(line) && !/^\s*[-*]\s+\[\[?[^\]]+\]\]?(\([^)]+\))?\s*$/.test(line))
    .join(" ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

export type Extract = { id: string; sourceKey: string; text: string };

const TRUSTED_TIERS: ReadonlySet<AuthorityTier> = new Set(["official", "reputable_editorial"]);

export function isTrustedTier(tier: AuthorityTier) {
  return TRUSTED_TIERS.has(tier);
}

// ---------------------------------------------------------------------------
// Extracts

/** Splits rendered page text into ~target-sized chunks on line boundaries. Ids are stable per snapshot. */
export function chunkSnapshot(sourceKey: string, text: string, target = 800): Extract[] {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const chunks: Extract[] = [];
  let buffer: string[] = [];
  let size = 0;

  const flush = () => {
    if (!buffer.length) return;
    chunks.push({ id: `${sourceKey}#${chunks.length + 1}`, sourceKey, text: buffer.join("\n") });
    buffer = [];
    size = 0;
  };

  // A line ending in ":" introduces what follows ("You'll also get ... depending on your rank:"), so
  // a chunk never ends on one: it opens the next chunk instead, with the list it introduces.
  const flushKeepingLeadIn = () => {
    const last = buffer[buffer.length - 1];
    if (buffer.length > 1 && last.endsWith(":")) {
      buffer.pop();
      flush();
      buffer = [last];
      size = last.length + 1;
      return;
    }
    flush();
  };
  for (const line of lines) {
    if (size > 0 && size + line.length > target * 1.4) flushKeepingLeadIn();
    buffer.push(line);
    size += line.length + 1;
    if (size >= target) flushKeepingLeadIn();
  }
  flush();

  return chunks;
}

/** Keyword relevance; the page title counts double. */
export function scoreExtract(extract: Extract, spec: Pick<PageSpec, "title" | "keywords">) {
  const haystack = extract.text.toLowerCase();
  let score = 0;
  for (const keyword of [spec.title, spec.title, ...spec.keywords]) {
    const needle = keyword.toLowerCase();
    if (!needle) continue;
    let from = 0;
    let hits = 0;
    while (hits < 5) {
      const at = haystack.indexOf(needle, from);
      if (at === -1) break;
      hits += 1;
      from = at + needle.length;
    }
    score += hits;
  }
  return score;
}

/**
 * Picks the most relevant extracts for a page across all sources, preferring the page's
 * preferred sources, capped per source and by a character budget. Returned in source order
 * so the model reads each source's extracts together.
 */
export function selectExtracts(
  spec: PageSpec,
  extractsBySource: Map<string, Extract[]>,
  options: { budget?: number; perSource?: number } = {},
): Extract[] {
  const budget = options.budget ?? 22_000;
  const perSource = options.perSource ?? 5;
  const preferred = new Set(spec.preferredSources);

  const ranked = [...extractsBySource.values()]
    .flat()
    .map((extract) => {
      const base = scoreExtract(extract, spec);
      return { extract, score: base === 0 ? 0 : base + (preferred.has(extract.sourceKey) ? 3 : 0) };
    })
    .filter((entry) => entry.score >= 2)
    .sort((a, b) => b.score - a.score || a.extract.id.localeCompare(b.extract.id));

  const picked: Extract[] = [];
  const perSourceCount = new Map<string, number>();
  let used = 0;

  for (const { extract } of ranked) {
    const count = perSourceCount.get(extract.sourceKey) ?? 0;
    if (count >= perSource || used + extract.text.length > budget) continue;
    picked.push(extract);
    perSourceCount.set(extract.sourceKey, count + 1);
    used += extract.text.length;
  }

  const order = [...extractsBySource.keys()];
  return picked.sort(
    (a, b) =>
      order.indexOf(a.sourceKey) - order.indexOf(b.sourceKey) ||
      Number(a.id.split("#")[1]) - Number(b.id.split("#")[1]),
  );
}

// ---------------------------------------------------------------------------
// Model output schemas

const sentenceSchema = z.object({
  text: z.string().min(1),
  extractIds: z.array(z.string()),
  patchRef: z.string().nullable(),
});

export const draftSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  sections: z
    .array(
      z.object({
        heading: z.string().min(1),
        paragraphs: z.array(z.object({ sentences: z.array(sentenceSchema) })),
      }),
    )
    .min(1),
  conflicts: z.array(
    z.object({
      heading: z.string().min(1),
      sentence: z.string().min(1),
      positions: z.array(z.object({ extractId: z.string(), quote: z.string().min(1) })),
    }),
  ),
});

export type Draft = z.infer<typeof draftSchema>;

export const claimCheckSchema = z.object({
  conflicts: z.array(z.object({ conflictId: z.string(), genuine: z.boolean(), reason: z.string() })),
  checks: z.array(
    z.object({
      claimId: z.string(),
      verdict: z.enum(["supported", "not_supported", "contradicted"]),
      extractId: z.string().nullable(),
      quote: z.string().nullable(),
      reason: z.string(),
    }),
  ),
});

export type ClaimCheck = z.infer<typeof claimCheckSchema>;

// ---------------------------------------------------------------------------
// Prompts

function sourceLine(source: SourceRecord) {
  return `${source.publisher}: "${source.title}" (${source.authorityTier}${source.publishedDate ? `, ${source.publishedDate}` : ""})`;
}

export function renderExtracts(extracts: Extract[], sources: Map<string, SourceRecord>) {
  return extracts
    .map((extract) => {
      const source = sources.get(extract.sourceKey);
      return `<extract id="${extract.id}" source="${source ? sourceLine(source) : extract.sourceKey}">\n${extract.text}\n</extract>`;
    })
    .join("\n\n");
}

export type WikiDraftContext = {
  /** Shown in the opening line, e.g. "Marathon, Bungie's 2026 extraction shooter". */
  subject: string;
  /** Short official-source name used in "prefer official (X)" and attribution rules. */
  officialPublisher: string;
};

export const MARATHON_DRAFT_CONTEXT: WikiDraftContext = {
  subject: "Marathon, Bungie's 2026 extraction shooter",
  officialPublisher: "Bungie",
};

export function draftSystemFor(wiki: WikiDraftContext = MARATHON_DRAFT_CONTEXT) {
  return [
    `You write pages for an unofficial, source-backed wiki about ${wiki.subject}.`,
    "You may ONLY state facts that appear in the extracts provided. Never use outside knowledge, never guess, never fill gaps.",
    "State each fact once. Do not restate a fact in other words, and do not pad with sentences about what a publication lists.",
    "Write in your own words, in neutral encyclopedic third person. Do not copy sentences from the extracts, and never copy text from community wikis.",
    "Prefer paraphrase over quotation. A page may use at most one short quotation per section, each quotation at most 15 words, and quoted words at most 10% of the page's prose. Do not pack a page with quotations to avoid copying. Unquoted prose must not repeat a run of eight or more words from an extract.",
    `Example of paraphrase: '${wiki.officialPublisher}'s biography says Lucia learned to fight young and served time in the Leonida Penitentiary after fighting for her family.' If you do quote a distinctive official phrase, attribute it and keep it short.`,
    "Every sentence must list the extract ids that state its fact. A sentence without a supporting extract must be left out.",
    "One fact per sentence, under 30 words: a fact checker must find it stated in a single cited extract, so long sentences that",
    "combine facts from several places get removed.",
    `Prefer official (${wiki.officialPublisher}) extracts; use press to add detail; community extracts only when nothing better exists.`,
    "If two extracts disagree on a fact (for example a date or a count), do NOT pick one and do NOT hedge in prose:",
    "put that sentence in `conflicts`, with a verbatim quote from each disagreeing extract. Copy each quote character for character",
    "from the extract (3 to 15 words, no ellipses). Rounding or currency formatting is not a disagreement.",
    "If a fact can change with updates (stock, drop rates, tuning, requirements, schedules, event dates), set patchRef and",
    "name the update and its date inside the sentence, e.g. 'As of Update 1.1.9.7 (November 10, 2026), ...'.",
    `Announced-but-unreleased content must be written as announced, e.g. '${wiki.officialPublisher} has announced ... for December 8, 2026.'`,
    "Plain sentences only: no markdown, links, lists, brackets, asterisks, pipes or citations inside sentence text.",
    "Neutral encyclopedic tone. No marketing language, no second person, no speculation.",
    "Do not attribute in prose ('according to press', 'per coverage', 'as listed by'); citations show the source. Name a source only",
    `for ${wiki.officialPublisher} announcements or when the attribution is itself the fact.`,
  ].join("\n");
}

export const DRAFT_SYSTEM = draftSystemFor(MARATHON_DRAFT_CONTEXT);

export function buildDraftPrompt(
  spec: PageSpec,
  extracts: Extract[],
  sources: Map<string, SourceRecord>,
  today: string,
  readerNotes: string[] = [],
  previousSentences: string[] = [],
) {
  const previous = previousSentences.length
    ? [
        "",
        "This is a refresh. The current page says the following. Keep a sentence's wording when the extracts still support it,",
        "drop it when they no longer do, and add what is new, so readers can see what actually changed:",
        ...previousSentences.map((sentence) => `- ${sentence}`),
      ]
    : [];
  const notes = readerNotes.length
    ? [
        "",
        "Reader notes (NOT sources). Use them only to decide what to check; write a fact only if an extract states it:",
        ...readerNotes.map((note) => `- ${note.replace(/\s+/g, " ").slice(0, 400)}`),
      ]
    : [];
  return [
    `Today is ${today}. Write the wiki page "${spec.title}" (slug: ${spec.slug}).`,
    `Scope: ${spec.scope}`,
    isHubSpec(spec)
      ? "Length: this is a hub page, so 3 to 6 sections and 260 to 500 words in total, all from the extracts. If the extracts cannot support that much, write less rather than padding; a thin hub goes to editor review."
      : "Length: 2 to 5 sections, 120 to 450 words in total. Fewer, well-supported sentences beat more, weaker ones.",
    "The summary is one plain sentence about the subject (it is shown under the title and as the meta description). Do not mention paraphrasing, rewriting, citations, WikiDen, or that the text was rewritten; just describe the topic.",
    "Do not write a references section; citations are added automatically from extractIds.",
    ...(spec.table === "weapons"
      ? ["A table of every launch weapon (name, class, ammo) is added below your text automatically. Do not list weapons by class in prose; cover what the table cannot: how weapons work, ammo types in general, and post-launch changes."]
      : []),
    ...notes,
    ...previous,
    "",
    "Extracts:",
    renderExtracts(extracts, sources),
  ].join("\n");
}

export const CHECK_SYSTEM = [
  "You are a strict fact checker for a wiki. For each claim you get the extracts it cites.",
  "verdict=supported only if one cited extract directly states the claim's fact. Give that extract's id and a SHORT verbatim",
  "quote (copied exactly, 3 to 30 words) from it that proves the claim.",
  "verdict=contradicted if a cited extract states something incompatible; quote the incompatible text.",
  "Otherwise verdict=not_supported with quote=null. Paraphrase is fine in the claim, but numbers, names and dates must match.",
  "You may also get claimed disagreements between sources. genuine=true only if the quoted statements cannot both be true",
  "(for example 'decades' versus 'a century' for the same span). Different events, rounding, or facts that fit together",
  "(a departure year, a travel time and a later setting year) are genuine=false. Explain briefly in reason.",
].join("\n");

export type CheckableClaim = { claimId: string; text: string; extractIds: string[] };

export type CheckableConflict = { conflictId: string; sentence: string; positions: Array<{ extractId: string; quote: string }> };

export function buildCheckPrompt(claims: CheckableClaim[], extractsById: Map<string, Extract>, conflicts: CheckableConflict[] = []) {
  const needed = new Set(claims.flatMap((claim) => claim.extractIds));
  const extracts = [...needed].flatMap((id) => {
    const extract = extractsById.get(id);
    return extract ? [`<extract id="${id}">\n${extract.text}\n</extract>`] : [];
  });
  return [
    "Claims:",
    ...claims.map((claim) => `- ${claim.claimId}: ${claim.text} [cites: ${claim.extractIds.join(", ")}]`),
    ...(conflicts.length
      ? [
          "",
          "Claimed disagreements:",
          ...conflicts.map(
            (conflict) => `- ${conflict.conflictId}: ${conflict.sentence} ${conflict.positions.map((position) => `| ${position.extractId} says "${position.quote}"`).join(" ")}`,
          ),
        ]
      : []),
    "",
    "Extracts:",
    ...extracts,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Validation

const FORBIDDEN_IN_SENTENCE = /[\[\]{}<>|*_`#\n]/;
const PATCH_REFERENCE = /\b(update|patch|hotfix)\s+\d+(\.\d+)+/i;
const DATE_REFERENCE = /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t|tember)?|oct(ober)?|nov(ember)?|dec(ember)?)\.?\s+\d{1,2},\s+\d{4}\b/i;
const EXTRACT_ID = /[a-z0-9][a-z0-9-]*#\d+/gi;

/**
 * Models sometimes copy a sentence's citations into its text ("... outside (pcgamer-review#16)." or
 * "... extractIds:["a#1"]"). Those are moved to extractIds; any other markup still fails validation.
 */
export function liftInlineCitations(sentence: ValidSentence): ValidSentence {
  const ids = [...sentence.extractIds];
  const lift = (inner: string) => {
    ids.push(...(inner.match(EXTRACT_ID) ?? []));
    return "";
  };
  const text = sentence.text
    .trim()
    .replace(/\s*extractIds\s*:\s*\[([^\]]*)\]\s*$/i, (_, inner: string) => lift(inner))
    .replace(/\s*\(\s*((?:[a-z0-9][a-z0-9-]*#\d+[\s,;]*)+)\)/gi, (_, inner: string) => lift(inner))
    .replace(/\s+([.!?])$/, "$1")
    .trim();
  return { ...sentence, text, extractIds: [...new Set(ids)] };
}

export type Rejection = { text: string; reason: string };

export type ValidSentence = { text: string; extractIds: string[]; patchRef: string | null };
export type ValidDraft = {
  title: string;
  summary: string;
  sections: Array<{ heading: string; paragraphs: ValidSentence[][] }>;
  conflicts: Array<{ heading: string; sentence: string; positions: Array<{ extractId: string; quote: string }> }>;
  rejected: Rejection[];
};

export function validateSentence(sentence: ValidSentence, knownExtractIds: ReadonlySet<string>): string | null {
  const text = sentence.text.trim();
  if (text.length < 12) return "sentence too short";
  if (FORBIDDEN_IN_SENTENCE.test(text)) return "markup inside sentence text";
  if (sentence.extractIds.length === 0) return "no source cited";
  const unknown = sentence.extractIds.filter((id) => !knownExtractIds.has(id));
  if (unknown.length) return `cites extracts that were not provided: ${unknown.join(", ")}`;
  if (sentence.patchRef && !(PATCH_REFERENCE.test(text) && DATE_REFERENCE.test(text))) {
    return "patch-sensitive sentence does not name the update and its date";
  }
  return null;
}

/** Drops invalid sentences/conflicts (recording why), keeps the rest. Throws if nothing valid remains. */
export function validateDraft(draft: Draft, knownExtractIds: ReadonlySet<string>): ValidDraft {
  const rejected: Rejection[] = [];
  const sections = draft.sections
    .map((section) => ({
      heading: section.heading.trim().replace(/^#+\s*/, ""),
      paragraphs: section.paragraphs
        .map((paragraph) =>
          paragraph.sentences.map(liftInlineCitations).filter((sentence) => {
            const problem = validateSentence(sentence, knownExtractIds);
            if (problem) rejected.push({ text: sentence.text, reason: problem });
            return !problem;
          }).map((sentence) => ({ ...sentence, text: sentence.text.trim() })),
        )
        .filter((paragraph) => paragraph.length > 0),
    }))
    .filter((section) => section.paragraphs.length > 0);

  const conflicts = draft.conflicts.filter((conflict) => {
    const sources = new Set(conflict.positions.map((position) => position.extractId.split("#")[0]));
    const problem = FORBIDDEN_IN_SENTENCE.test(conflict.sentence)
      ? "markup inside sentence text"
      : conflict.positions.some((position) => !knownExtractIds.has(position.extractId))
        ? "conflict cites extracts that were not provided"
        : sources.size < 2
          ? "a disagreement needs two different sources"
          : null;
    if (problem) rejected.push({ text: conflict.sentence, reason: problem });
    return !problem;
  });

  if (sections.length === 0 && conflicts.length === 0) {
    throw new Error("Draft has no valid, sourced sentences.");
  }

  return { title: draft.title.trim(), summary: draft.summary.trim(), sections, conflicts, rejected };
}

// ---------------------------------------------------------------------------
// Grounding

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when `quote` occurs verbatim (modulo case, whitespace, curly quotes, dashes, trailing punctuation) in `text`. */
export function quoteOccursIn(quote: string | null | undefined, text: string) {
  if (!quote) return false;
  const needle = normalize(quote).replace(/^["']|["'.,;:!?]+$/g, "").trim();
  if (needle.split(" ").length < 2 || needle.length < 8) return false;
  return normalize(text).includes(needle);
}

export type ClaimStatus = "supported" | "unsupported" | "contradicted";

export type ResolvedClaim = {
  claimId: string;
  claimText: string;
  status: ClaimStatus;
  sourceKeys: string[];
  extractIds: string[];
  quotes: Array<{ extractId: string; quote: string }>;
  reason: string;
  patchRef: string | null;
  heading: string;
  paragraph: number;
};

export type Resolution = { claims: ResolvedClaim[]; dropped: Rejection[] };

/**
 * One sentence's verdict, checked deterministically: a "supported" verdict counts only when its
 * quote really occurs in an extract the sentence cites, and only official/reputable_editorial
 * extracts make a claim supported. Returns the claim, or why the sentence was dropped.
 */
export function groundSentence(input: {
  sentence: ValidSentence;
  claimId: string;
  checks: ClaimCheck["checks"];
  extractsById: Map<string, Extract>;
  sources: Map<string, SourceRecord>;
  heading: string;
  paragraph: number;
}): ResolvedClaim | Rejection {
  const { sentence, claimId } = input;
  const tierOf = (extractId: string) => input.sources.get(extractId.split("#")[0])?.authorityTier;
  const verified = input.checks
    .filter((check) => check.claimId === claimId && check.verdict === "supported" && check.extractId)
    .filter((check) => sentence.extractIds.includes(check.extractId as string))
    .filter((check) => {
      const extract = input.extractsById.get(check.extractId as string);
      return extract ? quoteOccursIn(check.quote, extract.text) : false;
    });
  const trusted = verified.filter((check) => isTrustedTier(tierOf(check.extractId as string) as AuthorityTier));
  const base = { claimId, claimText: sentence.text, extractIds: sentence.extractIds, patchRef: sentence.patchRef, heading: input.heading, paragraph: input.paragraph };
  if (trusted.length > 0) {
    return {
      ...base,
      status: "supported",
      sourceKeys: unique(trusted.map((check) => (check.extractId as string).split("#")[0])),
      quotes: trusted.map((check) => ({ extractId: check.extractId as string, quote: check.quote as string })),
      reason: `Verified against ${trusted.length} quoted passage${trusted.length === 1 ? "" : "s"} from ${tierLabel(trusted, tierOf)} sources.`,
    };
  }
  if (verified.length > 0) {
    return {
      ...base,
      status: "unsupported",
      sourceKeys: unique(verified.map((check) => (check.extractId as string).split("#")[0])),
      quotes: verified.map((check) => ({ extractId: check.extractId as string, quote: check.quote as string })),
      reason: "community-only: only community sources state this so far.",
    };
  }
  return { text: sentence.text, reason: "no cited source verifiably states this" };
}

/**
 * Turns model verdicts into publishable statuses with deterministic checks:
 * quotes must really occur in the cited extract, and only official/reputable_editorial
 * extracts can make a claim "supported".
 */
export function resolveClaims(
  draft: ValidDraft,
  checks: ClaimCheck["checks"],
  extractsById: Map<string, Extract>,
  sources: Map<string, SourceRecord>,
  slug: string,
  /** Checker verdicts by conflict index; when given, only disagreements judged genuine are kept. */
  conflictVerdicts?: Map<number, { genuine: boolean; reason: string }>,
): Resolution {
  const claims: ResolvedClaim[] = [];
  const dropped: Rejection[] = [];
  let index = 0;

  draft.sections.forEach((section) => {
    section.paragraphs.forEach((paragraph, paragraphIndex) => {
      for (const sentence of paragraph) {
        index += 1;
        const grounded = groundSentence({ sentence, claimId: `claim_${slug}_${index}`, checks, extractsById, sources, heading: section.heading, paragraph: paragraphIndex });
        if ("status" in grounded) claims.push(grounded);
        else dropped.push(grounded);
      }
    });
  });

  draft.conflicts.forEach((conflict, conflictIndex) => {
    index += 1;
    const verdict = conflictVerdicts?.get(conflictIndex);
    if (conflictVerdicts && !verdict?.genuine) {
      dropped.push({ text: conflict.sentence, reason: `checker found no real disagreement: ${verdict?.reason ?? "no verdict"}` });
      return;
    }
    const positions = conflict.positions.filter((position) => {
      const extract = extractsById.get(position.extractId);
      return extract ? quoteOccursIn(position.quote, extract.text) : false;
    });
    const sourceKeys = unique(positions.map((position) => position.extractId.split("#")[0]));
    if (sourceKeys.length < 2) {
      const unverified = conflict.positions.filter((position) => !positions.includes(position)).map((position) => `${position.extractId}: "${position.quote}"`);
      dropped.push({ text: conflict.sentence, reason: `disagreement could not be verified in two sources (unverified quotes: ${unverified.join("; ") || "none"})` });
      return;
    }
    if (quotesAgreeNumerically(positions.map((position) => position.quote))) {
      dropped.push({ text: conflict.sentence, reason: "not a disagreement: every quoted figure rounds to the same number" });
      return;
    }
    claims.push({
      claimId: `claim_${slug}_${index}`,
      claimText: conflict.sentence.trim(),
      status: "contradicted",
      sourceKeys,
      extractIds: positions.map((position) => position.extractId),
      quotes: positions,
      reason: positions
        .map((position) => {
          const source = sources.get(position.extractId.split("#")[0]);
          return `${source ? `${source.publisher} (${source.title})` : position.extractId} says: "${position.quote.trim()}"`;
        })
        .join(" "),
      patchRef: null,
      heading: conflict.heading.trim().replace(/^#+\s*/, ""),
      paragraph: Number.MAX_SAFE_INTEGER,
    });
  });

  return { claims, dropped };
}

/**
 * "$40", "$39.99" and "$40/£30" are the same price, not a disagreement. True when every quote has
 * a number and one rounded value appears in all of them. Quotes without numbers (for example
 * "decades" vs "a century") are left for the reader to see.
 */
export function quotesAgreeNumerically(quotes: string[]) {
  const sets = quotes.map((quote) => new Set((quote.replace(/(\d),(\d{3})/g, "$1$2").match(/\d+(?:\.\d+)?/g) ?? []).map((value) => Math.round(Number(value)))));
  if (sets.some((set) => set.size === 0)) return false;
  return [...sets[0]].some((value) => sets.every((set) => set.has(value)));
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function tierLabel(checks: Array<{ extractId: string | null }>, tierOf: (id: string) => AuthorityTier | undefined) {
  const tiers = unique(checks.map((check) => tierOf(check.extractId as string)));
  return tiers.map((tier) => (tier === "official" ? "official" : "reputable editorial")).join(" and ");
}

// ---------------------------------------------------------------------------
// Assembly

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * Patch facts must name the patch and its date. When a claim rests only on patch notes and the
 * sentence does not already say which update, prefix it from the patch notes' own title and date.
 */
export function datePatchClaims(claims: ResolvedClaim[], sources: Map<string, SourceRecord>): ResolvedClaim[] {
  return claims.map((claim) => {
    if (claim.status !== "supported") return claim;
    const dated = datePatchText(claim.claimText, claim.sourceKeys, sources);
    return dated ? { ...claim, claimText: dated.text, patchRef: dated.patchRef } : claim;
  });
}

/** The dated sentence for a claim backed only by patch notes, or null when it needs no change. */
export function datePatchText(text: string, sourceKeys: string[], sources: Map<string, SourceRecord>) {
  if (PATCH_REFERENCE.test(text) && DATE_REFERENCE.test(text)) return null;
  const patchSources = sourceKeys.map((key) => sources.get(key));
  if (!patchSources.length || patchSources.some((source) => source?.sourceType !== "patch_notes")) return null;
  const latest = [...patchSources].sort((a, b) => (b?.publishedDate ?? "").localeCompare(a?.publishedDate ?? ""))[0]!;
  const match = latest.publishedDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const version = latest.title.match(/Update\s+\d+(?:\.\d+)+/i)?.[0];
  if (!match || !version) return null;
  const date = `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}`;
  const patchRef = `${version}, ${date}`;
  const number = version.replace(/^Update\s+/i, "");
  const named = new RegExp(`\\b(?:Update|Patch|patch|update)\\s+${number.replace(/\./g, "\\.")}\\b`);
  // Already names the update: add its date there. Otherwise cite update and date at the end.
  if (named.test(text)) return { text: text.replace(named, (found) => `${found} (${date})`), patchRef };
  const body = text.replace(/[.!?]$/, "");
  return { text: `${body} (${patchRef}).`, patchRef };
}

export type TableSpec = { caption: ResolvedClaim | null; columns: string[]; rows: string[][] };

function escapeCell(value: string) {
  return value.replace(/\|/g, "\\|").trim();
}

export function tableMarkdown(columns: string[], rows: string[][]) {
  return [
    `| ${columns.map(escapeCell).join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`),
  ].join("\n");
}

function cites(claim: ResolvedClaim) {
  return claim.sourceKeys.map((key) => `{{cite:${key}}}`).join("");
}

/**
 * Builds the page body from resolved claims only: one sentence per claim, each followed by its
 * citations, so the reader view can match every claim to its sentence. Hub link lists and the
 * optional table are added deterministically.
 */
export function assembleMarkdown(input: {
  claims: ResolvedClaim[];
  sectionOrder: string[];
  table?: { heading: string; intro: ResolvedClaim | null; columns: string[]; rows: string[][] } | null;
  hubLinks?: Array<{ slug: string; title: string }>;
  related?: Array<{ slug: string; title: string }>;
}) {
  const parts: string[] = [];
  const headings = unique([...input.sectionOrder, ...input.claims.map((claim) => claim.heading)]);

  for (const heading of headings) {
    const inSection = input.claims.filter((claim) => claim.heading === heading);
    if (!inSection.length) continue;
    parts.push(`## ${heading}`);
    const paragraphs = new Map<number, ResolvedClaim[]>();
    for (const claim of inSection) {
      paragraphs.set(claim.paragraph, [...(paragraphs.get(claim.paragraph) ?? []), claim]);
    }
    for (const [, group] of [...paragraphs.entries()].sort((a, b) => a[0] - b[0])) {
      parts.push(group.map((claim) => `${claim.claimText}${cites(claim)}`).join(" "));
    }
  }

  if (input.table && input.table.rows.length) {
    parts.push(`## ${input.table.heading}`);
    if (input.table.intro) parts.push(`${input.table.intro.claimText}${cites(input.table.intro)}`);
    parts.push(tableMarkdown(input.table.columns, input.table.rows));
  }

  if (input.hubLinks?.length) {
    parts.push("## Pages in this section");
    parts.push(input.hubLinks.map((link) => `- [[${link.slug}|${link.title}]]`).join("\n"));
  }

  if (input.related?.length) {
    parts.push("## See also");
    parts.push(input.related.map((link) => `- [[${link.slug}|${link.title}]]`).join("\n"));
  }

  return parts.join("\n\n");
}

/** WikiPageRevision.aiProvenance for a generated page (shape: WikiPageRevisionAiProvenance). */
export function buildProvenance(input: {
  claims: ResolvedClaim[];
  sources: Map<string, SourceRecord>;
  modelId: string;
  checkModelId: string;
  responseId: string | null;
  generatedAt: string;
  extractCount: number;
  refreshReason?: string;
  requestedBy?: string;
}) {
  const citedKeys = unique(input.claims.flatMap((claim) => claim.sourceKeys));
  const references = citedKeys.flatMap((key) => {
    const source = input.sources.get(key);
    return source
      ? [
          {
            sourceId: source.sourceId,
            sourceKey: source.sourceKey,
            sourceType: source.sourceType,
            title: source.title,
            url: source.url,
            publisher: source.publisher,
            authorityTier: source.authorityTier,
            authorityScore: source.authorityScore,
          },
        ]
      : [];
  });

  return {
    provider: "vercel-ai-gateway",
    modelId: input.modelId,
    claimCheckModelId: input.checkModelId,
    promptVersion: CONTENT_PROMPT_VERSION,
    claimCheckPromptVersion: CLAIM_CHECK_PROMPT_VERSION,
    generatedAt: input.generatedAt,
    responseId: input.responseId,
    sourceContextSummary: `${input.extractCount} extracts from rendered source snapshots considered; ${references.length} sources cited.`,
    sourceReferences: references,
    claimSupport: input.claims.map((claim) => {
      const claimSources = claim.sourceKeys.flatMap((key) => {
        const source = input.sources.get(key);
        return source ? [source] : [];
      });
      return {
        claimId: claim.claimId,
        claimText: claim.claimText,
        status: claim.status,
        supportScore: claim.status === "supported" ? 0.9 : claim.status === "unsupported" ? 0.3 : 0.1,
        matchedTerms: [],
        missingTerms: [],
        matchedSourceIds: claimSources.map((source) => source.sourceId),
        matchedSourceKeys: claimSources.map((source) => source.sourceKey),
        matchedSourceTitles: claimSources.map((source) => source.title),
        reason: claim.reason,
        extractIds: claim.extractIds,
        quotes: claim.quotes,
        patchRef: claim.patchRef,
      };
    }),
    refreshReason: input.refreshReason ?? "new_page",
    requestedBy: input.requestedBy ?? "content-pipeline",
  };
}

// ---------------------------------------------------------------------------
// Deterministic weapons table (parsed from the rendered GamesRadar+ list, never model-written)

const WEAPON_CLASSES = [
  ["ASSAULT RIFLES", "Assault rifle"],
  ["SHOTGUNS", "Shotgun"],
  ["SMGS", "SMG"],
  ["PRECISION RIFLES", "Precision rifle"],
  ["MACHINE GUNS", "Machine gun"],
  ["RAILGUNS", "Railgun"],
  ["SNIPER RIFLES", "Sniper rifle"],
  ["PISTOLS", "Pistol"],
] as const;

const AMMO = new Set(["Light Rounds", "Heavy Rounds", "Volt Battery", "Volt Cell", "MIPS"]);

/** Raw extracts that are mostly table cells (three or more lines that are just an ammo type). */
export function isTableShapedExtract(text: string) {
  return text.split("\n").filter((line) => AMMO.has(line.trim())).length >= 3;
}

export function parseWeaponTable(text: string) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const rows: Array<{ name: string; weaponClass: string; ammo: string }> = [];
  let current: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const heading = WEAPON_CLASSES.find(([upper]) => line.toUpperCase() === upper);
    if (heading) {
      current = heading[1];
      continue;
    }
    if (!current) continue;
    const next = lines[index + 1];
    if (next && AMMO.has(next) && !AMMO.has(line) && line !== "Ammo type") {
      rows.push({ name: line, weaponClass: current, ammo: next });
      index += 1;
    }
  }

  return rows;
}

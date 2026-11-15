/**
 * Sentence-level edits for an existing page. A refresh shows the model the current revision's
 * sentences, asks only for targeted edits (keep, replace, add, remove) and applies them in code,
 * so every sentence the model does not touch is published again word for word.
 *
 * Erasable TypeScript only: scripts run this file directly with Node's type stripping.
 */
import { z } from "zod";

import {
  isTrustedTier,
  liftInlineCitations,
  quoteOccursIn,
  validateSentence,
  type ClaimStatus,
  type Extract,
  type Rejection,
  type ResolvedClaim,
  type SourceRecord,
  type ValidSentence,
} from "./pipeline.ts";

/** One claimSupport entry of a stored revision's aiProvenance (only the fields the patch path reads). */
export type StoredClaim = {
  claimId: string;
  claimText: string;
  status: ClaimStatus;
  matchedSourceKeys: string[];
  quotes?: Array<{ extractId: string; quote: string }>;
  patchRef?: string | null;
  reason?: string;
};

/** A published sentence of the current revision, where it sits, and the claim behind it. */
export type RevisionSentence = { id: string; heading: string; paragraph: number; claim: StoredClaim };

/** Sections assembleMarkdown writes deterministically; they are rebuilt, never edited. */
const GENERATED_SECTIONS = new Set(["Pages in this section", "See also"]);
const SENTENCE_WITH_CITES = /([^{}]+?)((?:\{\{cite:[^}]+\}\})+)/g;

/**
 * Reads a revision body back into sentences. Every sentence must match a claim with quotes (the
 * pipeline writes bodies that way); anything else returns null and the caller rewrites the page.
 * Sections that hold a table are generated from parsed data and skipped.
 */
export function parseRevision(bodyMarkdown: string, claimSupport: StoredClaim[]): RevisionSentence[] | null {
  const pool = [...claimSupport];
  const sentences: RevisionSentence[] = [];
  const sections: Array<{ heading: string; blocks: string[] }> = [];
  for (const block of bodyMarkdown.split(/\n{2,}/).map((value) => value.trim()).filter(Boolean)) {
    const heading = block.match(/^##\s+(.+)$/);
    if (heading) sections.push({ heading: heading[1].trim(), blocks: [] });
    else if (sections.length) sections.at(-1)!.blocks.push(block);
    else return null;
  }
  for (const section of sections) {
    if (GENERATED_SECTIONS.has(section.heading) || section.blocks.some((block) => block.startsWith("|"))) continue;
    section.blocks.forEach((block, paragraph) => {
      const rest = block.replace(SENTENCE_WITH_CITES, "").trim();
      if (rest) throw new UnparseableRevision();
      for (const [, raw] of block.matchAll(SENTENCE_WITH_CITES)) {
        const text = raw.trim();
        const index = pool.findIndex((claim) => claim.claimText.trim() === text);
        if (index === -1 || !pool[index].quotes?.length) throw new UnparseableRevision();
        sentences.push({ id: `s${sentences.length + 1}`, heading: section.heading, paragraph, claim: pool[index] });
        pool.splice(index, 1);
      }
    });
  }
  return sentences;
}

class UnparseableRevision extends Error {}

/** parseRevision, with "not machine-written" reported as null instead of thrown. */
export function tryParseRevision(bodyMarkdown: string, claimSupport: StoredClaim[]) {
  try {
    const sentences = parseRevision(bodyMarkdown, claimSupport);
    return sentences?.length ? sentences : null;
  } catch (error) {
    if (error instanceof UnparseableRevision) return null;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Model output

export const patchSchema = z.object({
  edits: z.array(
    z.object({
      op: z.enum(["keep", "replace", "add", "remove", "move"]),
      /** keep/replace/remove/move: the sentence edited. add: the sentence the new one should follow, or null. */
      sentenceId: z.string().nullable(),
      /** add/move: the section heading the sentence belongs under (an existing heading, or a new one). */
      section: z.string().nullable(),
      text: z.string().nullable(),
      extractIds: z.array(z.string()),
      patchRef: z.string().nullable(),
      reason: z.string(),
    }),
  ),
});

export type Patch = z.infer<typeof patchSchema>;
export type PatchEdit = Patch["edits"][number];

export const PATCH_SYSTEM = [
  "You edit an existing page of an unofficial, source-backed wiki about Marathon, Bungie's 2026 extraction shooter.",
  "You do not rewrite the page. You return a short list of sentence edits, and every sentence you do not mention stays exactly as it is.",
  "op=replace: an existing sentence that an extract or an editor note shows is wrong, outdated or imprecise. Give the whole new sentence.",
  "op=add: a fact the page lacks that an extract states and the note or the page scope calls for. Always give section: the heading",
  "it belongs under (an existing heading, or a new one). Give sentenceId of a sentence in that section it should follow, or null to start a paragraph there.",
  "op=move: an existing sentence that sits under the wrong heading. Give its sentenceId and the section it belongs under; its words stay as they are.",
  "op=remove: only for a sentence that no extract supports any more. Never remove a sentence just to shorten or restyle the page.",
  "Do not touch sentences that are still correct, even if you would word them differently. Do not repeat a fact the page already states.",
  "Every new sentence lists the extract ids that state its fact and states one fact in under 30 words, in your own words.",
  "You may ONLY state facts that appear in the extracts. Notes are not sources: they tell you what to check, not what is true.",
  "If a fact can change with updates, set patchRef and name the update and its date inside the sentence, e.g. 'As of Update 1.1.9.7 (November 10, 2026), ...'.",
  "Plain sentences only: no markdown, links, lists, brackets, asterisks, pipes or citations inside sentence text.",
  "Neutral encyclopedic tone. No marketing language, no second person, no speculation, no attribution phrases such as 'according to'.",
  "If nothing needs to change, return an empty edits list.",
].join("\n");

export function buildPatchPrompt(input: {
  title: string;
  slug: string;
  scope: string;
  today: string;
  why: string;
  sentences: RevisionSentence[];
  notes: string[];
  changedSources: string[];
  lengthHint: string | null;
  renderedExtracts: string;
}) {
  const statusLabel = (status: ClaimStatus) => (status === "supported" ? "" : status === "unsupported" ? " [community-only]" : " [sources disagree]");
  const flag = new Set(input.changedSources);
  return [
    `Today is ${input.today}. Edit the wiki page "${input.title}" (slug: ${input.slug}).`,
    `Scope: ${input.scope}`,
    `Why this edit: ${input.why}`,
    ...(input.changedSources.length
      ? [`Changed sources: ${input.changedSources.join(", ")}. Check the sentences marked (changed source) against the extracts.`]
      : []),
    ...(input.notes.length
      ? ["", "Editor and reader notes (NOT sources):", ...input.notes.map((note) => `- ${note.replace(/\s+/g, " ").slice(0, 600)}`)]
      : []),
    ...(input.lengthHint ? ["", input.lengthHint] : []),
    "",
    "Current page, one sentence per line:",
    ...input.sentences.map(
      (sentence) =>
        `[${sentence.id}] (${sentence.heading}) ${sentence.claim.claimText}${statusLabel(sentence.claim.status)}${
          sentence.claim.matchedSourceKeys.some((key) => flag.has(key)) ? " (changed source)" : ""
        }`,
    ),
    "",
    "Extracts:",
    input.renderedExtracts,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Applying a patch

export type PlannedSentence =
  | { kind: "kept"; sentence: RevisionSentence }
  | { kind: "replace"; sentence: RevisionSentence; next: ValidSentence; claimId: string }
  | { kind: "add"; heading: string; paragraph: number; next: ValidSentence; claimId: string };

export type PatchPlan = { order: PlannedSentence[]; removed: RevisionSentence[]; moved: RevisionSentence[]; rejected: Rejection[] };

function stems(text: string) {
  return new Set(
    normalized(text)
      .split(" ")
      .filter((word) => word.length > 2)
      .map((word) => word.replace(/ies$/, "y").replace(/(?<!s)s$/, "")),
  );
}

/**
 * The section a sentence fits best when the model named none: the heading whose words it shares
 * most, then the section whose sentences it shares most words with. The first section (the
 * overview) is chosen only when nothing else matches at all.
 */
export function bestSection(text: string, sentences: RevisionSentence[]): string | null {
  const headings = [...new Set(sentences.map((sentence) => sentence.heading))];
  if (headings.length === 0) return null;
  const words = stems(text);
  const overlap = (other: Set<string>) => [...other].filter((word) => words.has(word)).length;
  const scored = headings.map((heading, index) => ({
    heading,
    index,
    byHeading: overlap(stems(heading)),
    byBody: overlap(stems(sentences.filter((sentence) => sentence.heading === heading).map((sentence) => sentence.claim.claimText).join(" "))),
  }));
  const pick = (key: "byHeading" | "byBody") =>
    scored.filter((entry) => entry[key] > 0).sort((a, b) => b[key] - a[key] || Number(a.index === 0) - Number(b.index === 0) || a.index - b.index)[0];
  return (pick("byHeading") ?? pick("byBody") ?? scored[0]).heading;
}

function normalized(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function words(text: string) {
  return new Set(normalized(text).split(" ").filter((word) => word.length > 2));
}

function numbers(text: string) {
  return [...new Set(text.replace(/(\d),(\d{3})/g, "$1$2").match(/\d+(?:\.\d+)?/g) ?? [])].sort().join(" ");
}

/**
 * Two statements are "the same" when most of their words overlap and they state the same numbers,
 * so a reworded sentence is not counted as new, but "Bronze ... 3,000" and "Silver ... 5,000" are
 * two facts, not one.
 */
export function sameStatement(a: string, b: string) {
  if (numbers(a) !== numbers(b)) return false;
  const left = words(a);
  const right = words(b);
  const shared = [...left].filter((word) => right.has(word)).length;
  return shared / Math.max(1, new Set([...left, ...right]).size) >= 0.6;
}

/**
 * Turns the model's edits into an ordered sentence plan. Invalid edits are rejected and leave the
 * page as it was: a bad replacement keeps the original sentence, a bad addition adds nothing.
 */
export function planPatch(input: {
  sentences: RevisionSentence[];
  edits: PatchEdit[];
  knownExtractIds: ReadonlySet<string>;
  nextClaimId: () => string;
}): PatchPlan {
  const byId = new Map(input.sentences.map((sentence) => [sentence.id, sentence]));
  const replaced = new Map<string, { next: ValidSentence; claimId: string }>();
  const removed = new Set<string>();
  const after = new Map<string, Array<{ next: ValidSentence; claimId: string }>>();
  const appended = new Map<string, Array<{ next: ValidSentence; claimId: string }>>();
  const moved = new Map<string, string>();
  const rejected: Rejection[] = [];
  const cleanHeading = (value: string | null | undefined) => value?.trim().replace(/^#+\s*/, "") || null;
  const accepted: string[] = input.sentences.map((sentence) => sentence.claim.claimText);

  const asSentence = (edit: PatchEdit): ValidSentence | string => {
    const text = (edit.text ?? "").trim();
    const sentence = liftInlineCitations({ text, extractIds: edit.extractIds, patchRef: edit.patchRef });
    return validateSentence(sentence, input.knownExtractIds) ?? sentence;
  };

  for (const edit of input.edits) {
    if (edit.op === "keep") continue;
    const target = edit.sentenceId ? byId.get(edit.sentenceId) : undefined;
    const label = edit.text ?? edit.sentenceId ?? "(empty edit)";
    if ((edit.op === "replace" || edit.op === "remove" || edit.op === "move") && !target) {
      rejected.push({ text: label, reason: `${edit.op} names an unknown sentence ${edit.sentenceId ?? "null"}` });
      continue;
    }
    if (target && edit.op !== "add" && (replaced.has(target.id) || removed.has(target.id) || moved.has(target.id))) {
      rejected.push({ text: label, reason: `${target.id} already has an edit` });
      continue;
    }
    if (edit.op === "remove") {
      removed.add(target!.id);
      continue;
    }
    if (edit.op === "move") {
      const section = cleanHeading(edit.section);
      if (!section || section === target!.heading) {
        rejected.push({ text: target!.claim.claimText, reason: section ? "move names the section the sentence is already in" : "move needs a section" });
        continue;
      }
      moved.set(target!.id, section);
      continue;
    }
    const next = asSentence(edit);
    if (typeof next === "string") {
      rejected.push({ text: label, reason: next });
      continue;
    }
    if (edit.op === "replace") {
      if (normalized(next.text) !== normalized(target!.claim.claimText)) replaced.set(target!.id, { next, claimId: input.nextClaimId() });
      continue;
    }
    const duplicate = accepted.find((existing) => normalized(existing) === normalized(next.text) || sameStatement(existing, next.text));
    if (duplicate) {
      rejected.push({ text: next.text, reason: `repeats a statement the page already makes: "${duplicate}"` });
      continue;
    }
    if (edit.sentenceId && !target) {
      rejected.push({ text: next.text, reason: `add follows an unknown sentence ${edit.sentenceId}` });
      continue;
    }
    // The section decides where an addition goes; the sentence it follows only orders it inside that section.
    const heading = cleanHeading(edit.section) ?? bestSection(next.text, input.sentences);
    if (!heading) {
      rejected.push({ text: next.text, reason: "add needs a section" });
      continue;
    }
    accepted.push(next.text);
    const entry = { next, claimId: input.nextClaimId() };
    if (target && target.heading === heading && !moved.has(target.id)) after.set(target.id, [...(after.get(target.id) ?? []), entry]);
    else appended.set(heading, [...(appended.get(heading) ?? []), entry]);
  }

  // A moved sentence opens the first paragraph of its new section, word for word.
  const movedInto = new Map<string, RevisionSentence[]>();
  for (const sentence of input.sentences) {
    const section = moved.get(sentence.id);
    if (section) movedInto.set(section, [...(movedInto.get(section) ?? []), sentence]);
  }
  const order: PlannedSentence[] = [];
  const opened = new Set<string>();
  const openSection = (heading: string, paragraph: number) => {
    if (opened.has(heading)) return;
    opened.add(heading);
    for (const sentence of movedInto.get(heading) ?? []) order.push({ kind: "kept", sentence: { ...sentence, heading, paragraph } });
  };
  for (const sentence of input.sentences) {
    if (removed.has(sentence.id) || moved.has(sentence.id)) continue;
    openSection(sentence.heading, sentence.paragraph);
    const replacement = replaced.get(sentence.id);
    order.push(replacement ? { kind: "replace", sentence, ...replacement } : { kind: "kept", sentence });
    for (const entry of after.get(sentence.id) ?? []) order.push({ kind: "add", heading: sentence.heading, paragraph: sentence.paragraph, ...entry });
  }
  for (const heading of movedInto.keys()) openSection(heading, 0);
  for (const [heading, entries] of appended) {
    const stay = input.sentences.filter((sentence) => sentence.heading === heading && !moved.has(sentence.id) && !removed.has(sentence.id));
    const paragraph = Math.max(-1, ...stay.map((sentence) => sentence.paragraph)) + 1;
    for (const entry of entries) order.push({ kind: "add", heading, paragraph, ...entry });
  }

  return {
    order,
    removed: input.sentences.filter((sentence) => removed.has(sentence.id)),
    moved: input.sentences.filter((sentence) => moved.has(sentence.id)),
    rejected,
  };
}

/**
 * Re-checks a kept claim deterministically: each stored quote must still occur in the current
 * text of its source. Extract ids are re-pointed, since chunk numbers move when a source changes.
 * Returns null when the claim's evidence is gone.
 */
export function reverifyClaim(input: {
  sentence: RevisionSentence;
  extractsBySource: Map<string, Extract[]>;
  sources: Map<string, SourceRecord>;
}): ResolvedClaim | null {
  const { claim } = input.sentence;
  const verified = (claim.quotes ?? []).flatMap((quote) => {
    const sourceKey = quote.extractId.split("#")[0];
    const extract = (input.extractsBySource.get(sourceKey) ?? []).find((candidate) => quoteOccursIn(quote.quote, candidate.text));
    return extract ? [{ extractId: extract.id, quote: quote.quote, sourceKey }] : [];
  });
  const sourceKeys = [...new Set(verified.map((entry) => entry.sourceKey))];
  const trusted = verified.filter((entry) => {
    const tier = input.sources.get(entry.sourceKey)?.authorityTier;
    return tier ? isTrustedTier(tier) : false;
  });
  const holds =
    claim.status === "supported" ? trusted.length > 0 : claim.status === "contradicted" ? sourceKeys.length >= 2 : verified.length > 0;
  if (!holds) return null;
  const kept = claim.status === "supported" ? trusted : verified;
  return {
    claimId: claim.claimId,
    claimText: claim.claimText,
    status: claim.status,
    sourceKeys: [...new Set(kept.map((entry) => entry.sourceKey))],
    extractIds: [...new Set(kept.map((entry) => entry.extractId))],
    quotes: kept.map(({ extractId, quote }) => ({ extractId, quote })),
    reason: claim.reason ?? "",
    patchRef: claim.patchRef ?? null,
    heading: input.sentence.heading,
    paragraph: input.sentence.paragraph,
  };
}

// ---------------------------------------------------------------------------
// Regression check

export type Regression = { claimId: string; claimText: string };

/**
 * Supported statements a new revision loses although nothing about their sources changed. A
 * statement is kept when the new revision still makes it (same or reworded), or when a verified
 * replacement superseded it. Statements citing a changed source may go: their evidence moved.
 */
export function findRegressions(input: {
  previous: Array<Pick<StoredClaim, "claimId" | "claimText" | "status" | "matchedSourceKeys">>;
  next: Array<{ claimText: string }>;
  superseded?: ReadonlySet<string>;
  changedSources: ReadonlySet<string>;
}): Regression[] {
  return input.previous
    .filter((claim) => claim.status === "supported")
    .filter((claim) => !input.superseded?.has(claim.claimId))
    .filter((claim) => !input.next.some((next) => normalized(next.claimText) === normalized(claim.claimText) || sameStatement(next.claimText, claim.claimText)))
    .filter((claim) => !claim.matchedSourceKeys.some((key) => input.changedSources.has(key)))
    .map(({ claimId, claimText }) => ({ claimId, claimText }));
}

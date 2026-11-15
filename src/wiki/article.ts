import type { Root, RootContent, PhrasingContent, Parent, Text, Link } from "mdast";
import { diffArrays, diffWords } from "diff";
import GithubSlugger from "github-slugger";

import type { WikiPageRevisionAiProvenance } from "@/src/db/wiki";

type Claim = NonNullable<WikiPageRevisionAiProvenance["claimSupport"]>[number];

export type ArticleSource = {
  id: string;
  sourceKey: string | null;
  sourceType: string;
  title: string;
  url: string | null;
  publisher: string | null;
  authorityTier: string | null;
  retrievedAt: string | null;
};

export type ArticleContext = {
  tenantSlug: string;
  knownSlugs: ReadonlySet<string>;
  sources: ArticleSource[];
  claims: Claim[];
  notes: Array<{ id: string; targetQuote: string | null }>;
};

export type ArticlePlan = {
  /** Source ids in order of first citation; index + 1 is the citation number. */
  citedSourceIds: string[];
  placedNoteIds: string[];
  contradictedClaimIds: string[];
};

const CITE_PATTERN = /\{\{cite:([^}\s]+)\}\}|\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

/**
 * Lowercased, whitespace-collapsed, quote-unified text plus a map from each
 * normalized character back to its index in the original string.
 */
function normalizeWithMap(value: string) {
  let text = "";
  const map: number[] = [];
  let lastWasSpace = true;

  for (let index = 0; index < value.length; index += 1) {
    let char = value[index].toLowerCase();

    if (/\s/.test(char)) {
      if (lastWasSpace) continue;
      char = " ";
      lastWasSpace = true;
    } else {
      lastWasSpace = false;
      if (char === "\u2019" || char === "\u2018") char = "'";
      if (char === "\u201c" || char === "\u201d") char = '"';
    }

    text += char;
    map.push(index);
  }

  return { text, map };
}

/** Finds `needle` in `haystack` ignoring case, whitespace runs, curly quotes and trailing punctuation. */
export function findNormalizedRange(
  haystack: string,
  needle: string,
): [number, number] | null {
  const trimmedNeedle = needle.trim().replace(/[.!?;:,]+$/, "");
  const target = normalizeWithMap(trimmedNeedle).text.trim();

  if (target.length < 8) return null;

  const source = normalizeWithMap(haystack);
  const start = source.text.indexOf(target);

  if (start === -1) return null;

  const end = start + target.length - 1;
  let originalEnd = source.map[end] + 1;

  // Keep the sentence's closing punctuation inside the span.
  while (originalEnd < haystack.length && /[.!?]/.test(haystack[originalEnd])) {
    originalEnd += 1;
  }

  return [source.map[start], originalEnd];
}

export function nodeText(node: RootContent | Root | PhrasingContent): string {
  if ("value" in node && typeof node.value === "string") return node.value;
  if ("children" in node) return (node.children as RootContent[]).map(nodeText).join("");
  return "";
}

type CitationNode = {
  type: "citation";
  sourceId: string;
  data: { hName: string; hProperties: Record<string, string> };
};

function citationNode(sourceId: string): CitationNode {
  return {
    type: "citation",
    sourceId,
    data: { hName: "cite-ref", hProperties: { dataSourceId: sourceId } },
  };
}

function resolveSourceId(ctx: ArticleContext, key: string) {
  const byKey = ctx.sources.find(
    (source) => source.sourceKey === key || source.id === key,
  );

  if (byKey) return byKey.id;

  // Footnote syntax [^n] points at the n-th source reference.
  const index = Number(key);

  return Number.isInteger(index) && index >= 1 ? ctx.sources[index - 1]?.id ?? null : null;
}

function splitInlineTokens(ctx: ArticleContext, node: Text): PhrasingContent[] {
  const parts: PhrasingContent[] = [];
  let cursor = 0;

  for (const match of node.value.matchAll(CITE_PATTERN)) {
    const index = match.index ?? 0;

    if (index > cursor) parts.push({ type: "text", value: node.value.slice(cursor, index) });

    if (match[1]) {
      const sourceId = resolveSourceId(ctx, match[1]);
      if (sourceId) parts.push(citationNode(sourceId) as unknown as PhrasingContent);
    } else if (match[2]) {
      const slug = match[2].trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      const link: Link = {
        type: "link",
        url: `/${ctx.tenantSlug}/${slug}`,
        children: [{ type: "text", value: (match[3] ?? match[2]).trim() }],
      };
      parts.push(link);
    }

    cursor = index + match[0].length;
  }

  if (cursor === 0) return [node];
  if (cursor < node.value.length) parts.push({ type: "text", value: node.value.slice(cursor) });

  return parts;
}

function walkParents(node: Parent, visit: (parent: Parent) => void) {
  visit(node);
  for (const child of node.children) {
    if ("children" in child) walkParents(child as Parent, visit);
  }
}

/** Wraps or annotates the first text node containing the claim. Returns true when matched. */
function applyClaim(ctx: ArticleContext, paragraph: Parent, claim: Claim) {
  for (let index = 0; index < paragraph.children.length; index += 1) {
    const child = paragraph.children[index];

    if (child.type !== "text") continue;

    const range = findNormalizedRange(child.value, claim.claimText);

    if (!range) continue;

    const [start, end] = range;
    const before: Text = { type: "text", value: child.value.slice(0, start) };
    const inside: Text = { type: "text", value: child.value.slice(start, end) };
    const after: Text = { type: "text", value: child.value.slice(end) };
    const replacement: RootContent[] = [];

    if (before.value) replacement.push(before);

    if (claim.status === "supported") {
      replacement.push(inside);
      const next = paragraph.children[index + 1] as unknown as CitationNode | undefined;
      const alreadyCited = !after.value.trim() && next?.type === "citation";
      if (!alreadyCited) {
        for (const sourceId of claim.matchedSourceIds) {
          if (ctx.sources.some((source) => source.id === sourceId)) {
            replacement.push(citationNode(sourceId) as unknown as RootContent);
          }
        }
      }
    } else {
      replacement.push({
        type: "emphasis",
        children: [inside],
        data: {
          hName: "claim-mark",
          hProperties: {
            dataClaimId: claim.claimId,
            dataWhole: paragraph.children.length === 1 && !before.value.trim() && !after.value.trim() ? "true" : undefined,
          },
        },
      } as RootContent);
    }

    if (after.value) replacement.push(after);

    paragraph.children.splice(index, 1, ...(replacement as typeof paragraph.children));

    return true;
  }

  return false;
}

/**
 * remark plugin: resolves {{cite:key}}, [^n] and [[Slug]] tokens, marks claim support
 * at the sentence, and places community notes after the block that quotes them.
 * Writes what it did into `plan` so the page can number References to match.
 */
export function remarkArticle(options: { ctx: ArticleContext; plan?: ArticlePlan }) {
  const { ctx } = options;

  return (tree: Root) => {
    const plan: ArticlePlan = options.plan ?? {
      citedSourceIds: [],
      placedNoteIds: [],
      contradictedClaimIds: [],
    };

    tree.children = tree.children.filter((node) => node.type !== "footnoteDefinition");

    walkParents(tree, (parent) => {
      parent.children = parent.children.flatMap((child) => {
        if (child.type === "text") return splitInlineTokens(ctx, child);
        if (child.type === "footnoteReference") {
          const sourceId = resolveSourceId(ctx, child.identifier);
          return sourceId ? [citationNode(sourceId) as unknown as RootContent] : [];
        }
        return [child];
      }) as typeof parent.children;
    });

    const blocks: Parent[] = [];
    walkParents(tree, (parent) => {
      if (parent.type === "paragraph" || parent.type === "heading") blocks.push(parent);
    });

    for (const claim of ctx.claims) {
      const matched = blocks.some(
        (block) => block.type === "paragraph" && applyClaim(ctx, block, claim),
      );

      if (matched && claim.status === "contradicted") plan.contradictedClaimIds.push(claim.claimId);
    }

    walkParents(tree, (parent) => {
      for (const child of parent.children as unknown as CitationNode[]) {
        if (child.type === "citation" && !plan.citedSourceIds.includes(child.sourceId)) {
          plan.citedSourceIds.push(child.sourceId);
        }
      }
    });

    walkParents(tree, (parent) => {
      for (const child of parent.children as unknown as CitationNode[]) {
        if (child.type === "citation") {
          child.data.hProperties.dataN = String(plan.citedSourceIds.indexOf(child.sourceId) + 1);
        }
      }
    });

    for (const note of ctx.notes) {
      if (!note.targetQuote) continue;
      const blockIndex = tree.children.findIndex((block) =>
        findNormalizedRange(nodeText(block), note.targetQuote ?? ""),
      );
      if (blockIndex === -1) continue;
      tree.children.splice(blockIndex + 1, 0, {
        type: "communityNote",
        data: { hName: "community-note", hProperties: { dataNoteId: note.id } },
      } as unknown as RootContent);
      plan.placedNoteIds.push(note.id);
    }

    options.plan = plan;
  };
}

export type TocEntry = { id: string; depth: 2 | 3; text: string };

/** Same ids rehype-slug assigns: github-slugger over every heading in document order. */
export function extractToc(tree: Root): TocEntry[] {
  const slugger = new GithubSlugger();

  return tree.children.flatMap((node) => {
    if (node.type !== "heading") return [];
    const text = nodeText(node);
    const id = slugger.slug(text);
    // Body h1s render as h2 (the page owns the only h1).
    const depth = node.depth <= 2 ? 2 : node.depth === 3 ? 3 : null;
    return depth ? [{ id, depth, text: text.trim() } as TocEntry] : [];
  });
}

export type DiffRow =
  | { kind: "same"; text: string }
  | { kind: "added"; text: string }
  | { kind: "removed"; text: string }
  | { kind: "changed"; parts: Array<{ value: string; added?: boolean; removed?: boolean }> }
  | { kind: "gap"; count: number };

export function splitParagraphs(markdown: string) {
  return markdown
    .replace(/\{\{cite:[^}]+\}\}/g, "")
    .replace(/\[\^[^\]]+\]/g, "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/[ \t]+$/gm, "").trim())
    .filter(Boolean);
}

/** Paragraph-level diff; a removed paragraph directly followed by an added one becomes a word diff. */
export function diffParagraphs(previous: string, next: string): DiffRow[] {
  const rows: DiffRow[] = [];
  const changes = diffArrays(splitParagraphs(previous), splitParagraphs(next));

  for (let index = 0; index < changes.length; index += 1) {
    const change = changes[index];
    const following = changes[index + 1];

    if (change.removed && following?.added) {
      const pairs = Math.min(change.value.length, following.value.length);
      for (let pair = 0; pair < pairs; pair += 1) {
        const [before, after] = [change.value[pair], following.value[pair]];
        // Word-diff only a rewrite of the same paragraph; unrelated text reads better as remove + add.
        if (isRewriteOf(before, after)) rows.push({ kind: "changed", parts: diffWords(before, after) });
        else rows.push({ kind: "removed", text: before }, { kind: "added", text: after });
      }
      for (const text of change.value.slice(pairs)) rows.push({ kind: "removed", text });
      for (const text of following.value.slice(pairs)) rows.push({ kind: "added", text });
      index += 1;
      continue;
    }

    const kind = change.added ? "added" : change.removed ? "removed" : "same";
    for (const text of change.value) rows.push({ kind, text });
  }

  return rows;
}

const isHeading = (text: string) => /^#{1,6}\s/.test(text);
const wordSet = (text: string) => new Set(text.toLowerCase().match(/[a-z0-9][a-z0-9'’-]*/g) ?? []);

/** Same block type and enough shared words that a word-level diff is readable. */
export function isRewriteOf(before: string, after: string) {
  if (isHeading(before) !== isHeading(after)) return false;
  const [a, b] = [wordSet(before), wordSet(after)];
  if (!a.size || !b.size) return false;
  const shared = [...a].filter((word) => b.has(word)).length;
  return shared / (a.size + b.size - shared) >= 0.4;
}

/** Keeps changed rows plus `context` unchanged paragraphs either side; the rest collapse into gaps. */
export function changesOnly(rows: DiffRow[], context = 1): DiffRow[] {
  const keep = rows.map(() => false);

  rows.forEach((row, index) => {
    if (row.kind === "same") return;
    for (let offset = -context; offset <= context; offset += 1) {
      if (rows[index + offset]) keep[index + offset] = true;
    }
  });

  const result: DiffRow[] = [];
  let hidden = 0;

  rows.forEach((row, index) => {
    if (keep[index]) {
      if (hidden) result.push({ kind: "gap", count: hidden });
      hidden = 0;
      result.push(row);
    } else {
      hidden += 1;
    }
  });

  if (hidden) result.push({ kind: "gap", count: hidden });

  return result;
}

const TRIGGER_LABELS: Record<string, string> = {
  scheduled_weekly: "Weekly refresh",
  weekly_refresh: "Weekly refresh",
  patch_notes: "New patch notes",
  upcoming_game_event: "Upcoming game event",
  community_note: "Prompted by a reader's note",
  source_update: "New source found",
  new_page: "New page",
  manual_refresh: "Refreshed by an editor",
};

export function triggerLabel(refreshReason: string | null | undefined) {
  if (!refreshReason) return "Edited by the editors";
  return TRIGGER_LABELS[refreshReason] ?? "AI refresh";
}

export function sourceDelta(
  previous: Array<{ sourceId: string }> | undefined,
  next: Array<{ sourceId: string }> | undefined,
) {
  const before = new Set((previous ?? []).map((source) => source.sourceId));
  const after = new Set((next ?? []).map((source) => source.sourceId));

  return {
    added: [...after].filter((id) => !before.has(id)),
    removed: [...before].filter((id) => !after.has(id)),
  };
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  official: "Official",
  patch_notes: "Patch notes",
  press: "Press",
  editorial_reference: "Press",
  community: "Community",
  community_note: "Community",
  community_wiki: "Community",
};

export function sourceTypeLabel(sourceType: string) {
  return SOURCE_TYPE_LABELS[sourceType] ?? "Reference";
}

export function authorityLabel(tier: string | null) {
  if (!tier) return null;
  const label = tier.replaceAll("_", " ");
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} source`;
}


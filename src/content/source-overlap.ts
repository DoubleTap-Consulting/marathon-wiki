/**
 * Publish-gate helper: unquoted wiki prose must not repeat a run of 8 or more
 * consecutive words from a cited source (normalized). Quotations are allowed
 * only within a tight budget: at most one per section, at most 15 words each,
 * and at most 10% of the page's prose.
 */

export const MIN_SOURCE_OVERLAP_WORDS = 8;

export type SourceOverlapInput = { sourceKey?: string; text: string };

export type SourceOverlap = { phrase: string; sourceKey?: string; wordCount: number };

const CITE = /\{\{cite:[^}]+\}\}/g;
const WIKI_LINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const MD_LINK = /\[([^\]]+)\]\([^)]+\)/g;
const DOUBLE_QUOTES = /"([^"]*)"|“([^”]*)”/g;

/** Lowercase word tokens: punctuation and typographic marks become breaks, apostrophes stay in words. */
export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9']+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** Markdown with citations and links flattened, then quoted spans removed. */
export function unquotedProse(markdown: string): string {
  const withoutStructure = markdown
    .split("\n")
    .filter((line) => !/^\s*#/.test(line) && !/^\s*[-*]\s+\[\[/.test(line) && !/^\s*\|/.test(line))
    .join(" ");
  const flattened = withoutStructure
    .replace(CITE, " ")
    .replace(WIKI_LINK, (_match, slug: string, label?: string) => label ?? slug)
    .replace(MD_LINK, "$1")
    .replace(/[“”«»]/g, (char) => (char === "“" || char === "«" ? '"' : '"'));
  return flattened.replace(DOUBLE_QUOTES, " ");
}

export function findSourceOverlaps(
  bodyMarkdown: string,
  sources: SourceOverlapInput[],
  minWords = MIN_SOURCE_OVERLAP_WORDS,
): SourceOverlap[] {
  const bodyWords = normalizeWords(unquotedProse(bodyMarkdown));
  if (bodyWords.length < minWords) return [];

  const hits: SourceOverlap[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    const sourceWords = normalizeWords(source.text);
    if (sourceWords.length < minWords) continue;
    const haystack = ` ${sourceWords.join(" ")} `;
    let index = 0;
    while (index <= bodyWords.length - minWords) {
      let length = minWords;
      if (!haystack.includes(` ${bodyWords.slice(index, index + length).join(" ")} `)) {
        index += 1;
        continue;
      }
      while (
        index + length <= bodyWords.length &&
        haystack.includes(` ${bodyWords.slice(index, index + length).join(" ")} `)
      ) {
        length += 1;
      }
      const wordCount = length - 1;
      const phrase = bodyWords.slice(index, index + wordCount).join(" ");
      const key = `${source.sourceKey ?? ""}:${phrase}`;
      if (!seen.has(key)) {
        seen.add(key);
        hits.push({ phrase, wordCount, ...(source.sourceKey ? { sourceKey: source.sourceKey } : {}) });
      }
      index += wordCount;
    }
  }

  return hits;
}

export function sourceOverlapReason(overlaps: SourceOverlap[]): string | null {
  if (overlaps.length === 0) return null;
  const preview = overlaps
    .slice(0, 3)
    .map((hit) => `"${hit.phrase}"`)
    .join("; ");
  const extra = overlaps.length > 3 ? `; and ${overlaps.length - 3} more` : "";
  return `copies 8+ consecutive words from a cited source outside quotation marks: ${preview}${extra}`;
}


export const MAX_QUOTE_WORDS = 15;
export const MAX_QUOTES_PER_SECTION = 1;
export const MAX_QUOTED_WORD_RATIO = 0.1;

export type QuotedSpan = { text: string; wordCount: number; section: string };

export type QuotePolicyResult = {
  quotes: QuotedSpan[];
  quotedWords: number;
  proseWords: number;
  quotedRatio: number;
  reasons: string[];
};

const HEADING = /^\s*#{1,6}\s+(.*)$/;

/** Body sections split on markdown headings; lead-in text before the first heading is its own section. */
export function splitMarkdownSections(markdown: string): Array<{ heading: string; body: string }> {
  const sections: Array<{ heading: string; body: string }> = [];
  let heading = "";
  let lines: string[] = [];
  const flush = () => {
    const body = lines.join("\n");
    if (heading || body.trim()) sections.push({ heading, body });
    lines = [];
  };
  for (const line of markdown.split("\n")) {
    const match = line.match(HEADING);
    if (match) {
      flush();
      heading = match[1].trim();
      continue;
    }
    lines.push(line);
  }
  flush();
  return sections;
}

function flattenForQuotes(markdown: string): string {
  return markdown
    .replace(CITE, " ")
    .replace(WIKI_LINK, (_match, slug: string, label?: string) => label ?? slug)
    .replace(MD_LINK, "$1")
    .replace(/[“”«»]/g, (char) => (char === "“" || char === "«" ? '"' : '"'));
}

export function extractQuotedSpans(markdown: string): QuotedSpan[] {
  const quotes: QuotedSpan[] = [];
  for (const section of splitMarkdownSections(markdown)) {
    const flattened = flattenForQuotes(section.body);
    for (const match of flattened.matchAll(DOUBLE_QUOTES)) {
      const text = (match[1] ?? match[2] ?? "").trim();
      if (!text) continue;
      quotes.push({ text, wordCount: normalizeWords(text).length, section: section.heading || "(introduction)" });
    }
  }
  return quotes;
}

/** Prose the ratio is measured against: same exclusions as unquotedProse, but quotations are kept. */
export function pageProseWords(markdown: string): string[] {
  const withoutStructure = markdown
    .split("\n")
    .filter((line) => !/^\s*#/.test(line) && !/^\s*[-*]\s+\[\[/.test(line) && !/^\s*\|/.test(line))
    .join(" ");
  const flattened = withoutStructure
    .replace(CITE, " ")
    .replace(WIKI_LINK, (_match, slug: string, label?: string) => label ?? slug)
    .replace(MD_LINK, "$1");
  return normalizeWords(flattened);
}

export function evaluateQuotePolicy(markdown: string): QuotePolicyResult {
  const quotes = extractQuotedSpans(markdown);
  const proseWords = pageProseWords(markdown);
  const quotedWords = quotes.reduce((sum, quote) => sum + quote.wordCount, 0);
  const quotedRatio = proseWords.length === 0 ? 0 : quotedWords / proseWords.length;
  const reasons: string[] = [];

  const bySection = new Map<string, QuotedSpan[]>();
  for (const quote of quotes) {
    const list = bySection.get(quote.section) ?? [];
    list.push(quote);
    bySection.set(quote.section, list);
  }
  for (const [section, list] of bySection) {
    if (list.length > MAX_QUOTES_PER_SECTION) {
      reasons.push(`section "${section}" has ${list.length} quotations (max ${MAX_QUOTES_PER_SECTION})`);
    }
  }
  for (const quote of quotes) {
    if (quote.wordCount > MAX_QUOTE_WORDS) {
      reasons.push(`quotation in "${quote.section}" is ${quote.wordCount} words (max ${MAX_QUOTE_WORDS}): "${quote.text}"`);
    }
  }
  if (quotedRatio > MAX_QUOTED_WORD_RATIO) {
    const percent = Math.round(quotedRatio * 1000) / 10;
    reasons.push(`quoted words are ${percent}% of page prose (${quotedWords} of ${proseWords.length}, max ${MAX_QUOTED_WORD_RATIO * 100}%)`);
  }

  return { quotes, quotedWords, proseWords: proseWords.length, quotedRatio, reasons };
}

export function quotePolicyReason(policy: QuotePolicyResult): string | null {
  if (policy.reasons.length === 0) return null;
  return policy.reasons.join("; ");
}

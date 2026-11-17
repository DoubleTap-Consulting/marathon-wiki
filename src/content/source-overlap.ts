/**
 * Publish-gate helper: unquoted wiki prose must not repeat a run of 8 or more
 * consecutive words from a cited source (normalized). Short quotations in
 * quotation marks are allowed.
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

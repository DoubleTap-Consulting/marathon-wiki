import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

import { extractToc, remarkArticle } from "./article";
import type { SearchEntry } from "./search";

export type SearchSource = {
  slug: string;
  title: string;
  summary: string | null;
  bodyMarkdown: string;
  category: string | null;
  tags: string[];
};

const SUMMARY_LENGTH = 140;

function shorten(text: string) {
  if (text.length <= SUMMARY_LENGTH) return text;
  const cut = text.slice(0, SUMMARY_LENGTH);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), SUMMARY_LENGTH - 20)).trimEnd()}…`;
}

/** Runs the renderer's token pass (citations add no text), so heading ids match the article's anchors. */
export function buildSearchEntry(source: SearchSource): SearchEntry {
  const ctx = { tenantSlug: "", knownSlugs: new Set<string>(), sources: [], claims: [], notes: [] };
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkArticle, { ctx });
  const toc = extractToc(processor.runSync(processor.parse(source.bodyMarkdown)) as Parameters<typeof extractToc>[0]);
  return {
    slug: source.slug,
    title: source.title,
    aliases: source.tags,
    category: source.category,
    summary: shorten((source.summary ?? "").trim()),
    headings: toc.map(({ id, text }) => ({ id, text })),
  };
}

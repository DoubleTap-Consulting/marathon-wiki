/** One page in a tenant's search index (served as static JSON and matched on the client). */
export type SearchEntry = {
  slug: string;
  title: string;
  aliases: string[];
  category: string | null;
  summary: string;
  headings: Array<{ id: string; text: string }>;
};

export type SearchHit = {
  slug: string;
  title: string;
  category: string | null;
  /** Set when the best match is a heading; the row reads "Title › Heading" and links to its anchor. */
  heading: { id: string; text: string } | null;
  /** [start, end) of the match in the heading (when set) or else the title; null when it matched elsewhere. */
  range: [number, number] | null;
};

// Lower is better: title prefix, then a word in the title or an alias, then a heading, then summary or category.
const TIERS = { titlePrefix: 0, titleWord: 1, alias: 1, heading: 2, other: 3 } as const;

/** Case- and diacritic-insensitive form. Keeps length for ASCII and precomposed Latin, so ranges map back. */
export function fold(text: string) {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").normalize("NFC").toLowerCase();
}

function editsAtMostOne(a: string, b: string) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  const [longer, shorter] = a.length > b.length ? [a, b] : [b, a];
  return longer.slice(i + 1) === shorter.slice(i);
}

type Match = { at: number; length: number; prefix: boolean; typo: boolean };

/** Where the query starts a word of `text`, allowing one typo for queries of 4+ characters. */
function matchWords(text: string, query: string): Match | null {
  const folded = fold(text);
  const starts = [...folded.matchAll(/(?:^|[^\p{L}\p{N}])(?=[\p{L}\p{N}])/gu)].map((m) => m.index + m[0].length);
  for (const at of starts) {
    if (folded.startsWith(query, at)) return { at, length: query.length, prefix: at === 0, typo: false };
  }
  if (query.length < 4) return null;
  for (const at of starts) {
    for (const length of [query.length, query.length - 1, query.length + 1]) {
      if (editsAtMostOne(folded.slice(at, at + length), query)) return { at, length, prefix: at === 0, typo: true };
    }
  }
  return null;
}

function scoreEntry(entry: SearchEntry, query: string) {
  const candidates: Array<{ tier: number; typo: boolean; hit: Omit<SearchHit, "slug" | "title" | "category"> }> = [];
  const title = matchWords(entry.title, query);
  if (title) candidates.push({ tier: title.prefix ? TIERS.titlePrefix : TIERS.titleWord, typo: title.typo, hit: { heading: null, range: [title.at, title.at + title.length] } });
  for (const alias of entry.aliases) {
    const match = matchWords(alias, query);
    if (match) candidates.push({ tier: TIERS.alias, typo: match.typo, hit: { heading: null, range: null } });
  }
  for (const heading of entry.headings) {
    const match = matchWords(heading.text, query);
    if (match) candidates.push({ tier: TIERS.heading, typo: match.typo, hit: { heading, range: [match.at, match.at + match.length] } });
  }
  for (const text of [entry.summary, entry.category ?? ""]) {
    const match = matchWords(text, query);
    if (match) candidates.push({ tier: TIERS.other, typo: match.typo, hit: { heading: null, range: null } });
  }
  // An exact match anywhere beats a typo match; within each, the tier decides.
  candidates.sort((a, b) => Number(a.typo) - Number(b.typo) || a.tier - b.tier);
  return candidates[0] ? { rank: Number(candidates[0].typo) * 10 + candidates[0].tier, hit: candidates[0].hit } : null;
}

/** Ranked hits, one per page. */
export function searchPages(entries: SearchEntry[], rawQuery: string, limit = Infinity): SearchHit[] {
  const query = fold(rawQuery.trim()).replace(/\s+/g, " ");
  if (!query) return [];
  return entries
    .flatMap((entry) => {
      const scored = scoreEntry(entry, query);
      return scored ? [{ ...scored, entry }] : [];
    })
    .sort((a, b) => a.rank - b.rank || a.entry.title.length - b.entry.title.length || a.entry.title.localeCompare(b.entry.title))
    .slice(0, limit)
    .map(({ entry, hit }) => ({ slug: entry.slug, title: entry.title, category: entry.category, ...hit }));
}

export function hitHref(tenantSlug: string, hit: Pick<SearchHit, "slug" | "heading">) {
  return `/${tenantSlug}/${hit.slug}${hit.heading ? `#${hit.heading.id}` : ""}`;
}

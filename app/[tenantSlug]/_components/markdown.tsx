import type { Route } from "next";
import { ChevronsUpDown } from "lucide-react";
import Link from "next/link";
import Markdown, { type Components } from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

import {
  extractToc,
  remarkArticle,
  type ArticleContext,
  type ArticlePlan,
  type TocEntry,
} from "@/src/wiki/article";

import { CitationMarker, ClaimMark, type CitedSource } from "./trust-ui";

// The AI writes this markdown, so raw HTML is never rendered and everything is
// sanitized. Only our own annotation elements are allowed through.
const schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "cite-ref", "claim-mark", "community-note"],
  attributes: {
    ...defaultSchema.attributes,
    "cite-ref": ["dataSourceId", "dataN"],
    "claim-mark": ["dataClaimId", "dataWhole"],
    "community-note": ["dataNoteId"],
  },
};

const LINK_CLASS =
  "text-link underline decoration-link/40 underline-offset-4 hover:decoration-link";

const BASE_COMPONENTS: Components = {
  h2: ({ children, id }) => (
    <h2 id={id} className="mt-12 mb-3 scroll-mt-20 text-h2 font-semibold tracking-tight text-foreground first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children, id }) => (
    <h3 id={id} className="mt-8 mb-2 scroll-mt-20 text-h3 font-semibold text-foreground">
      {children}
    </h3>
  ),
  // The page owns the only h1; body headings never compete with it.
  h1: ({ children, id }) => (
    <h2 id={id} className="mt-12 mb-3 scroll-mt-20 text-h2 font-semibold tracking-tight text-foreground first:mt-0">
      {children}
    </h2>
  ),
  p: ({ children }) => <p className="my-5 first:mt-0">{children}</p>,
  ul: ({ children }) => <ul className="my-5 list-disc space-y-2 pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="my-5 list-decimal space-y-2 pl-6">{children}</ol>,
  blockquote: ({ children }) => <blockquote className="my-5 border-l-2 pl-4 text-muted-foreground">{children}</blockquote>,
  table: ({ children }) => (
    <div className="my-6 overflow-x-auto border">
      <table className="w-full border-collapse text-left text-ui tabular-nums">{children}</table>
    </div>
  ),
  // Static table styled like a sortable data grid (no sorting behaviour; the glyph is decorative).
  thead: ({ children }) => <thead className="bg-muted/60 text-label uppercase tracking-wide text-muted-foreground">{children}</thead>,
  th: ({ children }) => (
    <th scope="col" className="whitespace-nowrap border-b px-3 py-2 font-medium">
      <span className="inline-flex items-center gap-1">
        {children}
        <ChevronsUpDown aria-hidden="true" className="size-3.5 opacity-50" />
      </span>
    </th>
  ),
  tr: ({ children }) => <tr className="even:bg-muted/25">{children}</tr>,
  td: ({ children }) => <td className="border-b px-3 py-2 align-top last:border-b-0">{children}</td>,
};

type RenderInput = {
  markdown: string;
  ctx?: ArticleContext;
  cited?: Map<string, CitedSource>;
  renderNote?: (noteId: string) => React.ReactNode;
};

/** Runs the same annotation pass the renderer uses, so References and TOC match the body. */
export function planArticle(markdown: string, ctx: ArticleContext): { plan: ArticlePlan; toc: TocEntry[] } {
  const plan: ArticlePlan = { citedSourceIds: [], placedNoteIds: [], contradictedClaimIds: [] };
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkArticle, { ctx, plan });
  const tree = processor.runSync(processor.parse(markdown));

  return { plan, toc: extractToc(tree as Parameters<typeof extractToc>[0]) };
}

export function MarkdownArticle({ markdown, ctx, cited, renderNote }: RenderInput) {
  if (!markdown.trim()) {
    return <p className="text-muted-foreground">This page does not have published body content yet.</p>;
  }

  const components: Components = {
    ...BASE_COMPONENTS,
    a: ({ href, children }) => {
      if (ctx && href?.startsWith(`/${ctx.tenantSlug}/`)) {
        const slug = href.slice(ctx.tenantSlug.length + 2).split(/[/?#]/)[0];
        if (ctx.knownSlugs.has(slug)) {
          return (
            <Link href={href as Route} className={LINK_CLASS}>
              {children}
            </Link>
          );
        }
        return (
          <Link
            href={`/${ctx.tenantSlug}/suggest` as Route}
            title="This page doesn't exist yet. Suggest it."
            className="text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
          >
            {children}
          </Link>
        );
      }
      return (
        <a href={href} className={LINK_CLASS}>
          {children}
        </a>
      );
    },
  };

  const custom = {
    "cite-ref": (props: Record<string, unknown>) => {
      const source = cited?.get(String(props["data-source-id"]));
      return source ? <CitationMarker source={source} /> : null;
    },
    "claim-mark": (props: Record<string, unknown> & { children?: React.ReactNode }) => {
      const claim = ctx?.claims.find((entry) => entry.claimId === props["data-claim-id"]);
      if (!claim || claim.status === "supported") return <>{props.children}</>;
      const sources = claim.matchedSourceIds.flatMap((id) => {
        const source = ctx?.sources.find((entry) => entry.id === id);
        return source ? [{ title: source.title, url: source.url }] : [];
      });
      return (
        <ClaimMark
          status={claim.status}
          reason={
            claim.status === "unsupported"
              ? claim.reason.startsWith("community-only")
                ? "Only community sources say this so far. No official or press source confirms it yet."
                : "None of the sources used for this page mention this yet."
              : plainContradiction(claim.reason)
          }
          sources={sources}
          whole={props["data-whole"] === "true"}
        >
          {props.children}
        </ClaimMark>
      );
    },
    "community-note": (props: Record<string, unknown>) => renderNote?.(String(props["data-note-id"])) ?? null,
  };

  return (
    <div className="text-body text-foreground">
      <Markdown
        remarkPlugins={[remarkGfm, ...(ctx ? [[remarkArticle, { ctx }] as [typeof remarkArticle, { ctx: ArticleContext }]] : [])]}
        rehypePlugins={[[rehypeSanitize, schema], rehypeSlug]}
        components={{ ...components, ...(custom as unknown as Components) }}
      >
        {markdown}
      </Markdown>
    </div>
  );
}

function plainContradiction(reason: string) {
  return reason.startsWith("Potential negation")
    ? "At least one source says something different. Editors have been asked to check it."
    : reason;
}

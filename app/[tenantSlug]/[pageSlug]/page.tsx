import type { Metadata } from "next";

import { getCachedWikiPage } from "@/src/wiki/cache";
import { buildWikiMetadata } from "@/src/wiki/metadata";
import { normalizeTenantSlug } from "@/src/wiki/tenant-routing";

import { MarkdownArticle } from "../_components/markdown";
import { MissingWikiPage } from "../_components/missing-page";
import { WikiAdSlot, WikiPremiumHook } from "../_components/monetization";
import { WikiChrome } from "../_components/wiki-chrome";

export const revalidate = 300;
export const dynamic = "force-static";

type ArticlePageProps = {
  params: Promise<{
    tenantSlug: string;
    pageSlug: string;
  }>;
};

export async function generateMetadata({
  params,
}: ArticlePageProps): Promise<Metadata> {
  const { tenantSlug, pageSlug } = await params;
  const snapshot = await getCachedWikiPage(
    normalizeTenantSlug(tenantSlug),
    normalizeTenantSlug(pageSlug),
  );

  if (!snapshot) {
    return {
      title: "Page not found",
    };
  }

  return buildWikiMetadata({
    title: `${snapshot.page.title} | ${snapshot.tenant.name}`,
    description: snapshot.page.summary,
    path: `/${snapshot.tenant.slug}/${snapshot.page.slug}`,
    siteName: snapshot.tenant.name,
  });
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { tenantSlug, pageSlug } = await params;
  const normalizedTenantSlug = normalizeTenantSlug(tenantSlug);
  const snapshot = await getCachedWikiPage(
    normalizedTenantSlug,
    normalizeTenantSlug(pageSlug),
  );

  if (!snapshot) {
    return (
      <MissingWikiPage
        tenantSlug={normalizedTenantSlug}
        title="Page not found"
        description="This wiki page may not exist yet, may be unpublished, or may belong to a different tenant."
      />
    );
  }

  const aiProvenance = snapshot.page.latestRevision?.aiProvenance ?? null;

  return (
    <WikiChrome tenant={snapshot.tenant} categories={snapshot.categories}>
      <article className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        <div className="min-w-0 rounded-lg border bg-card p-5 text-card-foreground sm:p-8">
          <div className="border-b pb-6">
            <div className="flex flex-wrap gap-2">
              {snapshot.page.categories.map((category) => (
                <a
                  key={category.id}
                  href={`/${snapshot.tenant.slug}/categories/${category.slug}`}
                  className="inline-flex min-h-9 items-center rounded-md border bg-background px-2.5 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                >
                  {category.name}
                </a>
              ))}
            </div>
            {aiProvenance ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex min-h-8 items-center rounded-md border border-primary/30 bg-primary/10 px-2.5 text-xs font-medium text-foreground">
                  AI-generated canonical content
                </span>
                <span className="inline-flex min-h-8 items-center rounded-md border bg-background px-2.5 text-xs font-medium text-muted-foreground">
                  Last AI update {formatDate(aiProvenance.generatedAt)}
                </span>
              </div>
            ) : null}
            <h1 className="mt-4 text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
              {snapshot.page.title}
            </h1>
            {snapshot.page.summary ? (
              <p className="mt-4 text-lg leading-8 text-muted-foreground">
                {snapshot.page.summary}
              </p>
            ) : null}
          </div>

          <div className="mt-8">
            <MarkdownArticle markdown={snapshot.page.bodyMarkdown} />
          </div>
        </div>

        <aside className="min-w-0 space-y-4">
          <section className="rounded-lg border bg-card p-5 text-card-foreground">
            <h2 className="text-lg font-semibold leading-7">Page details</h2>
            <dl className="mt-4 space-y-3 text-sm leading-6">
              <Detail label="Status" value={snapshot.page.status} />
              <Detail
                label="Revision"
                value={snapshot.page.latestRevisionNumber.toString()}
              />
              <Detail label="Updated" value={formatDate(snapshot.page.updatedAt)} />
              <Detail
                label="AI update"
                value={
                  aiProvenance ? formatDate(aiProvenance.generatedAt) : "Not AI-generated"
                }
              />
            </dl>
            <a
              href={`/${snapshot.tenant.slug}/suggest/${snapshot.page.slug}`}
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              data-wiki-event="suggestion_cta"
              data-wiki-event-label="article-sidebar"
              data-wiki-tenant={snapshot.tenant.slug}
              data-wiki-page={snapshot.page.slug}
            >
              Suggest an edit
            </a>
          </section>

          <section className="rounded-lg border bg-card p-5 text-card-foreground">
            <h2 className="text-lg font-semibold leading-7">AI provenance</h2>
            {aiProvenance ? (
              <div className="mt-4 space-y-4">
                <dl className="space-y-3 text-sm leading-6">
                  <Detail label="Model" value={aiProvenance.modelId} />
                  <Detail label="Prompt" value={aiProvenance.promptVersion} />
                  <Detail label="Reason" value={aiProvenance.refreshReason} />
                </dl>
                <div className="rounded-md border bg-background p-3">
                  <h3 className="text-sm font-semibold leading-6">
                    Source context
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {aiProvenance.sourceContextSummary}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                This revision does not have AI provenance yet.
              </p>
            )}
          </section>

          <WikiPremiumHook
            tenantSlug={snapshot.tenant.slug}
            pageSlug={snapshot.page.slug}
          />

          <section className="rounded-lg border bg-card p-5 text-card-foreground">
            <h2 className="text-lg font-semibold leading-7">Sources</h2>
            {snapshot.page.sources.length > 0 ? (
              <ul className="mt-4 space-y-3">
                {snapshot.page.sources.map((source) => (
                  <li key={source.id}>
                    {source.url ? (
                      <a
                        href={source.url}
                        className="block min-h-11 rounded-md text-sm font-medium leading-6 text-foreground underline decoration-border underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                      >
                        {source.title}
                      </a>
                    ) : (
                      <span className="block text-sm font-medium leading-6 text-foreground">
                        {source.title}
                      </span>
                    )}
                    {source.publisher || source.sourceKey ? (
                      <span className="block text-xs leading-5 text-muted-foreground">
                        {[
                          source.publisher,
                          formatSourceType(source.sourceType),
                          formatAuthority(source.metadata),
                          source.sourceKey,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                No sources are attached to this page yet.
              </p>
            )}
          </section>

          {snapshot.page.tags.length > 0 ? (
            <section className="rounded-lg border bg-card p-5 text-card-foreground">
              <h2 className="text-lg font-semibold leading-7">Tags</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {snapshot.page.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex min-h-8 items-center rounded-md bg-secondary px-2.5 text-xs font-medium text-secondary-foreground"
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          <WikiAdSlot
            placement="sidebar"
            tenantSlug={snapshot.tenant.slug}
            pageSlug={snapshot.page.slug}
          />
        </aside>
      </article>
    </WikiChrome>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[5rem_1fr] gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words font-medium text-card-foreground">
        {value}
      </dd>
    </div>
  );
}

function formatDate(value: Date | string | null) {
  const date = value ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatSourceType(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function formatAuthority(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const authorityTier = (metadata as { authorityTier?: unknown }).authorityTier;
  const authorityScore = (metadata as { authorityScore?: unknown })
    .authorityScore;

  if (typeof authorityTier !== "string" || !authorityTier.trim()) {
    return null;
  }

  const label = authorityTier
    .split("_")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");

  return typeof authorityScore === "number"
    ? `${label} ${authorityScore}/100`
    : label;
}

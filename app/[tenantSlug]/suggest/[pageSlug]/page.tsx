import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getAuthMode, getCurrentWikiActor } from "@/src/auth/wiki-auth";
import { getWikiPageSnapshot } from "@/src/db/wiki";
import {
  normalizeTenantSlug,
  normalizeWikiSlug,
} from "@/src/wiki/tenant-routing";

import { WikiChrome } from "../../_components/wiki-chrome";
import {
  SuggestionActorBar,
  SuggestionAuthPanel,
} from "../_components/auth-panel";
import { SuggestionForm } from "../_components/suggestion-form";
import { submitWikiSuggestion } from "../actions";

export const dynamic = "force-dynamic";

type SuggestEditPageProps = {
  params: Promise<{
    tenantSlug: string;
    pageSlug: string;
  }>;
};

export async function generateMetadata({
  params,
}: SuggestEditPageProps): Promise<Metadata> {
  const { tenantSlug, pageSlug } = await params;
  const snapshot = await getWikiPageSnapshot(
    normalizeTenantSlug(tenantSlug),
    normalizeWikiSlug(pageSlug),
  );

  return {
    title: snapshot
      ? `Suggest edit: ${snapshot.page.title} | ${snapshot.tenant.name}`
      : "Page not found",
  };
}

export default async function SuggestEditPage({
  params,
}: SuggestEditPageProps) {
  const { tenantSlug, pageSlug } = await params;
  const normalizedPageSlug = normalizeWikiSlug(pageSlug);
  const snapshot = await getWikiPageSnapshot(
    normalizeTenantSlug(tenantSlug),
    normalizedPageSlug,
  );

  if (!snapshot) {
    notFound();
  }

  const [actor, authMode] = await Promise.all([
    getCurrentWikiActor(),
    Promise.resolve(getAuthMode()),
  ]);

  return (
    <WikiChrome tenant={snapshot.tenant} categories={snapshot.categories}>
      <section className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-normal text-muted-foreground">
            Editorial suggestions
          </p>
          <h1 className="text-4xl font-semibold leading-tight text-foreground">
            Suggest an edit
          </h1>
          <p className="text-base leading-8 text-muted-foreground">
            Propose changes to {snapshot.page.title}. Editors can approve,
            reject, or request changes before the public page is updated.
          </p>
        </div>

        {actor ? (
          <>
            <SuggestionActorBar actor={actor} authMode={authMode} />
            <div className="rounded-lg border bg-card p-5 text-card-foreground sm:p-6">
              <SuggestionForm
                action={submitWikiSuggestion.bind(
                  null,
                  snapshot.tenant.slug,
                  snapshot.page.slug,
                )}
                suggestionType="edit_page"
                initialTitle={snapshot.page.title}
                initialSlug={snapshot.page.slug}
                initialSummary={snapshot.page.summary}
                initialBodyMarkdown={snapshot.page.bodyMarkdown}
                submitLabel="Submit edit"
              />
            </div>
          </>
        ) : (
          <SuggestionAuthPanel authMode={authMode} />
        )}
      </section>
    </WikiChrome>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getAuthMode, getCurrentWikiActor } from "@/src/auth/wiki-auth";
import { getWikiHomeSnapshot } from "@/src/db/wiki";
import { normalizeTenantSlug } from "@/src/wiki/tenant-routing";

import { WikiChrome } from "../_components/wiki-chrome";
import {
  SuggestionActorBar,
  SuggestionAuthPanel,
} from "./_components/auth-panel";
import { SuggestionForm } from "./_components/suggestion-form";
import { submitWikiSuggestion } from "./actions";

export const dynamic = "force-dynamic";

type SuggestPageProps = {
  params: Promise<{
    tenantSlug: string;
  }>;
};

export async function generateMetadata({
  params,
}: SuggestPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const snapshot = await getWikiHomeSnapshot(normalizeTenantSlug(tenantSlug));

  return {
    title: snapshot ? `Suggest a page | ${snapshot.tenant.name}` : "Wiki not found",
  };
}

export default async function SuggestPage({ params }: SuggestPageProps) {
  const { tenantSlug } = await params;
  const snapshot = await getWikiHomeSnapshot(normalizeTenantSlug(tenantSlug));

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
            Suggest a new page
          </h1>
          <p className="text-base leading-8 text-muted-foreground">
            Propose a page for editors to review. Public wiki pages are not
            changed until an editor approves the suggestion.
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
                  null,
                )}
                suggestionType="new_page"
                submitLabel="Submit suggestion"
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

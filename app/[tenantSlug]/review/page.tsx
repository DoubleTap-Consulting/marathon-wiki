import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  canReviewSuggestions,
  getAuthMode,
  getCurrentWikiActor,
} from "@/src/auth/wiki-auth";
import {
  getWikiHomeSnapshot,
  listWikiCommunityNotesForReview,
  listWikiSuggestionsForReview,
  type WikiCommunityNoteSummary,
  type WikiSuggestionSummary,
} from "@/src/db/wiki";
import { composeWikiTitle } from "@/src/wiki/metadata";
import { loadOfficialSourceGaps } from "@/src/wiki/official-gaps";
import { normalizeTenantSlug } from "@/src/wiki/tenant-routing";

import { ClerkSignInControl, ClerkUserControl } from "../_components/auth-controls";
import { MarkdownArticle } from "../_components/markdown";
import { EmptyState, WikiChrome } from "../_components/wiki-chrome";
import { AiRewriteForm } from "./_components/ai-rewrite-form";
import { AiDraftForm } from "./_components/ai-draft-form";
import { OfficialSourceGapsSection } from "./_components/official-gaps";
import {
  queueAiRewriteAction,
  generateAiWikiSuggestionAction,
} from "./ai-actions";
import {
  reviewWikiCommunityNoteAction,
  reviewWikiSuggestionAction,
} from "./actions";
import { Textarea } from "@/components/ui/input";

export const dynamic = "force-dynamic";

type ReviewPageProps = {
  params: Promise<{
    tenantSlug: string;
  }>;
};

export async function generateMetadata({
  params,
}: ReviewPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const snapshot = await getWikiHomeSnapshot(normalizeTenantSlug(tenantSlug));

  return {
    title: snapshot ? { absolute: composeWikiTitle("Review suggestions", snapshot.tenant.name) } : "Wiki not found",
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function ReviewPage({ params }: ReviewPageProps) {
  const { tenantSlug } = await params;
  const snapshot = await getWikiHomeSnapshot(normalizeTenantSlug(tenantSlug));

  if (!snapshot) {
    notFound();
  }

  const [actor, authMode] = await Promise.all([
    getCurrentWikiActor(),
    Promise.resolve(getAuthMode()),
  ]);
  const canReview = canReviewSuggestions(actor);
  const [suggestions, communityNotes, gaps] = canReview
    ? await Promise.all([
        listWikiSuggestionsForReview(snapshot.tenant.id),
        listWikiCommunityNotesForReview(snapshot.tenant.id),
        loadOfficialSourceGaps(snapshot.tenant.id),
      ])
    : [[], [], null];

  return (
    <WikiChrome tenant={snapshot.tenant} categories={snapshot.categories}>
      <section className="min-w-0 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-3">
            <p className="text-label font-medium uppercase tracking-normal text-muted-foreground">
              Editorial workflow
            </p>
            <h1 className="break-words text-title font-display text-foreground">
              Review and generate
            </h1>
            <p className="max-w-full text-body text-muted-foreground sm:max-w-3xl">
              Generate canonical AI revisions or approve suggestions into the
              durable page history. Failed generation attempts leave public wiki
              content untouched.
            </p>
          </div>
          {authMode === "clerk" && actor ? <ClerkUserControl /> : null}
        </div>

        {!actor ? (
          <ReviewAccessPanel authMode={authMode} />
        ) : !canReview ? (
          <section className="border bg-card p-6 text-card-foreground">
            <h2 className="text-h3 font-semibold">
              Editor access required
            </h2>
            <p className="mt-2 max-w-2xl text-ui text-muted-foreground">
              Your account is signed in, but it is not included in the wiki
              editor allowlist for this environment.
            </p>
          </section>
        ) : (
          <div className="space-y-6">
            <AiRewriteForm
              action={queueAiRewriteAction.bind(
                null,
                snapshot.tenant.slug,
              )}
            />
            <AiDraftForm
              action={generateAiWikiSuggestionAction.bind(
                null,
                snapshot.tenant.slug,
              )}
            />
            <ReviewSection
              title="Community notes"
              description="Approve public notes, reject unsupported submissions, or mark notes incorporated after they have informed an AI refresh."
              emptyTitle="No community notes yet"
              emptyDescription="Submitted community notes will appear here for moderator review."
            >
              {communityNotes.map((note) => (
                <CommunityNoteReviewCard
                  key={note.id}
                  tenantSlug={snapshot.tenant.slug}
                  note={note}
                />
              ))}
            </ReviewSection>
            {gaps ? <OfficialSourceGapsSection gaps={gaps} /> : null}
            <ReviewSection
              title="Page suggestions"
              description="Approve new page and edit suggestions into normal page revisions."
              emptyTitle="No suggestions yet"
              emptyDescription="Submitted page suggestions will appear here for editorial review."
            >
              {suggestions.map((suggestion) => (
                <SuggestionReviewCard
                  key={suggestion.id}
                  tenantSlug={snapshot.tenant.slug}
                  suggestion={suggestion}
                />
              ))}
            </ReviewSection>
          </div>
        )}
      </section>
    </WikiChrome>
  );
}

function ReviewSection({
  title,
  description,
  emptyTitle,
  emptyDescription,
  children,
}: {
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  children: React.ReactNode[];
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-h2 font-semibold">{title}</h2>
        <p className="mt-1 text-small text-muted-foreground">
          {description}
        </p>
      </div>
      {children.length > 0 ? (
        <div className="space-y-4">{children}</div>
      ) : (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      )}
    </section>
  );
}

function ReviewAccessPanel({
  authMode,
}: {
  authMode: "clerk" | "dev" | "unconfigured";
}) {
  return (
    <section className="border bg-card p-6 text-card-foreground">
      <h2 className="text-h3 font-semibold">Sign in required</h2>
      <p className="mt-2 max-w-2xl text-ui text-muted-foreground">
        Editorial actions require a signed-in user on the editor allowlist.
      </p>
      <div className="mt-5">
        {authMode === "clerk" ? (
          <ClerkSignInControl>Sign in to review</ClerkSignInControl>
        ) : (
          <p className="text-small text-muted-foreground">
            Auth is not configured for this environment. Set Clerk keys and an
            editor allowlist for deployed preview.
          </p>
        )}
      </div>
    </section>
  );
}

function SuggestionReviewCard({
  tenantSlug,
  suggestion,
}: {
  tenantSlug: string;
  suggestion: WikiSuggestionSummary;
}) {
  const canAct = suggestion.status === "pending" || suggestion.status === "changes_requested";
  const ai = getAiProvenance(suggestion);

  return (
    <article className="border bg-card p-5 text-card-foreground sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap gap-2">
            <StatusPill status={suggestion.status} />
            <span className="inline-flex min-h-8 items-center border bg-background px-2.5 text-label font-medium">
              {suggestion.suggestionType === "new_page" ? "New page" : "Edit page"}
            </span>
            {ai ? (
              <span className="inline-flex min-h-8 items-center border border-border bg-muted px-2.5 text-label font-medium">
                AI-assisted
              </span>
            ) : null}
          </div>
          <h2 className="text-h2 font-semibold">{suggestion.title}</h2>
          <p className="text-small text-muted-foreground">
            Target:{" "}
            <span className="font-medium text-card-foreground">
              /{tenantSlug}/{suggestion.targetSlug}
            </span>
          </p>
          {suggestion.summary ? (
            <p className="max-w-3xl text-ui text-muted-foreground">
              {suggestion.summary}
            </p>
          ) : null}
        </div>
        <div className="text-small text-muted-foreground lg:text-right">
          <p>Submitted {formatDate(suggestion.createdAt)}</p>
          <p className="break-all">By {suggestion.createdBy ?? "Unknown user"}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 border bg-background p-4">
          <h3 className="text-ui font-semibold">Proposed markdown</h3>
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words bg-secondary p-3 font-mono text-ui text-secondary-foreground">
            {suggestion.bodyMarkdown}
          </pre>
        </div>

        <aside className="space-y-4">
          {ai ? (
            <div className="border bg-background p-3">
              <h3 className="text-ui font-semibold">AI provenance</h3>
              <dl className="mt-1 space-y-1 text-small text-muted-foreground">
                <div>
                  <dt className="inline font-medium text-card-foreground">
                    Model:
                  </dt>{" "}
                  <dd className="inline break-all">{ai.model}</dd>
                </div>
                {ai.responseId ? (
                  <div>
                    <dt className="inline font-medium text-card-foreground">
                      Response:
                    </dt>{" "}
                    <dd className="inline break-all">{ai.responseId}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ) : null}
          {suggestion.sourceUrl ? (
            <a
              href={suggestion.sourceUrl}
              className="block min-h-11 border bg-background p-3 text-ui font-medium underline decoration-border underline-offset-4"
            >
              Review source
            </a>
          ) : null}
          {suggestion.reviewNote ? (
            <div className="border bg-background p-3">
              <h3 className="text-ui font-semibold">Review note</h3>
              <p className="mt-1 text-small text-muted-foreground">
                {suggestion.reviewNote}
              </p>
            </div>
          ) : null}
        </aside>
      </div>

      {canAct ? (
        <form
          action={reviewWikiSuggestionAction.bind(null, tenantSlug)}
          className="mt-5 space-y-3 border-t pt-5"
        >
          <input type="hidden" name="suggestionId" value={suggestion.id} />
          <div className="grid gap-2">
            <label
              htmlFor={`review-note-${suggestion.id}`}
              className="text-ui font-medium"
            >
              Review note
            </label>
            <Textarea
              id={`review-note-${suggestion.id}`}
              name="reviewNote"
              rows={3}
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="submit"
              name="reviewAction"
              value="approve"
              className="inline-flex min-h-11 items-center justify-center border border-foreground bg-primary px-4 hover:bg-primary-hover dark:border-transparent text-ui font-medium text-primary-foreground"
            >
              Approve
            </button>
            <button
              type="submit"
              name="reviewAction"
              value="changes_requested"
              className="inline-flex min-h-11 items-center justify-center border bg-background px-4 text-ui font-medium text-foreground"
            >
              Request changes
            </button>
            <button
              type="submit"
              name="reviewAction"
              value="rejected"
              className="inline-flex min-h-11 items-center justify-center border border-destructive/40 bg-background px-4 text-ui font-medium text-destructive"
            >
              Reject
            </button>
          </div>
        </form>
      ) : null}
    </article>
  );
}

function CommunityNoteReviewCard({
  tenantSlug,
  note,
}: {
  tenantSlug: string;
  note: WikiCommunityNoteSummary;
}) {
  const canAct = note.status === "pending" || note.status === "approved";

  return (
    <article className="border bg-card p-5 text-card-foreground sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap gap-2">
            <StatusPill status={note.status} />
            <span className="inline-flex min-h-8 items-center border bg-background px-2.5 text-label font-medium">
              {formatLabel(note.noteType)}
            </span>
          </div>
          <h3 className="text-h2 font-semibold">
            Community note for {note.pageTitle}
          </h3>
          <p className="text-small text-muted-foreground">
            Target:{" "}
            <a
              href={`/${tenantSlug}/${note.pageSlug}`}
              className="font-medium text-card-foreground underline decoration-border underline-offset-4"
            >
              /{tenantSlug}/{note.pageSlug}
            </a>
          </p>
        </div>
        <div className="text-small text-muted-foreground lg:text-right">
          <p>Submitted {formatDate(note.createdAt)}</p>
          <p className="break-all">By {note.createdBy ?? "Unknown user"}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 border bg-background p-4">
          {note.targetQuote ? (
            <blockquote className="mb-4 border-l-2 border-border pl-3 text-small text-muted-foreground">
              {note.targetQuote}
            </blockquote>
          ) : null}
          <MarkdownArticle markdown={note.bodyMarkdown} />
        </div>

        <aside className="space-y-4">
          {note.sourceUrl ? (
            <a
              href={note.sourceUrl}
              className="block min-h-11 border bg-background p-3 text-ui font-medium underline decoration-border underline-offset-4"
            >
              Review source
            </a>
          ) : null}
          {note.reviewNote ? (
            <div className="border bg-background p-3">
              <h4 className="text-ui font-semibold">Review note</h4>
              <p className="mt-1 text-small text-muted-foreground">
                {note.reviewNote}
              </p>
            </div>
          ) : null}
        </aside>
      </div>

      {canAct ? (
        <form
          action={reviewWikiCommunityNoteAction.bind(null, tenantSlug)}
          className="mt-5 space-y-3 border-t pt-5"
        >
          <input type="hidden" name="noteId" value={note.id} />
          <div className="grid gap-2">
            <label
              htmlFor={`community-note-review-${note.id}`}
              className="text-ui font-medium"
            >
              Review note
            </label>
            <Textarea
              id={`community-note-review-${note.id}`}
              name="reviewNote"
              rows={3}
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="submit"
              name="reviewAction"
              value="approved"
              className="inline-flex min-h-11 items-center justify-center border border-foreground bg-primary px-4 hover:bg-primary-hover dark:border-transparent text-ui font-medium text-primary-foreground"
            >
              Approve note
            </button>
            <button
              type="submit"
              name="reviewAction"
              value="incorporated"
              className="inline-flex min-h-11 items-center justify-center border bg-background px-4 text-ui font-medium text-foreground"
            >
              Mark incorporated
            </button>
            {note.status === "pending" ? (
              <button
                type="submit"
                name="reviewAction"
                value="rejected"
                className="inline-flex min-h-11 items-center justify-center border border-destructive/40 bg-background px-4 text-ui font-medium text-destructive"
              >
                Reject note
              </button>
            ) : null}
          </div>
        </form>
      ) : null}
    </article>
  );
}

function StatusPill({ status }: { status: string }) {
  const className =
    status === "approved"
      ? "border-border bg-muted text-foreground"
      : status === "rejected"
        ? "border-destructive/30 bg-destructive/10 text-foreground"
        : status === "changes_requested"
          ? "border-claim-unverified/40 bg-claim-unverified/10 text-foreground"
          : "border-input bg-background text-foreground";

  return (
    <span
      className={`inline-flex min-h-8 items-center border px-2.5 text-label font-medium ${className}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

function formatLabel(value: string) {
  const label = value.replaceAll("_", " ").trim();

  return label ? label.charAt(0).toUpperCase() + label.slice(1) : "General";
}

function getAiProvenance(suggestion: WikiSuggestionSummary) {
  const ai = suggestion.metadata?.ai;

  if (!ai || typeof ai !== "object") {
    return null;
  }

  const model = typeof ai.model === "string" ? ai.model : null;

  if (!model) {
    return null;
  }

  return {
    model,
    responseId: typeof ai.responseId === "string" ? ai.responseId : null,
  };
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
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

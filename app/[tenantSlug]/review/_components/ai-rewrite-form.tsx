"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { AiRewriteFormState } from "../ai-actions";

type AiRewriteFormProps = {
  action: (state: AiRewriteFormState, formData: FormData) => Promise<AiRewriteFormState>;
};

const inputClass =
  "min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-body text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function AiRewriteForm({ action }: AiRewriteFormProps) {
  const [state, formAction] = useActionState(action, { ok: false, message: null });

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border bg-card p-5 text-card-foreground sm:p-6">
      <div className="min-w-0 space-y-2">
        <p className="text-label font-medium uppercase tracking-normal text-muted-foreground">AI editor</p>
        <h2 className="break-words text-h2 font-semibold">Queue a rewrite</h2>
        <p className="max-w-full text-ui text-muted-foreground sm:max-w-3xl">
          The AI editor rewrites the page from its stored, cited sources. If enough of its statements are confirmed by
          official or press sources, the new revision is published; otherwise it comes back here for review.
        </p>
      </div>

      <form action={formAction} className="mt-5 grid min-w-0 max-w-full gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <div className="grid min-w-0 gap-2">
          <label htmlFor="ai-rewrite-title" className="text-ui font-medium">
            Page title
          </label>
          <input id="ai-rewrite-title" name="pageTitle" type="text" required minLength={3} placeholder="Recon" className={inputClass} />
        </div>
        <div className="grid min-w-0 gap-2">
          <label htmlFor="ai-rewrite-slug" className="text-ui font-medium">
            Slug
          </label>
          <input id="ai-rewrite-slug" name="targetSlug" type="text" required placeholder="recon" autoComplete="off" spellCheck="false" className={inputClass} />
        </div>
        <SubmitButton />
        {state.message ? (
          <div
            className={`rounded-md border p-4 text-ui sm:col-span-3 ${
              state.ok ? "border-primary/40 bg-primary/10 text-foreground" : "border-destructive/40 bg-destructive/10 text-foreground"
            }`}
            role="status"
            aria-live="polite"
          >
            {state.message}
            {state.ok && state.pageSlug ? (
              <a href={`../${state.pageSlug}`} className="ml-2 font-medium underline decoration-border underline-offset-4">
                View current page
              </a>
            ) : null}
          </div>
        ) : null}
      </form>
    </section>
  );
}

function SubmitButton() {
  const status = useFormStatus();

  return (
    <button
      type="submit"
      disabled={status.pending}
      className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-ui font-medium text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-60"
    >
      {status.pending ? "Queueing..." : "Queue rewrite"}
    </button>
  );
}

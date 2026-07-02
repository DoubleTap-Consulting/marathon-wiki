"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";

import type { AiDraftFormState } from "../ai-actions";

type AiDraftFormProps = {
  action: (
    state: AiDraftFormState,
    formData: FormData,
  ) => Promise<AiDraftFormState>;
};

export function AiDraftForm({ action }: AiDraftFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(action, {
    ok: false,
    message: null,
  });

  return (
    <section className="rounded-lg border bg-card p-5 text-card-foreground sm:p-6">
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-normal text-muted-foreground">
          AI assistance
        </p>
        <h2 className="text-2xl font-semibold leading-8">
          Generate a draft suggestion
        </h2>
        <p className="max-w-3xl text-base leading-7 text-muted-foreground">
          Ask Grok for a starting draft. The result is saved as a pending
          suggestion and still requires editorial approval before publication.
        </p>
      </div>

      <form
        ref={formRef}
        action={formAction}
        className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,18rem)]"
        onKeyDown={(event) => {
          if (
            event.target instanceof HTMLTextAreaElement &&
            (event.metaKey || event.ctrlKey) &&
            event.key === "Enter"
          ) {
            event.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
      >
        <div className="grid gap-4">
          {state.message ? (
            <div
              className={`rounded-md border p-4 text-sm leading-6 ${
                state.ok
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-destructive/40 bg-destructive/10 text-foreground"
              }`}
              role="status"
              aria-live="polite"
            >
              {state.message}
            </div>
          ) : null}

          <div className="grid gap-2">
            <label htmlFor="ai-page-title" className="text-sm font-medium">
              Page title or topic
            </label>
            <input
              id="ai-page-title"
              name="pageTitle"
              type="text"
              required
              minLength={3}
              placeholder="Overrun AR"
              className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="grid gap-2">
            <label htmlFor="ai-target-slug" className="text-sm font-medium">
              Target slug
            </label>
            <input
              id="ai-target-slug"
              name="targetSlug"
              type="text"
              required
              placeholder="overrun-ar"
              autoComplete="off"
              spellCheck="false"
              className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        <div className="grid gap-3">
          <label htmlFor="ai-source-notes" className="text-sm font-medium">
            Source or context notes
          </label>
          <textarea
            id="ai-source-notes"
            name="sourceNotes"
            rows={7}
            placeholder="Official weapon notes, screenshots, or constraints editors should verify."
            className="min-h-40 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-base leading-7 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <SubmitButton />
        </div>
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
      className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-base font-medium text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-60"
    >
      {status.pending ? "Generating..." : "Generate draft"}
    </button>
  );
}

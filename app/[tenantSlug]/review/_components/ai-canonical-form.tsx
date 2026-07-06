"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";

import type { AiCanonicalFormState } from "../ai-actions";

type AiCanonicalFormProps = {
  action: (
    state: AiCanonicalFormState,
    formData: FormData,
  ) => Promise<AiCanonicalFormState>;
};

export function AiCanonicalForm({ action }: AiCanonicalFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(action, {
    ok: false,
    message: null,
  });

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border bg-card p-5 text-card-foreground sm:p-6">
      <div className="min-w-0 space-y-2">
        <p className="text-sm font-medium uppercase tracking-normal text-muted-foreground">
          AI canonical content
        </p>
        <h2 className="break-words text-2xl font-semibold leading-8">
          Generate a published revision
        </h2>
        <p className="max-w-full text-base leading-7 text-muted-foreground sm:max-w-3xl">
          Create or refresh the public article body. The new revision is saved
          with model, prompt version, response, context, and refresh metadata.
        </p>
      </div>

      <form
        ref={formRef}
        action={formAction}
        className="mt-5 grid min-w-0 max-w-full gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,18rem)]"
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
        <div className="grid min-w-0 gap-4">
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
              {state.ok && state.pageSlug ? (
                <a
                  href={`../${state.pageSlug}`}
                  className="ml-2 font-medium underline decoration-border underline-offset-4"
                >
                  View page
                </a>
              ) : null}
            </div>
          ) : null}

          <div className="grid min-w-0 gap-2">
            <label htmlFor="ai-canonical-title" className="text-sm font-medium">
              Page title or topic
            </label>
            <input
              id="ai-canonical-title"
              name="pageTitle"
              type="text"
              required
              minLength={3}
              placeholder="Mjolnir Recon 54"
              className="min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="grid min-w-0 gap-2">
            <label htmlFor="ai-canonical-slug" className="text-sm font-medium">
              Target slug
            </label>
            <input
              id="ai-canonical-slug"
              name="targetSlug"
              type="text"
              required
              placeholder="mjolnir-recon-54"
              autoComplete="off"
              spellCheck="false"
              className="min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="grid min-w-0 gap-2">
            <label htmlFor="ai-refresh-reason" className="text-sm font-medium">
              Refresh reason
            </label>
            <input
              id="ai-refresh-reason"
              name="refreshReason"
              type="text"
              placeholder="manual_refresh"
              autoComplete="off"
              className="min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        <div className="grid min-w-0 gap-3">
          <label htmlFor="ai-source-context" className="text-sm font-medium">
            Source or context notes
          </label>
          <textarea
            id="ai-source-context"
            name="sourceContext"
            rows={9}
            placeholder="Official source excerpts, editor constraints, or details that should guide this canonical revision."
            className="min-h-52 w-full min-w-0 resize-y rounded-md border border-input bg-background px-3 py-2 text-base leading-7 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      {status.pending ? "Generating..." : "Generate canonical revision"}
    </button>
  );
}

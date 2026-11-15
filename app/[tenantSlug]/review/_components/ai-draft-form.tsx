"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";

import type { AiDraftFormState } from "../ai-actions";
import { Input, Textarea } from "@/components/ui/input";

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
    <section className="min-w-0 overflow-hidden border bg-card p-5 text-card-foreground sm:p-6">
      <div className="min-w-0 space-y-2">
        <p className="text-label font-medium uppercase tracking-normal text-muted-foreground">
          AI assistance
        </p>
        <h2 className="break-words text-h2 font-semibold">
          Generate a draft suggestion
        </h2>
        <p className="max-w-full text-ui text-muted-foreground sm:max-w-3xl">
          Ask AI Gateway for a starting draft. The result is saved as a pending
          suggestion and still requires editorial approval before publication.
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
              className={`border p-4 text-ui ${
                state.ok
                  ? "border-border bg-muted text-foreground"
                  : "border-destructive/40 bg-destructive/10 text-foreground"
              }`}
              role="status"
              aria-live="polite"
            >
              {state.message}
            </div>
          ) : null}

          <div className="grid min-w-0 gap-2">
            <label htmlFor="ai-page-title" className="text-ui font-medium">
              Page title or topic
            </label>
            <Input
              id="ai-page-title"
              name="pageTitle"
              type="text"
              required
              minLength={3}
              placeholder="Overrun AR"
              />
          </div>

          <div className="grid min-w-0 gap-2">
            <label htmlFor="ai-target-slug" className="text-ui font-medium">
              Target slug
            </label>
            <Input
              id="ai-target-slug"
              name="targetSlug"
              type="text"
              required
              placeholder="overrun-ar"
              autoComplete="off"
              spellCheck="false"
              />
          </div>
        </div>

        <div className="grid min-w-0 gap-3">
          <label htmlFor="ai-source-notes" className="text-ui font-medium">
            Source or context notes
          </label>
          <Textarea
            id="ai-source-notes"
            name="sourceNotes"
            rows={7}
            placeholder="Official weapon notes, screenshots, or constraints editors should verify."
            className="min-h-40"
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
      className="inline-flex min-h-11 items-center justify-center border border-foreground bg-primary px-4 hover:bg-primary-hover dark:border-transparent text-ui font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
    >
      {status.pending ? "Generating..." : "Generate draft"}
    </button>
  );
}

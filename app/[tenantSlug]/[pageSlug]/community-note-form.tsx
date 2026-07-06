"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";

import type { CommunityNoteFormState } from "./community-note-actions";

type CommunityNoteFormProps = {
  action: (
    state: CommunityNoteFormState,
    formData: FormData,
  ) => Promise<CommunityNoteFormState>;
};

export function CommunityNoteForm({ action }: CommunityNoteFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(action, {
    ok: false,
    message: null,
  });

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-4"
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
      {state.message ? (
        <div
          className={`rounded-md border p-3 text-sm leading-6 ${
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

      <div className="grid gap-2 sm:grid-cols-[12rem_1fr]">
        <label htmlFor="community-note-type" className="text-sm font-medium">
          Note type
        </label>
        <select
          id="community-note-type"
          name="noteType"
          className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          defaultValue="general"
        >
          <option value="general">General note</option>
          <option value="correction">Correction</option>
          <option value="source">Source link</option>
          <option value="clarification">Clarification</option>
          <option value="dispute">Dispute</option>
        </select>
      </div>

      <div className="grid gap-2">
        <label htmlFor="community-note-target" className="text-sm font-medium">
          Relevant quote
        </label>
        <textarea
          id="community-note-target"
          name="targetQuote"
          rows={2}
          className="min-h-20 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-base leading-7 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="grid gap-2">
        <label htmlFor="community-note-body" className="text-sm font-medium">
          Community note
        </label>
        <textarea
          id="community-note-body"
          name="bodyMarkdown"
          rows={5}
          required
          minLength={20}
          className="min-h-36 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-base leading-7 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="grid gap-2">
        <label htmlFor="community-note-source" className="text-sm font-medium">
          Source URL
        </label>
        <input
          id="community-note-source"
          name="sourceUrl"
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="https://"
          className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const status = useFormStatus();

  return (
    <button
      type="submit"
      disabled={status.pending}
      className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-base font-medium text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-60"
    >
      {status.pending ? "Submitting..." : "Submit community note"}
    </button>
  );
}

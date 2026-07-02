"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";

import type { SuggestionFormState } from "../actions";

type SuggestionFormProps = {
  action: (
    state: SuggestionFormState,
    formData: FormData,
  ) => Promise<SuggestionFormState>;
  suggestionType: "new_page" | "edit_page";
  initialTitle?: string;
  initialSlug?: string;
  initialSummary?: string | null;
  initialBodyMarkdown?: string;
  submitLabel: string;
};

export function SuggestionForm({
  action,
  suggestionType,
  initialTitle = "",
  initialSlug = "",
  initialSummary = "",
  initialBodyMarkdown = "",
  submitLabel,
}: SuggestionFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(action, {
    ok: false,
    message: null,
  });

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-5"
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
      <input type="hidden" name="suggestionType" value={suggestionType} />

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
        <label htmlFor="suggestion-title" className="text-sm font-medium">
          Page title
        </label>
        <input
          id="suggestion-title"
          name="title"
          type="text"
          required
          minLength={3}
          defaultValue={initialTitle}
          spellCheck="true"
          className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="grid gap-2">
        <label htmlFor="suggestion-slug" className="text-sm font-medium">
          Page slug
        </label>
        <input
          id="suggestion-slug"
          name="targetSlug"
          type="text"
          required
          readOnly={suggestionType === "edit_page"}
          defaultValue={initialSlug}
          autoComplete="off"
          spellCheck="false"
          className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring read-only:bg-secondary"
        />
      </div>

      <div className="grid gap-2">
        <label htmlFor="suggestion-summary" className="text-sm font-medium">
          Summary
        </label>
        <textarea
          id="suggestion-summary"
          name="summary"
          rows={3}
          defaultValue={initialSummary ?? ""}
          className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-base leading-7 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="grid gap-2">
        <label htmlFor="suggestion-body" className="text-sm font-medium">
          Proposed page body
        </label>
        <textarea
          id="suggestion-body"
          name="bodyMarkdown"
          rows={16}
          required
          minLength={20}
          defaultValue={initialBodyMarkdown}
          className="min-h-80 w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-base leading-7 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="grid gap-2">
        <label htmlFor="suggestion-source" className="text-sm font-medium">
          Source URL
        </label>
        <input
          id="suggestion-source"
          name="sourceUrl"
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="https://"
          className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <SubmitButton label={submitLabel} />
    </form>
  );
}

function SubmitButton({ label }: { label: string }) {
  const status = useFormStatus();

  return (
    <button
      type="submit"
      disabled={status.pending}
      className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-base font-medium text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-60"
    >
      {status.pending ? "Submitting..." : label}
    </button>
  );
}

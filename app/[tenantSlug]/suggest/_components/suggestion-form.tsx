"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";

import type { SuggestionFormState } from "../actions";
import { Input, Textarea } from "@/components/ui/input";

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
  tenantSlug?: string;
};

export function SuggestionForm({
  action,
  suggestionType,
  initialTitle = "",
  initialSlug = "",
  initialSummary = "",
  initialBodyMarkdown = "",
  submitLabel,
  tenantSlug,
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
      data-wiki-event="suggestion_submit"
      data-wiki-event-label={suggestionType}
      data-wiki-tenant={tenantSlug}
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

      <div className="grid gap-2">
        <label htmlFor="suggestion-title" className="text-ui font-medium">
          Page title
        </label>
        <Input
          id="suggestion-title"
          name="title"
          type="text"
          required
          minLength={3}
          defaultValue={initialTitle}
          spellCheck="true"
        />
      </div>

      <div className="grid gap-2">
        <label htmlFor="suggestion-slug" className="text-ui font-medium">
          Page slug
        </label>
        <Input
          id="suggestion-slug"
          name="targetSlug"
          type="text"
          required
          readOnly={suggestionType === "edit_page"}
          defaultValue={initialSlug}
          autoComplete="off"
          spellCheck="false"
          className="read-only:bg-secondary"
        />
      </div>

      <div className="grid gap-2">
        <label htmlFor="suggestion-summary" className="text-ui font-medium">
          Summary
        </label>
        <Textarea
          id="suggestion-summary"
          name="summary"
          rows={3}
          defaultValue={initialSummary ?? ""}
        />
      </div>

      <div className="grid gap-2">
        <label htmlFor="suggestion-body" className="text-ui font-medium">
          Proposed page body
        </label>
        <Textarea
          id="suggestion-body"
          name="bodyMarkdown"
          rows={16}
          required
          minLength={20}
          defaultValue={initialBodyMarkdown}
          className="min-h-80 font-mono"
        />
      </div>

      <div className="grid gap-2">
        <label htmlFor="suggestion-source" className="text-ui font-medium">
          Source URL
        </label>
        <Input
          id="suggestion-source"
          name="sourceUrl"
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="https://"
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
      className="inline-flex min-h-11 items-center border border-foreground bg-primary px-4 hover:bg-primary-hover dark:border-transparent text-ui font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
    >
      {status.pending ? "Submitting..." : label}
    </button>
  );
}

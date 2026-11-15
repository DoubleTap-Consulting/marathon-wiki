"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import type { CommunityNoteFormState } from "./community-note-actions";
import { Input, Select, Textarea } from "@/components/ui/input";

type CommunityNoteFormProps = {
  action: (
    state: CommunityNoteFormState,
    formData: FormData,
  ) => Promise<CommunityNoteFormState>;
  onSubmitted?: () => void;
};

export function CommunityNoteForm({ action, onSubmitted }: CommunityNoteFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(action, {
    ok: false,
    message: null,
  });

  useEffect(() => {
    if (state.ok) onSubmitted?.();
  }, [state, onSubmitted]);

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
          className={`border p-3 text-ui ${
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
        <label htmlFor="community-note-body" className="text-ui font-medium">
          Community note
        </label>
        <Textarea
          id="community-note-body"
          name="bodyMarkdown"
          rows={5}
          required
          autoFocus
          minLength={20}
          className="min-h-36"
        />
      </div>

      <div className="grid gap-2">
        <label htmlFor="community-note-target" className="text-ui font-medium">
          Relevant quote
        </label>
        <Textarea
          id="community-note-target"
          name="targetQuote"
          rows={2}
          className="min-h-20"
        />
      </div>

      <div className="grid gap-2">
        <label htmlFor="community-note-source" className="text-ui font-medium">
          Source URL
        </label>
        <Input
          id="community-note-source"
          name="sourceUrl"
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="https://"
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-[12rem_1fr]">
        <label htmlFor="community-note-type" className="text-ui font-medium">
          Note type
        </label>
        <Select
          id="community-note-type"
          name="noteType"
          defaultValue="general"
        >
          <option value="general">General note</option>
          <option value="correction">Correction</option>
          <option value="source">Source link</option>
          <option value="clarification">Clarification</option>
          <option value="dispute">Dispute</option>
        </Select>
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
      className="inline-flex min-h-11 items-center border border-foreground bg-primary px-4 hover:bg-primary-hover dark:border-transparent text-ui font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
    >
      {status.pending ? "Sending..." : "Send note"}
    </button>
  );
}

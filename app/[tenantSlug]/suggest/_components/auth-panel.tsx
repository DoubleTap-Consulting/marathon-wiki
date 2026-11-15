import type { WikiActor } from "@/src/auth/wiki-auth";

import { ClerkSignInControl, ClerkUserControl } from "../../_components/auth-controls";

export function SuggestionAuthPanel({
  authMode,
}: {
  authMode: "clerk" | "dev" | "unconfigured";
}) {
  return (
    <section className="rounded-lg border bg-card p-6 text-card-foreground">
      <h1 className="text-title font-semibold">Sign in required</h1>
      <p className="mt-2 max-w-2xl text-ui text-muted-foreground">
        Suggestions are attributed to a signed-in user before they enter review.
      </p>
      <div className="mt-5">
        {authMode === "clerk" ? (
          <ClerkSignInControl>Sign in to suggest</ClerkSignInControl>
        ) : (
          <p className="text-small text-muted-foreground">
            Auth is not configured for this environment. Set Clerk keys for
            preview, or enable the documented local dev auth gate outside
            production.
          </p>
        )}
      </div>
    </section>
  );
}

export function SuggestionActorBar({
  actor,
  authMode,
}: {
  actor: WikiActor;
  authMode: "clerk" | "dev" | "unconfigured";
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground sm:flex-row sm:items-center sm:justify-between">
      <p className="text-small text-muted-foreground">
        Submitting as{" "}
        <span className="font-medium text-card-foreground">
          {actor.email ?? actor.name ?? actor.id}
        </span>
        .
      </p>
      {authMode === "clerk" ? <ClerkUserControl /> : null}
    </div>
  );
}

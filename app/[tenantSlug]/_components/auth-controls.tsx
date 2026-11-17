"use client";

import { UserButton, useClerk } from "@clerk/nextjs";

export function ClerkSignInControl({
  children,
  redirectUrl,
}: {
  children: React.ReactNode;
  redirectUrl?: string;
}) {
  const clerk = useClerk();

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <button
        type="button"
        className="inline-flex min-h-11 items-center justify-center border border-foreground bg-primary px-4 hover:bg-primary-hover dark:border-transparent text-ui font-medium text-primary-foreground"
        onClick={() =>
          clerk.openSignIn(
            redirectUrl
              ? { forceRedirectUrl: redirectUrl, fallbackRedirectUrl: redirectUrl }
              : undefined,
          )
        }
      >
        {children}
      </button>
      <button
        type="button"
        className="inline-flex min-h-11 items-center justify-center border bg-background px-4 text-ui font-medium text-foreground"
        onClick={() =>
          clerk.openSignUp(
            redirectUrl
              ? { forceRedirectUrl: redirectUrl, fallbackRedirectUrl: redirectUrl }
              : undefined,
          )
        }
      >
        Create account
      </button>
    </div>
  );
}

export function ClerkUserControl() {
  return (
    <div className="flex min-h-11 items-center">
      <UserButton />
    </div>
  );
}

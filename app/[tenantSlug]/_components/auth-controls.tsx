"use client";

import { SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

export function ClerkSignInControl({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <SignInButton mode="modal">
        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-base font-medium text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          {children}
        </button>
      </SignInButton>
      <SignUpButton mode="modal">
        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center rounded-md border bg-background px-4 text-base font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          Create account
        </button>
      </SignUpButton>
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

"use client";

import { SignInButton, UserButton } from "@clerk/nextjs";

export function ClerkSignInControl({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SignInButton mode="modal">
      <button
        type="button"
        className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-base font-medium text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
      >
        {children}
      </button>
    </SignInButton>
  );
}

export function ClerkUserControl() {
  return (
    <div className="flex min-h-11 items-center">
      <UserButton />
    </div>
  );
}

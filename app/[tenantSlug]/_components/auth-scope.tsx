import { ClerkProvider } from "@clerk/nextjs";

import { isClerkConfigured } from "@/src/auth/wiki-auth";

// Clerk's client bundle only ships on routes that sign people in or out
// (review, suggest, sign-in, sign-out). Reading pages never render a Clerk
// control, so they do not download clerk-js. The header menu uses a plain
// Sign in link and a server action for the signed-in state.
export function AuthScope({ children }: { children: React.ReactNode }) {
  return isClerkConfigured() ? <ClerkProvider>{children}</ClerkProvider> : <>{children}</>;
}

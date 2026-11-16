import { ClerkProvider } from "@clerk/nextjs";

import { isClerkConfigured } from "@/src/auth/wiki-auth";

// Clerk's client bundle only ships on the routes that sign people in (review, suggest).
// Reading pages never render a Clerk control, so they no longer download it.
export function AuthScope({ children }: { children: React.ReactNode }) {
  return isClerkConfigured() ? <ClerkProvider>{children}</ClerkProvider> : <>{children}</>;
}

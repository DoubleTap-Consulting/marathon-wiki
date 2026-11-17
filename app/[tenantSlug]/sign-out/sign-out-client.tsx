"use client";

import { useClerk } from "@clerk/nextjs";
import { useEffect } from "react";

export function SignOutClient({ redirectTo }: { redirectTo: string }) {
  const clerk = useClerk();

  useEffect(() => {
    void clerk.signOut({ redirectUrl: redirectTo });
  }, [clerk, redirectTo]);

  return (
    <p className="text-ui text-muted-foreground" role="status">
      Signing out…
    </p>
  );
}

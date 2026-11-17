"use client";

import { useEffect, useState } from "react";

import { shouldShowFooterReview, type WikiNavAuth } from "@/src/auth/wiki-nav";

import { getWikiNavAuthAction } from "./nav-auth";

/** Same editor check as the menu. Uses a server action, not clerk-js. */
export function FooterReviewLink({ href }: { href: string }) {
  const [auth, setAuth] = useState<WikiNavAuth | null>(null);

  useEffect(() => {
    getWikiNavAuthAction().then(setAuth, () => setAuth({ status: "signed_out" }));
  }, []);

  if (!shouldShowFooterReview(auth)) return null;

  return (
    <li>
      <a href={href} className="inline-flex min-h-6 items-center underline-offset-3 hover:underline pointer-coarse:min-h-11 pointer-coarse:min-w-11">
        Review
      </a>
    </li>
  );
}

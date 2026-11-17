import type { Metadata, Route } from "next";
import { notFound, redirect } from "next/navigation";

import { getAuthMode, getCurrentWikiActor } from "@/src/auth/wiki-auth";
import { safeInternalPath } from "@/src/auth/wiki-nav";
import { getWikiHomeSnapshot } from "@/src/db/wiki";
import { composeWikiTitle } from "@/src/wiki/metadata";
import { normalizeTenantSlug } from "@/src/wiki/tenant-routing";

import { ClerkSignInControl } from "../_components/auth-controls";
import { WikiChrome } from "../_components/wiki-chrome";

export const dynamic = "force-dynamic";

type SignInPageProps = {
  params: Promise<{
    tenantSlug: string;
  }>;
  searchParams: Promise<{
    redirect?: string;
  }>;
};

export async function generateMetadata({
  params,
}: SignInPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const snapshot = await getWikiHomeSnapshot(normalizeTenantSlug(tenantSlug));

  return {
    title: snapshot ? { absolute: composeWikiTitle("Sign in", snapshot.tenant.name) } : "Wiki not found",
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function SignInPage({ params, searchParams }: SignInPageProps) {
  const { tenantSlug } = await params;
  const { redirect: redirectParam } = await searchParams;
  const snapshot = await getWikiHomeSnapshot(normalizeTenantSlug(tenantSlug));

  if (!snapshot) {
    notFound();
  }

  const fallback = `/${snapshot.tenant.slug}`;
  const redirectUrl = safeInternalPath(redirectParam, fallback);
  const authMode = getAuthMode();
  const actor = authMode === "clerk" ? await getCurrentWikiActor() : null;

  if (actor) {
    redirect(redirectUrl as Route);
  }

  return (
    <WikiChrome tenant={snapshot.tenant} categories={snapshot.categories}>
      <section className="mx-auto max-w-3xl">
        <div className="border bg-card p-6 text-card-foreground">
          <h1 className="text-title font-display">Sign in</h1>
          <p className="mt-2 max-w-2xl text-ui text-muted-foreground">
            Create an account to suggest edits. New accounts can suggest changes;
            only allowlisted editors can publish them.
          </p>
          <div className="mt-5">
            {authMode === "clerk" ? (
              <ClerkSignInControl redirectUrl={redirectUrl}>Sign in</ClerkSignInControl>
            ) : (
              <p className="text-small text-muted-foreground">
                Auth is not configured for this environment. Set Clerk keys for
                preview, or enable the documented local dev auth gate outside
                production.
              </p>
            )}
          </div>
        </div>
      </section>
    </WikiChrome>
  );
}

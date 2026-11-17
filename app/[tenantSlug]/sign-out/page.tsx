import type { Metadata, Route } from "next";
import { notFound, redirect } from "next/navigation";

import { getAuthMode } from "@/src/auth/wiki-auth";
import { safeInternalPath } from "@/src/auth/wiki-nav";
import { getWikiHomeSnapshot } from "@/src/db/wiki";
import { composeWikiTitle } from "@/src/wiki/metadata";
import { normalizeTenantSlug } from "@/src/wiki/tenant-routing";

import { WikiChrome } from "../_components/wiki-chrome";
import { SignOutClient } from "./sign-out-client";

export const dynamic = "force-dynamic";

type SignOutPageProps = {
  params: Promise<{
    tenantSlug: string;
  }>;
  searchParams: Promise<{
    redirect?: string;
  }>;
};

export async function generateMetadata({
  params,
}: SignOutPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const snapshot = await getWikiHomeSnapshot(normalizeTenantSlug(tenantSlug));

  return {
    title: snapshot ? { absolute: composeWikiTitle("Sign out", snapshot.tenant.name) } : "Wiki not found",
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function SignOutPage({ params, searchParams }: SignOutPageProps) {
  const { tenantSlug } = await params;
  const { redirect: redirectParam } = await searchParams;
  const snapshot = await getWikiHomeSnapshot(normalizeTenantSlug(tenantSlug));

  if (!snapshot) {
    notFound();
  }

  const fallback = `/${snapshot.tenant.slug}`;
  const redirectTo = safeInternalPath(redirectParam, fallback);

  if (getAuthMode() !== "clerk") {
    redirect(redirectTo as Route);
  }

  return (
    <WikiChrome tenant={snapshot.tenant} categories={snapshot.categories}>
      <section className="mx-auto max-w-3xl">
        <div className="border bg-card p-6 text-card-foreground">
          <h1 className="text-title font-display">Sign out</h1>
          <div className="mt-3">
            <SignOutClient redirectTo={redirectTo} />
          </div>
        </div>
      </section>
    </WikiChrome>
  );
}

"use client";

import { useParams } from "next/navigation";

import { StatusBlock, primaryAction, secondaryAction } from "./_components/index-ui";
import { SiteFooter } from "./_components/site-footer";

/**
 * A route that failed to render: the 404 composition with a retry. It renders on the client, so the footer
 * has no category links and no network slot (both come from the server); the notice and core links stay.
 */
export default function TenantError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const params = useParams<{ tenantSlug?: string }>();
  const tenantSlug = params.tenantSlug ?? "marathon";
  return (
    <>
      <main id="main" className="min-h-screen bg-background px-5">
        <StatusBlock
          themeSlug={tenantSlug}
          label="Error"
          title="This page didn't load"
          actions={
            <>
              <button type="button" onClick={reset} className={primaryAction}>
                Try again
              </button>
              <a href={`/${tenantSlug}`} className={secondaryAction}>
                Go to wiki home
              </a>
            </>
          }
        >
          <p>Something went wrong on our side while loading it. Trying again usually works.</p>
        </StatusBlock>
      </main>
      <SiteFooter tenant={{ slug: tenantSlug, gameTitle: "Marathon" }} categories={[]} brand={null} />
    </>
  );
}

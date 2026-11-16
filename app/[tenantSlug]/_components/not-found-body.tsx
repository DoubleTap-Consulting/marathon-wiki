import type { Route } from "next";
import Link from "next/link";

import { CurrentPath } from "./current-path";
import { StatusBlock, primaryAction, secondaryAction, textAction } from "./index-ui";

export function NotFoundBody({ tenantSlug }: { tenantSlug: string }) {
  return (
    <StatusBlock
      themeSlug={tenantSlug}
      label="Not found · 404"
      title="No page here yet"
      actions={
        <>
          <Link href={`/${tenantSlug}/search` as Route} className={primaryAction}>
            Search pages
          </Link>
          <Link href={`/${tenantSlug}` as Route} className={secondaryAction}>
            Go to wiki home
          </Link>
          <Link href={`/${tenantSlug}/suggest` as Route} className={textAction}>
            Suggest this page →
          </Link>
        </>
      }
    >
      <p>
        Nothing at <CurrentPath />. It may have moved, or nobody has written it.
      </p>
    </StatusBlock>
  );
}

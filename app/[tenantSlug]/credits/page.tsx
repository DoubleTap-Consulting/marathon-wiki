import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CreditLine, FigureBand } from "@/components/figure";
import { licenseInfo } from "@/content/imagery-schema";
import { getCachedWikiHome } from "@/src/wiki/cache";
import { imagesFor, showsImageGaps } from "@/src/wiki/imagery";
import { buildWikiMetadata } from "@/src/wiki/metadata";
import { normalizeTenantSlug } from "@/src/wiki/tenant-routing";

import { WikiChrome } from "../_components/wiki-chrome";

export const revalidate = 300;
export const dynamic = "force-static";

type Props = { params: Promise<{ tenantSlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenantSlug } = await params;
  const snapshot = await getCachedWikiHome(normalizeTenantSlug(tenantSlug));
  if (!snapshot) notFound();
  return buildWikiMetadata({
    title: "Image credits",
    description: "Sources, licenses and modifications for every image on this wiki.",
    path: `/${snapshot.tenant.slug}/credits`,
    siteName: snapshot.tenant.name,
  });
}

export default async function ImageCredits({ params }: Props) {
  const { tenantSlug } = await params;
  const snapshot = await getCachedWikiHome(normalizeTenantSlug(tenantSlug));
  if (!snapshot) notFound();
  const { tenant, categories } = snapshot;
  const images = imagesFor(tenant.slug);

  return (
    <WikiChrome tenant={tenant} categories={categories}>
      <h1 className="text-title font-display text-foreground">Image credits</h1>
      <p className="mt-4 max-w-[68ch] text-body text-muted-foreground">
        Atmosphere images show real space or artists’ illustrations of real worlds, not the game.
        Diagrams are our own work, drawn from the sources in each page’s Chart data table. No image implies endorsement.
      </p>
      <div className="mt-8 max-w-[68ch] divide-y border-t">
        {images.map((image) => (
          <section key={image.id} id={image.id} className="py-6">
            <h2 className="text-h2 font-semibold text-foreground">{image.title}</h2>
            {image.tier === "C" ? (
              <FigureBand image={image} slot="hub-band" className="mt-4" priority={false} />
            ) : (
              <p className="mt-3 text-small text-muted-foreground"><CreditLine image={image} /></p>
            )}
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-small">
              <dt className="text-muted-foreground">Source</dt>
              <dd><a href={image.sourceUrl} className="text-link underline underline-offset-3">{image.sourceUrl}</a></dd>
              <dt className="text-muted-foreground">Credit</dt><dd>{image.credit}</dd>
              <dt className="text-muted-foreground">License</dt>
              <dd><a href={image.licenseUrl} className="text-link underline underline-offset-3">{licenseInfo[image.license].short}</a></dd>
              <dt className="text-muted-foreground">Retrieved</dt><dd>{image.retrievedAt}</dd>
              <dt className="text-muted-foreground">Modifications</dt><dd>{image.modifications ?? "None"}</dd>
              <dt className="text-muted-foreground">Used on</dt>
              <dd>{image.usedOn.map((use) => <a key={`${use.page}/${use.slot}`} href={`/${tenant.slug}${use.page === "home" ? "" : `/${use.page}`}`} className="mr-3 text-link underline underline-offset-3">{use.page === "home" ? "Home" : use.page}</a>)}</dd>
              {showsImageGaps() && image.captionAuthor === "pending-human" ? (
                <><dt className="text-muted-foreground">Review</dt><dd>Caption and alt text pending a human writer; factual source labels only.</dd></>
              ) : null}
            </dl>
          </section>
        ))}
      </div>
    </WikiChrome>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CreditLine } from "@/components/figure";
import { licenseInfo, type ArtRecord } from "@/content/imagery-schema";
import { getCachedWikiHome } from "@/src/wiki/cache";
import { imagesFor, publicPath, renditionFor, type ArtImage } from "@/src/wiki/imagery";
import { buildWikiMetadata } from "@/src/wiki/metadata";
import { normalizeTenantSlug } from "@/src/wiki/tenant-routing";

import { WikiChrome } from "../_components/wiki-chrome";

export const revalidate = 300;
export const dynamic = "force-static";

type Props = { params: Promise<{ tenantSlug: string }> };

const FAMILIES: Record<ArtRecord["family"], { title: string; blurb: string }> = {
  "nasa-ames-colonies": {
    title: "NASA Ames space colony paintings, 1975–76",
    blurb: "Painted by Don Davis and Rick Guidice for NASA Ames Research Center’s space settlement studies.",
  },
  "trouvelot-1881": {
    title: "E. L. Trouvelot’s astronomical drawings, 1881",
    blurb: "Chromolithographs from The Trouvelot Astronomical Drawings, held by the NYPL Rare Book Division.",
  },
  "homer-tropics": {
    title: "Winslow Homer’s Florida and Caribbean paintings, 1898–1903",
    blurb: "Watercolors and an oil Homer made on winter trips to Key West and the Bahamas, from The Met’s Open Access collection.",
  },
  "highsmith-florida": {
    title: "Carol M. Highsmith’s photographs of Florida",
    blurb: "Color photographs of South Florida places from the Carol M. Highsmith Archive at the Library of Congress. Each item is linked below with its LoC record and rights line.",
  },
};

const LINK = "text-link underline underline-offset-3";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenantSlug } = await params;
  const snapshot = await getCachedWikiHome(normalizeTenantSlug(tenantSlug));
  if (!snapshot) notFound();
  return buildWikiMetadata({
    title: "Art and image credits",
    description: "The public-domain paintings behind every page, and the sources of our diagrams.",
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
  const paintings = images.filter((image): image is ArtImage => Boolean(image.art));
  const diagrams = images.filter((image) => !image.art);
  const families = (Object.keys(FAMILIES) as ArtRecord["family"][]).filter((family) => paintings.some((image) => image.art.family === family));

  return (
    <WikiChrome tenant={tenant} categories={categories}>
      <h1 className="text-title font-display text-foreground">Art and image credits</h1>
      <p className="mt-4 max-w-[68ch] text-body text-muted-foreground">
        The pictures behind our pages come from a house collection of public-domain works. They set the mood;
        they don’t show the game, and no image implies endorsement. Public-domain works need no credit, but the
        artists made them, so we name them. Diagrams are our own work, drawn from each page’s sources.
      </p>

      {families.map((family) => (
        <section key={family} aria-labelledby={`family-${family}`} className="mt-10">
          <h2 id={`family-${family}`} className="text-h2 font-semibold text-foreground">{FAMILIES[family].title}</h2>
          <p className="mt-2 max-w-[68ch] text-small text-muted-foreground">{FAMILIES[family].blurb}</p>
          <div className="mt-4 divide-y border-t">
            {paintings.filter((image) => image.art.family === family).map((image) => (
              <Painting key={image.id} image={image} tenantSlug={tenant.slug} />
            ))}
          </div>
        </section>
      ))}

      {diagrams.length > 0 ? (
        <section aria-labelledby="diagrams" className="mt-10">
          <h2 id="diagrams" className="text-h2 font-semibold text-foreground">Diagrams</h2>
          <div className="mt-4 max-w-[68ch] divide-y border-t">
            {diagrams.map((image) => (
              <section key={image.id} id={image.id} className="py-6">
                <h3 className="text-h3 font-semibold text-foreground">{image.title}</h3>
                <p className="mt-3 text-small text-muted-foreground"><CreditLine image={image} /></p>
              </section>
            ))}
          </div>
        </section>
      ) : null}
    </WikiChrome>
  );
}

function Painting({ image, tenantSlug }: { image: ArtImage; tenantSlug: string }) {
  const avif = renditionFor(image.art.renditions, "full", "avif", 640);
  const webp = renditionFor(image.art.renditions, "full", "webp", 640);
  const nypl = image.art.institution === "NYPL";
  return (
    <section id={image.id} className="grid scroll-mt-20 gap-4 py-6 sm:grid-cols-[240px_minmax(0,1fr)] sm:gap-6">
      {webp ? (
        <picture>
          {avif ? <source type="image/avif" srcSet={`${publicPath(avif.file)} 640w`} sizes="(min-width: 640px) 240px, 100vw" /> : null}
          {/* eslint-disable-next-line @next/next/no-img-element -- pre-encoded renditions */}
          <img
            src={publicPath(webp.file)}
            alt={image.alt}
            width={webp.width}
            height={webp.height}
            loading="lazy"
            decoding="async"
            className="h-auto w-full"
            style={{ backgroundColor: image.art.dominant }}
          />
        </picture>
      ) : null}
      <div className="min-w-0">
        <h3 className="text-h3 font-semibold text-foreground">{image.title}</h3>
        <p className="mt-1 text-small text-muted-foreground">
          {image.author}, {image.art.year} · {image.art.medium === "photograph" ? "Photograph" : image.art.medium === "painting" ? "Painting" : "Chromolithograph"}
        </p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-small">
          <dt className="text-muted-foreground">Source</dt>
          <dd className="min-w-0 break-words"><a href={image.sourceUrl} className={LINK}>{image.sourceUrl}</a></dd>
          <dt className="text-muted-foreground">Credit</dt>
          <dd>{nypl ? <a href={image.sourceUrl} className={LINK}>{image.credit}</a> : image.credit}</dd>
          <dt className="text-muted-foreground">Rights</dt>
          <dd>
            <a href={image.licenseUrl} className={LINK}>{licenseInfo[image.license].short}</a>. {image.art.rightsBasis}
          </dd>
          <dt className="text-muted-foreground">Changes</dt><dd>{image.modifications ?? "None"}</dd>
          <dt className="text-muted-foreground">Used on</dt>
          <dd>
            {image.usedOn.map((use) => (
              <a key={`${use.page}/${use.slot}`} href={`/${tenantSlug}${use.page === "home" ? "" : `/${use.page}`}`} className={`mr-3 ${LINK}`}>
                {use.page === "home" ? "Home" : use.page.replace(/^categories\//, "").replace(/^./, (c) => c.toUpperCase())}
              </a>
            ))}
            {image.usedOn.some((use) => use.slot === "hub-band") ? <span className="text-muted-foreground">and its articles</span> : null}
          </dd>
        </dl>
      </div>
    </section>
  );
}

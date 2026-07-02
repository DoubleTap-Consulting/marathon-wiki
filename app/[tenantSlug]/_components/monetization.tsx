import Script from "next/script";

import {
  getWikiAdsConfig,
  getWikiPremiumConfig,
  type WikiAdPlacement,
} from "@/src/wiki/launch-config";

export function WikiAdSlot({
  placement,
  tenantSlug,
  pageSlug,
  className = "",
}: {
  placement: WikiAdPlacement;
  tenantSlug: string;
  pageSlug?: string;
  className?: string;
}) {
  const config = getWikiAdsConfig();
  const slot = config?.slots.find((candidate) => candidate.placement === placement);

  if (!config || !slot) {
    return null;
  }

  return (
    <aside
      className={`rounded-lg border border-dashed bg-card p-4 text-card-foreground ${className}`}
      style={{ minHeight: slot.minHeight }}
      aria-label="Advertisement"
      data-wiki-event="ad_slot_view"
      data-wiki-event-label={placement}
      data-wiki-tenant={tenantSlug}
      data-wiki-page={pageSlug}
    >
      <p className="mb-3 text-xs font-medium uppercase tracking-normal text-muted-foreground">
        Advertisement
      </p>
      <ins
        className="adsbygoogle block"
        data-ad-client={config.clientId}
        data-ad-slot={slot.slotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
      <Script
        id="wiki-adsense-loader"
        async
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(
          config.clientId,
        )}`}
        crossOrigin="anonymous"
        strategy="afterInteractive"
      />
      <Script id={`wiki-adsense-push-${placement}`} strategy="afterInteractive">
        {`try{(window.adsbygoogle=window.adsbygoogle||[]).push({});}catch(error){}`}
      </Script>
    </aside>
  );
}

export function WikiPremiumHook({
  tenantSlug,
  pageSlug,
}: {
  tenantSlug: string;
  pageSlug?: string;
}) {
  const premium = getWikiPremiumConfig();

  if (!premium) {
    return null;
  }

  return (
    <section className="rounded-lg border bg-card p-5 text-card-foreground">
      <h2 className="text-lg font-semibold leading-7">{premium.label}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {premium.description}
      </p>
      <a
        href={premium.url}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        data-wiki-event="premium_cta"
        data-wiki-event-label="sidebar"
        data-wiki-tenant={tenantSlug}
        data-wiki-page={pageSlug}
      >
        {premium.label}
      </a>
    </section>
  );
}

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
      className={` border border-dashed bg-card p-4 text-card-foreground ${className}`}
      style={{ minHeight: slot.minHeight }}
      aria-label="Advertisement"
      data-wiki-event="ad_slot_view"
      data-wiki-event-label={placement}
      data-wiki-tenant={tenantSlug}
      data-wiki-page={pageSlug}
    >
      <p className="mb-3 text-label font-medium uppercase tracking-normal text-muted-foreground">
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
    <section className="border bg-card p-5 text-card-foreground">
      <h2 className="text-h3 font-semibold">{premium.label}</h2>
      <p className="mt-2 text-small text-muted-foreground">
        {premium.description}
      </p>
      <a
        href={premium.url}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center border border-foreground bg-primary px-4 hover:bg-primary-hover dark:border-transparent text-ui font-medium text-primary-foreground"
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

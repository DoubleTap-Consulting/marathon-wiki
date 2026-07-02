"use client";

import { useEffect } from "react";

type AnalyticsDataset = {
  wikiEvent?: string;
  wikiEventLabel?: string;
  wikiEventValue?: string;
  wikiTenant?: string;
  wikiPage?: string;
};

export function WikiAnalytics({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    sendWikiEvent({
      type: "page_view",
      path: window.location.pathname + window.location.search,
      label: document.title,
      clientTimestamp: new Date().toISOString(),
    });

    const onClick = (event: MouseEvent) => {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      const source = target.closest<HTMLElement>("[data-wiki-event]");

      if (!source || source.dataset.wikiEvent === "ad_slot_view") {
        return;
      }

      sendDatasetEvent(source.dataset);
    };

    const onSubmit = (event: SubmitEvent) => {
      const form = event.target;

      if (!(form instanceof HTMLFormElement) || !form.dataset.wikiEvent) {
        return;
      }

      const formData = new FormData(form);
      const query = formData.get("q");
      sendDatasetEvent({
        ...form.dataset,
        wikiEventValue: typeof query === "string" ? query : undefined,
      });
    };

    const observer =
      "IntersectionObserver" in window
        ? new IntersectionObserver(
            (entries, currentObserver) => {
              for (const entry of entries) {
                if (!entry.isIntersecting) {
                  continue;
                }

                const target = entry.target;

                if (target instanceof HTMLElement) {
                  sendDatasetEvent(target.dataset);
                  currentObserver.unobserve(target);
                }
              }
            },
            { threshold: 0.4 },
          )
        : null;

    document
      .querySelectorAll<HTMLElement>("[data-wiki-event='ad_slot_view']")
      .forEach((slot) => observer?.observe(slot));

    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);

    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit);
      observer?.disconnect();
    };
  }, [enabled]);

  return null;
}

function sendDatasetEvent(dataset: AnalyticsDataset) {
  if (!dataset.wikiEvent) {
    return;
  }

  sendWikiEvent({
    type: dataset.wikiEvent,
    path: window.location.pathname + window.location.search,
    tenantSlug: dataset.wikiTenant,
    pageSlug: dataset.wikiPage,
    label: dataset.wikiEventLabel,
    value: dataset.wikiEventValue,
    clientTimestamp: new Date().toISOString(),
  });
}

function sendWikiEvent(payload: Record<string, string | undefined>) {
  const body = JSON.stringify(payload);

  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/wiki/events", new Blob([body], {
      type: "application/json",
    }));
    return;
  }

  void fetch("/api/wiki/events", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
    },
    keepalive: true,
  });
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";

import { applyScheme } from "@/app/_components/scheme";
import { SchemeSync } from "@/app/_components/scheme-sync";
import { WikiAnalytics } from "@/app/_components/wiki-analytics";
import { isWikiAnalyticsEnabled } from "@/src/analytics/wiki-events";
import { getWikiSiteBaseUrl } from "@/src/wiki/launch-config";
import { networkBrand } from "@/src/wiki/network";
import { themeFor } from "@/themes/registry";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// The Marathon manifest's display face (themes/marathon/theme.ts: Archivo, wdth 125, weights 700 and 800).
// The file is Google Fonts' own latin instance of Archivo at wdth 125, wght 700..800
// (fonts.googleapis.com/css2?family=Archivo:wdth,wght@125,700..800), self-hosted: 35 KB instead of the
// 90 KB full-axis file next/font/google serves, with the same outlines at the values the theme uses.
// OFL: app/_fonts/ARCHIVO-OFL.txt.
const displayFace = localFont({
  src: "./_fonts/archivo-wdth125-wght700-800-latin.woff2",
  variable: "--font-display-face",
  weight: "700 800",
  style: "normal",
  display: "swap",
  adjustFontFallback: "Arial",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const THEME = "marathon";
const brand = networkBrand();
const siteTitle = brand ? `${themeFor(THEME).identity.descriptor} · ${brand.name}` : "Marathon Wiki";

export const metadata: Metadata = {
  metadataBase: getWikiSiteBaseUrl(),
  title: {
    default: siteTitle,
    template: brand ? `%s · ${brand.name}` : "%s | Marathon Wiki",
  },
  description:
    "Fast, source-backed Marathon wiki pages built for clean reading, ISR performance, and community suggestions.",
  applicationName: brand?.name ?? "Marathon Wiki",
  openGraph: {
    type: "website",
    siteName: brand?.name ?? "Marathon Wiki",
    title: siteTitle,
    description:
      "Fast, source-backed Marathon wiki pages built for clean reading and community suggestions.",
  },
  twitter: {
    card: "summary",
    title: siteTitle,
    description:
      "Fast, source-backed Marathon wiki pages built for clean reading and community suggestions.",
  },
  robots: {
    index: true,
    follow: true,
  },
};


// Runs before first paint so a saved scheme never flashes the system one. Pages stay static (ISR),
// which reading the cookie on the server would break.
const SCHEME_SCRIPT = `(${applyScheme.toString()})(${JSON.stringify(THEME)})`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme={THEME}
      className={`${geistSans.variable} ${geistMono.variable} ${displayFace.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCHEME_SCRIPT }} />
      </head>
      <body>
        {children}
        <WikiAnalytics enabled={isWikiAnalyticsEnabled()} />
        <SchemeSync theme={THEME} />
      </body>
    </html>
  );
}

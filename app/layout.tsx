import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";

import { WikiAnalytics } from "@/app/_components/wiki-analytics";
import { isWikiAnalyticsEnabled } from "@/src/analytics/wiki-events";
import { isClerkConfigured } from "@/src/auth/wiki-auth";
import { getWikiSiteBaseUrl } from "@/src/wiki/launch-config";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: getWikiSiteBaseUrl(),
  title: {
    default: "Marathon Wiki",
    template: "%s | Marathon Wiki",
  },
  description:
    "Fast, source-backed Marathon wiki pages built for clean reading, ISR performance, and community suggestions.",
  applicationName: "Marathon Wiki",
  openGraph: {
    type: "website",
    siteName: "Marathon Wiki",
    title: "Marathon Wiki",
    description:
      "Fast, source-backed Marathon wiki pages built for clean reading and community suggestions.",
  },
  twitter: {
    card: "summary",
    title: "Marathon Wiki",
    description:
      "Fast, source-backed Marathon wiki pages built for clean reading and community suggestions.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const body = (
    <body>
      {children}
      <WikiAnalytics enabled={isWikiAnalyticsEnabled()} />
    </body>
  );

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      {isClerkConfigured() ? <ClerkProvider>{body}</ClerkProvider> : body}
    </html>
  );
}

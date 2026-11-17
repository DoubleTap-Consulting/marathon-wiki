import { notFound } from "next/navigation";

import { applyScheme } from "@/app/_components/scheme";
import { SchemeSync } from "@/app/_components/scheme-sync";
import { isTenantPubliclyEnabled, normalizeTenantSlug } from "@/src/wiki/tenant-routing";
import { themeFor } from "@/themes/registry";

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const slug = normalizeTenantSlug(tenantSlug);
  if (!isTenantPubliclyEnabled(slug)) notFound();
  const theme = themeFor(slug);
  const applyTenantTheme = `(${applyScheme.toString()})(${JSON.stringify(theme.slug)})`;

  return (
    <div data-theme={theme.slug} className="min-h-screen bg-background text-foreground">
      <script dangerouslySetInnerHTML={{ __html: applyTenantTheme }} />
      <SchemeSync theme={theme.slug} />
      {children}
    </div>
  );
}

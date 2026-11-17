import { cn } from "@/lib/utils";
import { LEGAL_CONTACT_EMAIL, legalNav } from "@/src/wiki/legal";
import { networkBrand } from "@/src/wiki/network";
import { themeFor } from "@/themes/registry";

import { SchemeToggle } from "@/app/_components/scheme-toggle";
import { chromeProps } from "@/app/[tenantSlug]/_components/site-footer";

const NETWORK_THEME = "marathon";

export function NetworkChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  const brand = networkBrand();
  const name = brand?.name ?? "WikiDen";
  const chrome = chromeProps(NETWORK_THEME, themeFor(NETWORK_THEME).chrome);

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main"
        className="sr-only z-50 border border-foreground bg-primary px-4 hover:bg-primary-hover dark:border-transparent py-2 text-ui font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-2"
      >
        Skip to content
      </a>
      <header {...chrome} className={cn(chrome.className, "sticky top-0 z-30 h-[59px] border-b-3 border-brand bg-background/95 backdrop-blur-md")}>
        <div className="mx-auto flex h-full w-full max-w-6xl items-center gap-4 px-5 sm:px-6 lg:px-8">
          <a href="/" className="flex min-h-11 min-w-0 flex-col justify-center text-foreground">
            <span className="self-start font-display text-ui leading-none font-extrabold uppercase whitespace-nowrap sm:text-h3 sm:leading-none">
              {name}
            </span>
          </a>
          <div className="ml-auto">
            <SchemeToggle />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-6 lg:px-8">
        {children}
      </main>

      <NetworkFooter />
    </div>
  );
}

export function NetworkFooter() {
  const brand = networkBrand();
  const name = brand?.name ?? "WikiDen";
  const chrome = chromeProps(NETWORK_THEME, themeFor(NETWORK_THEME).chrome);
  const links = [{ href: "/", label: "Home" }, ...legalNav];

  return (
    <footer {...chrome} className={cn(chrome.className, "border-t bg-background")}>
      <div className="mx-auto w-full max-w-6xl space-y-6 px-5 py-10 sm:px-6 lg:px-8">
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-5 text-ui">
            {links.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="inline-flex min-h-6 items-center underline-offset-3 hover:underline pointer-coarse:min-h-11 pointer-coarse:min-w-11">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="border-t pt-6">
          <p className="max-w-[68ch] text-small text-muted-foreground">
            {name} is an unofficial fan wiki network. Not affiliated with or endorsed by Bungie or other publishers.
            Trademarks belong to their owners. Contact{" "}
            <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-link underline underline-offset-3">
              {LEGAL_CONTACT_EMAIL}
            </a>
            .
          </p>
        </div>
      </div>
    </footer>
  );
}

export function LegalDocument({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <NetworkChrome>
      <article className="max-w-[68ch]">
        <h1 className="text-title font-display text-foreground">{title}</h1>
        {children}
      </article>
    </NetworkChrome>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-h2 font-semibold text-foreground">{title}</h2>
      <div className="mt-3 space-y-3 text-body text-foreground">{children}</div>
    </section>
  );
}

export function LegalEmail() {
  return (
    <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-link underline underline-offset-3">
      {LEGAL_CONTACT_EMAIL}
    </a>
  );
}

export function LegalLead({ children }: { children: string }) {
  return (
    <strong className="font-semibold">
      {children}
      {" "}
    </strong>
  );
}

import type { Metadata } from "next";

import { LegalDocument, LegalEmail, LegalSection } from "@/app/_components/network-chrome";
import { LEGAL_EFFECTIVE_DATE } from "@/src/wiki/legal";
import { buildWikiMetadata } from "@/src/wiki/metadata";
import { networkBrand } from "@/src/wiki/network";

export const dynamic = "force-static";

const TITLE = "Terms of service";
const DESCRIPTION =
  "The terms for using WikiDen, including the unofficial fan-site disclaimer, contribution license, and acceptable use.";

export const metadata: Metadata = buildWikiMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: "/terms",
  siteName: networkBrand()?.name ?? "WikiDen",
});

export default function TermsPage() {
  return (
    <LegalDocument title={TITLE}>
      <p className="mt-3 text-small text-muted-foreground">Effective {LEGAL_EFFECTIVE_DATE}</p>
      <p className="mt-6 text-body text-foreground">
        These terms govern your use of WikiDen at wikiden.gg, including the Marathon wiki and any other WikiDen wiki we
        add later. If you do not agree with them, do not use the site.
      </p>

      <LegalSection title="An unofficial fan site">
        <p>
          WikiDen is an unofficial fan wiki network. It is not affiliated with, endorsed by, or sponsored by Bungie or
          any other game publisher or developer. Game names, characters, artwork, and other trademarks mentioned on the
          site belong to their owners and are used here only to identify the games the wikis cover.
        </p>
      </LegalSection>

      <LegalSection title="The wikis">
        <p>
          The pages are unofficial reference material. Many of them are written or updated with the help of AI, from
          cited public sources, and we periodically refetch those sources to keep pages current. We work to be
          accurate, but we do not guarantee that any page is complete, current, or free of errors. Check the sources
          linked on each page. The site is free to read. Do not present it as an official source.
        </p>
      </LegalSection>

      <LegalSection title="Accounts">
        <p>
          Some features, such as submitting a suggestion or a community note, require an account. Accounts are created
          through Clerk, with email or Google. You are responsible for the activity on your account. Contact us at{" "}
          <LegalEmail /> if you think your account has been used without your permission.
        </p>
      </LegalSection>

      <LegalSection title="Your contributions">
        <p>
          By submitting a suggestion, community note, or other content to WikiDen, you grant WikiDen a worldwide,
          non-exclusive, royalty-free, perpetual license to use, host, reproduce, modify, adapt, publish, and display
          that contribution in connection with operating the wikis. This license continues if you later close your
          account, because published pages and their history need to stay intact.
        </p>
        <p>
          You confirm that you have the right to submit the contribution and to grant this license, and that it does
          not infringe anyone else&apos;s rights. We may edit, reject, or remove any contribution at any time,
          including for accuracy, style, sourcing, or these terms.
        </p>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>You may not use the site to:</p>
        <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
          <li>break the law or infringe someone else&apos;s rights</li>
          <li>harass, abuse, or impersonate other people</li>
          <li>post spam, malware, or content meant to disrupt the site</li>
          <li>attempt to gain unauthorized access to the site, other accounts, or our systems</li>
          <li>submit personal information about someone else without their permission</li>
          <li>scrape or bulk-copy the site in a way that burdens our infrastructure or violates these terms</li>
        </ul>
        <p>We may suspend or close an account that violates these terms.</p>
      </LegalSection>

      <LegalSection title="Advertising">
        <p>
          The site may show advertisements, including Google AdSense, when advertising is enabled. A page may also
          include a link to support the wiki.
        </p>
      </LegalSection>

      <LegalSection title="Disclaimer and liability">
        <p>
          The site is provided &quot;as is&quot; and &quot;as available,&quot; without warranties of any kind, including
          that it will be uninterrupted or error-free. To the fullest extent permitted by law, WikiDen and its operator
          are not liable for any indirect, incidental, or consequential damages, or for any loss arising from your use
          of the site or your reliance on a page.
        </p>
      </LegalSection>

      <LegalSection title="Closing an account">
        <p>
          You can ask us to close your account by emailing <LegalEmail />. See the{" "}
          <a href="/privacy" className="text-link underline underline-offset-3">
            Privacy policy
          </a>{" "}
          for how we handle personal information when you do. We may also suspend or close an account that violates
          these terms.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          If we change these terms, we will update the effective date on this page. Continued use of the site after
          that date means you accept the updated terms.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions about these terms: <LegalEmail />.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}

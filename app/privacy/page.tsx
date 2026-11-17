import type { Metadata } from "next";

import { LegalDocument, LegalEmail, LegalLead, LegalSection } from "@/app/_components/network-chrome";
import { LEGAL_EFFECTIVE_DATE } from "@/src/wiki/legal";
import { buildWikiMetadata } from "@/src/wiki/metadata";
import { networkBrand } from "@/src/wiki/network";

export const dynamic = "force-static";

const TITLE = "Privacy policy";
const DESCRIPTION =
  "What WikiDen collects when you use the wikis, how that information is used, and how to ask us about your account.";

export const metadata: Metadata = buildWikiMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: "/privacy",
  siteName: networkBrand()?.name ?? "WikiDen",
});

export default function PrivacyPage() {
  return (
    <LegalDocument title={TITLE}>
      <p className="mt-3 text-small text-muted-foreground">Effective {LEGAL_EFFECTIVE_DATE}</p>
      <p className="mt-6 text-body text-foreground">
        This policy describes what WikiDen collects when you use wikiden.gg and the game wikis hosted there, and how
        that information is used. It covers the current Marathon wiki and any other WikiDen wiki we add later.
      </p>

      <LegalSection title="Who we are">
        <p>
          WikiDen is an unofficial fan wiki network run at wikiden.gg. You can reach us at <LegalEmail />.
        </p>
        <p>
          The wikis are fan projects. They are not affiliated with, endorsed by, or sponsored by Bungie or any other
          game publisher or developer. Trademarks mentioned on the site belong to their owners.
        </p>
      </LegalSection>

      <LegalSection title="Information we collect">
        <p>
          <LegalLead>Accounts.</LegalLead> If you create an account or sign in, we use a service
          called Clerk to handle authentication. You can sign in with email or with Google. Clerk holds your account,
          which typically includes your email address and name, and any profile details your sign-in provider shares.
          We read your account id, email, and name from Clerk when you use signed-in features, such as submitting a
          suggestion or when we check whether you can review edits.
        </p>
        <p>
          <LegalLead>Contributions.</LegalLead> If you submit an edit suggestion or a community
          note, we store the content you send (the title and body, and any source URL or quoted passage you include) in
          our database, hosted by Neon. We also store your Clerk user id and email with that record so editors can see
          who submitted it and follow up if needed. Suggestions and notes are reviewed before they appear on a page. If
          a contribution is accepted, its text may become part of a wiki page and of that page&apos;s public history.
        </p>
        <p>
          <LegalLead>Color scheme.</LegalLead> If you switch the site to light or dark mode, we
          store a &quot;scheme&quot; cookie on your device for up to one year so the choice sticks.
          Choosing &quot;system&quot; deletes that cookie. It is not used for advertising or analytics.
        </p>
        <p>
          <LegalLead>Usage analytics.</LegalLead> Unless we have turned analytics off, the site
          records first-party events such as page views, searches, suggestion clicks and submissions, support-link
          clicks, and when an advertisement slot is shown. An event includes the page path, a short label, and your
          browser&apos;s referrer and user-agent. These events are written to our server logs so we can see how the
          site is used. They are not stored in the wiki database, and we do not use a third-party analytics product
          such as Google Analytics.
        </p>
        <p>
          <LegalLead>Advertising.</LegalLead> The site is set up to show Google AdSense ads in
          reserved slots. Advertising is off unless we enable it. When it is on, Google may collect data about your
          visit and set its own cookies, as described in Google&apos;s policies.
        </p>
        <p>
          <LegalLead>Service providers.</LegalLead> The site is hosted on Vercel, the database is
          hosted by Neon, and accounts are handled by Clerk. These providers may process technical information such as
          IP addresses and request logs as part of running their services.
        </p>
        <p>We do not sell your personal information.</p>
      </LegalSection>

      <LegalSection title="How we use this information">
        <p>
          We use it to operate the wikis, keep you signed in, review and publish contributions, understand how the site
          is used, show advertisements when they are enabled, and respond if you contact us.
        </p>
      </LegalSection>

      <LegalSection title="Cookies">
        <p>The site uses:</p>
        <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
          <li>
            A first-party &quot;scheme&quot; cookie, only if you pick a light or dark color scheme.
          </li>
          <li>Session cookies set by Clerk, if you sign in.</li>
          <li>Cookies set by Google, only if AdSense is enabled.</li>
        </ul>
      </LegalSection>

      <LegalSection title="How long we keep information">
        <p>
          Clerk keeps your account for as long as the account exists. Contributions and wiki page history may be kept
          for as long as the wiki exists, because the pages have to remain readable and attributable. Analytics logs
          follow our host&apos;s ordinary log retention. The color-scheme cookie expires after one year, or sooner if
          you switch back to the system setting.
        </p>
      </LegalSection>

      <LegalSection title="Your choices and requests">
        <p>
          You can browse the wikis without an account. You can close your account or ask us to access, correct, or
          delete personal information we hold by emailing <LegalEmail />. We may keep the text of a published contribution,
          with your email and account id removed from our records where we reasonably can, so that pages and their
          history stay intact.
        </p>
      </LegalSection>

      <LegalSection title="Children">
        <p>
          The site is not directed at children under 13, and we do not knowingly collect personal information from
          them. If you think we have, email us and we will delete it.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          If we change this policy, we will update the effective date on this page. The updated policy applies to your
          use of the site after it is posted.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions about this policy, or requests about your information: <LegalEmail />. See also the{" "}
          <a href="/terms" className="text-link underline underline-offset-3">
            Terms of service
          </a>
          .
        </p>
      </LegalSection>
    </LegalDocument>
  );
}

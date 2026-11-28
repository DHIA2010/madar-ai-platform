import type { Metadata } from "next"

import { ROUTES } from "@/constants/routes"
import { LegalPageShell } from "@/features/marketing-site/components/legal-page-shell"
import { MADAR_CONTACT_EMAIL } from "@/features/marketing-site/marketing-constants"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "MADAR Privacy Policy for platform users and connected advertising integrations.",
  alternates: { canonical: "https://www.madar.my/privacy/en/" },
}

const EFFECTIVE_DATE = "November 18, 2026"

export default function PrivacyEnglishPage() {
  return (
    <LegalPageShell
      locale="en"
      alternateHref={ROUTES.privacy}
      title="Privacy Policy"
      effectiveDate={EFFECTIVE_DATE}
      intro={
        <>
          This Privacy Policy explains how MADAR collects, uses, stores, and protects personal and
          advertising data when you use the MADAR marketing intelligence platform, including
          integrations with supported advertising, analytics, and commerce platforms.
        </>
      }
    >
      <section>
        <h2>1. Introduction</h2>
        <p>
          MADAR is a software-as-a-service marketing intelligence platform. Businesses may connect
          advertising, analytics, and commerce accounts using OAuth to analyze performance and
          generate reporting dashboards and insights.
        </p>
        <p className="mt-3 font-medium">
          MADAR only reads data from connected platforms. MADAR does not create, modify, publish, or
          manage advertising campaigns on behalf of users.
        </p>
      </section>

      <section>
        <h2>2. Information We Collect</h2>
        <p>We may collect and process the following categories of information:</p>
        <ul>
          <li>Account and profile details, such as business email and account identifiers.</li>
          <li>Workspace and organization metadata used to manage access and permissions.</li>
          <li>
            Connected platform data, including campaign-level and account-level advertising
            performance metrics such as impressions, clicks, conversions, spend, and related
            metadata, as well as store, order, product, and customer data from connected commerce
            platforms.
          </li>
          <li>
            Technical logs and security events necessary for platform reliability, fraud prevention,
            and auditing.
          </li>
          <li>
            Website usage information, such as pages visited and general device/browser information,
            collected through standard web analytics.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. OAuth Permissions and Tokens</h2>
        <p>
          MADAR uses OAuth 2.0 to connect third-party advertising, analytics, and commerce
          platforms. During this process, MADAR receives access tokens and refresh tokens required
          to securely retrieve authorized data.
        </p>
        <ul>
          <li>OAuth tokens are stored securely and encrypted at rest.</li>
          <li>OAuth state parameters are validated to prevent unauthorized callback use.</li>
          <li>Tokens are used only for authorized read access and synchronization operations.</li>
          <li>
            Users can disconnect integrations at any time, which revokes MADAR&rsquo;s access in the
            platform workflow.
          </li>
        </ul>
      </section>

      <section>
        <h2>4. Advertising and Commerce Platform Integrations</h2>
        <p>
          MADAR integrates with supported advertising platforms (such as Google Ads, Meta Ads, and
          Snapchat Ads), analytics platforms (such as Google Analytics), and commerce platforms
          (such as Salla and Shopify) to retrieve account and performance data for analytics and
          reporting. Where a business authorizes MADAR to connect a TikTok advertising account, the
          same principle applies: MADAR only retrieves data through TikTok&rsquo;s official,
          approved APIs, and only to provide campaign analytics and reporting within MADAR.
        </p>
        <p className="mt-3 font-medium">
          MADAR does not sell customer data and does not use connected data for unrelated
          third-party marketing purposes.
        </p>
      </section>

      <section>
        <h2>5. How Information Is Used</h2>
        <p>
          Connected data is used to provide operational analytics, trend monitoring, performance
          dashboards, and insights inside MADAR.
        </p>
        <p className="mt-3 font-medium">
          Data is used only for analytics and reporting purposes within the MADAR service.
        </p>
      </section>

      <section>
        <h2>6. How Data Is Protected</h2>
        <p>
          MADAR applies administrative, technical, and organizational safeguards to protect data,
          including encryption mechanisms for sensitive token material and controls for access
          management, auditing, and secure transport.
        </p>
      </section>

      <section>
        <h2>7. Data Retention</h2>
        <p>
          MADAR retains integration and reporting data for as long as necessary to provide the
          service, satisfy legal obligations, resolve disputes, and enforce platform agreements.
        </p>
        <p className="mt-3">
          Upon account closure or integration disconnection, retention and deletion actions are
          processed according to platform policies, system constraints, and applicable law.
        </p>
      </section>

      <section>
        <h2>8. Third-Party Services</h2>
        <p>
          MADAR relies on third-party infrastructure providers (such as cloud hosting) to operate
          the platform, and on third-party APIs (such as advertising and commerce platforms) to
          retrieve data you authorize. These providers process data only as necessary to deliver the
          MADAR service.
        </p>
      </section>

      <section>
        <h2>9. Cookies and Similar Technologies</h2>
        <p>
          MADAR may use cookies and similar technologies for session continuity, authentication,
          security, and service performance. These technologies are used to operate and improve
          platform functionality.
        </p>
      </section>

      <section>
        <h2>10. User Rights</h2>
        <p>
          Users may request access, correction, or deletion of eligible personal data where
          applicable by law.
        </p>
        <p className="mt-3">
          Users can disconnect advertising, analytics, or commerce integrations at any time from
          within the platform, which stops future data synchronization under that connection.
        </p>
      </section>

      <section>
        <h2>11. Contact Information</h2>
        <p>
          For privacy questions or requests, contact:{" "}
          <a
            className="font-medium text-slate-900 underline underline-offset-2"
            href={`mailto:${MADAR_CONTACT_EMAIL}`}
          >
            {MADAR_CONTACT_EMAIL}
          </a>
        </p>
      </section>

      <section>
        <h2>12. Google User Data</h2>
        <p>
          This section applies when you connect a Google account (Google Ads or Google Analytics) to
          MADAR, or sign in with Google.
        </p>
        <h3 className="mt-4 font-semibold">Data accessed</h3>
        <ul>
          <li>
            Google sign-in: your name, email address, and profile picture, to create and identify
            your MADAR account.
          </li>
          <li>
            Google Ads: the list of ad accounts you can access, and for the account you choose, its
            campaigns, ad groups, ads, and keywords with their status and performance figures
            (impressions, clicks, cost, conversions).
          </li>
          <li>
            Google Analytics: the list of Google Analytics 4 properties you can access, and for the
            property you choose, aggregated traffic and conversion reports. MADAR does not receive
            data about individual website visitors.
          </li>
        </ul>
        <h3 className="mt-4 font-semibold">How it is used</h3>
        <p>
          Google user data is used only to show you your own advertising and website performance
          inside MADAR: dashboards, reports, and the answers MADAR&rsquo;s assistant gives to
          questions you ask about your own data. MADAR does not use Google user data for
          advertising, does not sell it, and does not use it to build profiles of people.
        </p>
        <h3 className="mt-4 font-semibold">Sharing and transfer</h3>
        <p>
          Google user data is visible only to the members of the MADAR organization that connected
          the account. It is not sold and is not shared with advertisers or data brokers. It is
          processed by the service providers MADAR needs to run the product: its cloud hosting
          provider, and, when you ask MADAR&rsquo;s assistant a question, the AI service provider
          that produces the answer, which receives only the figures needed for that answer. These
          providers act on MADAR&rsquo;s instructions and may not use the data for their own
          purposes. Google user data is not used to develop or train generalized AI or machine
          learning models.
        </p>
        <h3 className="mt-4 font-semibold">Protection</h3>
        <p>
          Data is encrypted in transit. Google access keys are encrypted at rest, and access to
          connected data is limited by workspace permissions.
        </p>
        <h3 className="mt-4 font-semibold">Retention and deletion</h3>
        <p>
          MADAR keeps Google user data while your Google account stays connected. You can disconnect
          it at any time from the integrations page in MADAR, which stops all further access, or
          remove MADAR&rsquo;s access from your Google Account settings. To have the Google data
          already stored in MADAR deleted, email{" "}
          <a
            className="font-medium text-slate-900 underline underline-offset-2"
            href={`mailto:${MADAR_CONTACT_EMAIL}`}
          >
            {MADAR_CONTACT_EMAIL}
          </a>
          ; it is deleted within 30 days of the request.
        </p>
        <h3 className="mt-4 font-semibold">Limited Use</h3>
        <p>
          MADAR&rsquo;s use and transfer of information received from Google APIs to any other app
          will adhere to the{" "}
          <a
            className="font-medium text-slate-900 underline underline-offset-2"
            href="https://developers.google.com/terms/api-services-user-data-policy"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
      </section>
    </LegalPageShell>
  )
}

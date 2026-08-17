import type { Metadata } from "next"

import { LegalPageShell } from "@/features/marketing-site/components/legal-page-shell"
import { MADAR_CONTACT_EMAIL } from "@/features/marketing-site/marketing-constants"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "MADAR Privacy Policy for platform users and connected advertising integrations.",
  alternates: { canonical: "https://madar.my/privacy" },
}

const EFFECTIVE_DATE = "July 10, 2026"

export default function PrivacyPage() {
  return (
    <LegalPageShell
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
    </LegalPageShell>
  )
}

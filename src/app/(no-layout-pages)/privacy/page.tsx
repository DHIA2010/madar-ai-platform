import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "MADAR Privacy Policy for platform users and connected advertising integrations.",
}

const UPDATED_AT = "July 10, 2026"

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-900 md:px-6" dir="ltr">
      <div className="mx-auto w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-10">
        <header className="mb-8 border-b border-slate-200 pb-6">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">MADAR Privacy Policy</h1>
          <p className="mt-3 text-sm text-slate-600">Effective date: {UPDATED_AT}</p>
          <p className="mt-4 text-slate-700">
            This Privacy Policy explains how MADAR collects, uses, stores, and protects personal and advertising data when
            you use the MADAR marketing intelligence platform, including integrations with Google Ads and Snapchat Ads.
          </p>
        </header>

        <section className="space-y-6 text-sm leading-6 text-slate-800 md:text-base md:leading-7">
          <section>
            <h2 className="mb-2 text-xl font-semibold">1. Introduction</h2>
            <p>
              MADAR is a software-as-a-service marketing intelligence platform. Businesses may connect advertising
              accounts using OAuth to analyze campaign performance and generate reporting dashboards and AI-driven
              business insights.
            </p>
            <p className="mt-2 font-medium">
              MADAR only reads advertising data. MADAR does not create, modify, publish, or manage ad campaigns on behalf
              of users.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold">2. Information We Collect</h2>
            <p>We may collect and process the following categories of information:</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>Account and profile details (such as business email and account identifiers).</li>
              <li>Workspace and organization metadata used to manage access and permissions.</li>
              <li>
                Connected advertising data, including campaign-level and account-level performance metrics such as
                impressions, clicks, conversions, spend, and related metadata.
              </li>
              <li>Technical logs and security events necessary for platform reliability, fraud prevention, and auditing.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold">3. OAuth Permissions and Tokens</h2>
            <p>
              MADAR uses OAuth 2.0 to connect third-party advertising platforms. During this process, MADAR receives
              access tokens and refresh tokens required to securely retrieve authorized data.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>OAuth tokens are stored securely and encrypted at rest.</li>
              <li>OAuth state parameters are validated to prevent unauthorized callback use.</li>
              <li>Tokens are used only for authorized read access and synchronization operations.</li>
              <li>Users can disconnect integrations at any time, which revokes MADAR access in the platform workflow.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold">4. Google Ads and Snapchat Ads Integrations</h2>
            <p>
              MADAR integrates with Google Ads and Snapchat Ads to retrieve account and advertising performance data for
              analytics and reporting.
            </p>
            <p className="mt-2 font-medium">
              MADAR does not sell customer data and does not use connected advertising data for unrelated third-party
              marketing purposes.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold">5. Analytics and Reporting Use</h2>
            <p>
              Connected data is used to provide operational analytics, trend monitoring, performance dashboards, and
              AI-assisted insights inside MADAR.
            </p>
            <p className="mt-2 font-medium">Data is used only for analytics and reporting purposes within the MADAR service.</p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold">6. Data Retention</h2>
            <p>
              MADAR retains integration and reporting data for as long as necessary to provide the service, satisfy legal
              obligations, resolve disputes, and enforce platform agreements.
            </p>
            <p className="mt-2">
              Upon account closure or integration disconnection, retention and deletion actions are processed according to
              platform policies, system constraints, and applicable law.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold">7. Security and Encryption</h2>
            <p>
              MADAR applies administrative, technical, and organizational safeguards to protect data, including encryption
              mechanisms for sensitive token material and controls for access management, auditing, and secure transport.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold">8. User Rights and Integration Revocation</h2>
            <p>Users may request access, correction, or deletion of eligible personal data where applicable by law.</p>
            <p className="mt-2">
              Users can disconnect advertising integrations at any time from within the platform, which stops future data
              synchronization under that connection.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold">9. Cookies and Similar Technologies</h2>
            <p>
              MADAR may use cookies and similar technologies for session continuity, authentication, security, and service
              performance. These technologies are used to operate and improve platform functionality.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold">10. Contact</h2>
            <p>
              For privacy questions or requests, contact:
              {" "}
              <a className="font-medium text-slate-900 underline underline-offset-2" href="mailto:dhiamuhammed@gmail.com">
                dhiamuhammed@gmail.com
              </a>
            </p>
          </section>
        </section>

        <footer className="mt-10 border-t border-slate-200 pt-6 text-sm text-slate-600">
          <p>
            Need to connect your ad platforms?
            {" "}
            <Link href="/integrations/new" className="font-medium text-slate-900 underline underline-offset-2">
              Go to Integrations
            </Link>
          </p>
        </footer>
      </div>
    </main>
  )
}
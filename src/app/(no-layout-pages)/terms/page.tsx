import type { Metadata } from "next"

import { LegalPageShell } from "@/features/marketing-site/components/legal-page-shell"
import { MADAR_CONTACT_EMAIL, MADAR_APP_URL } from "@/features/marketing-site/marketing-constants"

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "MADAR Terms of Service for the marketing intelligence platform and its integrations.",
  alternates: { canonical: "https://madar.my/terms" },
}

const EFFECTIVE_DATE = "July 10, 2026"

export default function TermsPage() {
  return (
    <LegalPageShell
      title="Terms of Service"
      effectiveDate={EFFECTIVE_DATE}
      intro={
        <>
          These Terms of Service (&ldquo;Terms&rdquo;) govern access to and use of MADAR, a
          marketing analytics and intelligence platform, available at{" "}
          <a
            href={MADAR_APP_URL}
            className="font-medium text-slate-900 underline underline-offset-2"
          >
            app.madar.my
          </a>
          . By creating an account or using MADAR, you agree to these Terms.
        </>
      }
    >
      <section>
        <h2>1. Acceptance of Terms</h2>
        <p>
          By accessing or using MADAR, you confirm that you are authorized to act on behalf of the
          business or organization using the platform, and that you accept these Terms in full. If
          you do not agree with these Terms, do not use MADAR.
        </p>
      </section>

      <section>
        <h2>2. Description of Service</h2>
        <p>
          MADAR is a software-as-a-service marketing intelligence platform for e-commerce
          businesses. MADAR connects to authorized advertising, analytics, and commerce platforms to
          retrieve performance data and present it through dashboards, reports, and analytics tools.
        </p>
        <p className="mt-3 font-medium">
          MADAR only reads data from connected platforms. MADAR does not create, modify, publish,
          pause, or otherwise manage advertising campaigns on any connected platform on your behalf.
        </p>
      </section>

      <section>
        <h2>3. User Accounts</h2>
        <p>
          You are responsible for maintaining the confidentiality of your account credentials and
          for all activity that occurs under your account. You agree to provide accurate information
          when creating an account and to keep that information up to date.
        </p>
      </section>

      <section>
        <h2>4. Third-Party Integrations</h2>
        <p>
          MADAR integrates with third-party platforms, including advertising, analytics, and
          e-commerce platforms, through each platform&rsquo;s official APIs and OAuth authorization
          flows. Your use of those platforms remains subject to their own terms of service and
          policies.
        </p>
        <p className="mt-3">
          MADAR is not responsible for the availability, accuracy, or behavior of third-party
          platforms, and integration functionality may change if a third-party platform changes or
          restricts its API.
        </p>
      </section>

      <section>
        <h2>5. Authorized Data Access</h2>
        <p>
          When you connect a third-party account to MADAR, you authorize MADAR to access and
          retrieve data from that account through the applicable platform&rsquo;s API, for the
          purpose of providing analytics and reporting within MADAR. You may disconnect an
          integration at any time from within the platform, which stops future data synchronization
          for that connection.
        </p>
      </section>

      <section>
        <h2>6. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use MADAR for any unlawful purpose or in violation of any applicable law.</li>
          <li>
            Attempt to gain unauthorized access to MADAR, other users&rsquo; accounts, or connected
            third-party accounts.
          </li>
          <li>Interfere with or disrupt the integrity or performance of MADAR.</li>
          <li>Reverse engineer, decompile, or attempt to extract the source code of MADAR.</li>
          <li>Use MADAR to violate the terms of service of any connected third-party platform.</li>
        </ul>
      </section>

      <section>
        <h2>7. Intellectual Property</h2>
        <p>
          MADAR, including its software, design, branding, and underlying technology, is the
          property of its operator. These Terms do not grant you any ownership rights in MADAR. You
          retain ownership of the data you connect to MADAR from your own advertising and commerce
          accounts.
        </p>
      </section>

      <section>
        <h2>8. Service Availability</h2>
        <p>
          MADAR is provided on an &ldquo;as available&rdquo; basis. While we aim to keep the
          platform reliable, we do not guarantee uninterrupted or error-free operation, and
          scheduled maintenance or third-party platform changes may temporarily affect availability.
        </p>
      </section>

      <section>
        <h2>9. Limitation of Liability</h2>
        <p>
          To the fullest extent permitted by law, MADAR and its operators are not liable for
          indirect, incidental, or consequential damages arising from your use of the platform,
          including damages resulting from third-party platform outages, data inaccuracies, or
          decisions made based on MADAR&rsquo;s analytics and reporting.
        </p>
      </section>

      <section>
        <h2>10. Termination</h2>
        <p>
          You may stop using MADAR and disconnect your integrations at any time. We may suspend or
          terminate access to MADAR for accounts that violate these Terms or that pose a security or
          operational risk to the platform.
        </p>
      </section>

      <section>
        <h2>11. Changes to Terms</h2>
        <p>
          We may update these Terms from time to time to reflect changes in the platform or
          applicable law. Material changes will be communicated through the platform or by email
          where reasonably possible. Continued use of MADAR after changes take effect constitutes
          acceptance of the updated Terms.
        </p>
      </section>

      <section>
        <h2>12. Contact Information</h2>
        <p>
          For questions about these Terms, contact:{" "}
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

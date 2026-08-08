import { KeyRound, Mail, ShieldCheck } from "lucide-react"
import { getLocale, getTranslations } from "next-intl/server"

import { localeDirection, type Locale } from "@/i18n/locales"

import {
  AuthShowcasePanel,
  AuthTrustBadge,
  ForgotPasswordForm,
} from "@/features/authentication/components"

const FEATURE_ICONS = [Mail, KeyRound, ShieldCheck]

export default async function ForgotPasswordPage() {
  const locale = (await getLocale()) as Locale
  const t = await getTranslations("auth.forgotPassword.showcase")
  const features = t.raw("features") as { title: string; description: string }[]

  return (
    <div className="grid min-h-svh w-full lg:grid-cols-2" dir={localeDirection(locale)}>
      <div className="flex items-center justify-center p-6 md:p-10">
        <ForgotPasswordForm />
      </div>

      <AuthShowcasePanel
        eyebrow={t("eyebrow")}
        heading={t("heading")}
        description={t("description")}
        features={features.map((feature, index) => ({
          ...feature,
          icon: FEATURE_ICONS[index] ?? ShieldCheck,
        }))}
        footer={<AuthTrustBadge />}
      />
    </div>
  )
}

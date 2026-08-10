import { KeyRound, Lock, ShieldCheck } from "lucide-react"
import { getLocale, getTranslations } from "next-intl/server"

import { localeDirection, type Locale } from "@/i18n/locales"

import {
  AuthShowcasePanel,
  AuthTrustBadge,
  ResetPasswordForm as AuthResetPasswordForm,
} from "@/features/authentication/components"

const FEATURE_ICONS = [Lock, KeyRound, ShieldCheck]

export default async function ResetPasswordPage() {
  const locale = (await getLocale()) as Locale
  const t = await getTranslations("auth.resetPassword.showcase")
  const features = t.raw("features") as { title: string; description: string }[]

  return (
    <div className="grid min-h-svh w-full lg:grid-cols-2" dir={localeDirection(locale)}>
      <div className="flex items-center justify-center p-6 md:p-10">
        <AuthResetPasswordForm />
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

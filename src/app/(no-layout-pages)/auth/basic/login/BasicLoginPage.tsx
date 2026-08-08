import { Link2, LineChart, Sparkles } from "lucide-react"
import { getLocale, getTranslations } from "next-intl/server"

import { localeDirection, type Locale } from "@/i18n/locales"

import { AuthShowcasePanel, AuthTrustBadge, LoginForm } from "@/features/authentication/components"

const FEATURE_ICONS = [Link2, LineChart, Sparkles]

export default async function BasicLoginPage() {
  const locale = (await getLocale()) as Locale
  const t = await getTranslations("auth.login.showcase")
  const features = t.raw("features") as { title: string; description: string }[]

  return (
    <div className="grid min-h-svh w-full lg:grid-cols-2" dir={localeDirection(locale)}>
      <div className="flex items-center justify-center p-6 md:p-10">
        <LoginForm />
      </div>

      <AuthShowcasePanel
        eyebrow={t("eyebrow")}
        heading={t("heading")}
        description={t("description")}
        features={features.map((feature, index) => ({
          ...feature,
          icon: FEATURE_ICONS[index] ?? Sparkles,
        }))}
        footer={<AuthTrustBadge />}
      />
    </div>
  )
}

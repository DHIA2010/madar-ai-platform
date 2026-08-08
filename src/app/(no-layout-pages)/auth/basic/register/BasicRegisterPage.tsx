import { Link2, ShieldCheck, Sparkles } from "lucide-react"
import { getLocale, getTranslations } from "next-intl/server"

import { localeDirection, type Locale } from "@/i18n/locales"

import { AuthShowcasePanel, SignupForm } from "@/features/authentication/components"

const FEATURE_ICONS = [Link2, Sparkles, ShieldCheck]

export default async function BasicRegisterPage() {
  const locale = (await getLocale()) as Locale
  const t = await getTranslations("auth.register.showcase")
  const features = t.raw("features") as { title: string; description: string }[]

  return (
    <div className="grid min-h-svh w-full lg:grid-cols-2" dir={localeDirection(locale)}>
      <div className="flex items-center justify-center p-6 md:p-10">
        <SignupForm />
      </div>

      <AuthShowcasePanel
        eyebrow={t("eyebrow")}
        heading={t("heading")}
        description={t("description")}
        features={features.map((feature, index) => ({
          ...feature,
          icon: FEATURE_ICONS[index] ?? Sparkles,
        }))}
        footer={
          <>
            <span className="font-medium text-slate-900">{t("footerPrefix")}</span>{" "}
            {t("footerSuffix")}
          </>
        }
      />
    </div>
  )
}

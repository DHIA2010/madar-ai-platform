import { getLocale, getTranslations } from "next-intl/server"

import { localeDirection, type Locale } from "@/i18n/locales"

import { LanguageSwitcher } from "@/components/language-switcher"

import { RegisterShowcasePanel, SignupForm } from "@/features/authentication/components"

export default async function BasicRegisterPage() {
  const locale = (await getLocale()) as Locale
  const t = await getTranslations("auth.register.showcase")
  const featureCards = t.raw("featureCards") as {
    key: string
    title: string
    description: string
  }[]
  const badges = t.raw("badges") as { key: string; label: string }[]

  return (
    <div className="relative grid min-h-svh w-full lg:grid-cols-2" dir={localeDirection(locale)}>
      <LanguageSwitcher className="absolute end-4 top-4 z-10 bg-white/90 shadow-sm backdrop-blur lg:end-6 lg:top-6" />

      <div className="flex items-center justify-center bg-white px-6 py-16 md:px-10">
        <SignupForm />
      </div>

      <RegisterShowcasePanel
        eyebrow={t("eyebrow")}
        heading={t("heading")}
        headingHighlight={t("headingHighlight")}
        description={t("description")}
        featureCards={featureCards}
        badges={badges}
        footer={
          <>
            <span className="font-semibold text-white">{t("footerPrefix")}</span>{" "}
            {t("footerSuffix")}
          </>
        }
      />
    </div>
  )
}

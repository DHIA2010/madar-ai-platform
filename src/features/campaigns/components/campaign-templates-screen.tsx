"use client"

import { useTranslations } from "next-intl"

import { AppBadge, AppButton, AppCard, AppPageHeader } from "@/components/app"

import { CampaignModuleNav } from "./campaign-module-nav"

const TEMPLATE_CARD_KEYS = [
  "leadGeneration",
  "sales",
  "traffic",
  "awareness",
  "remarketing",
] as const

export function CampaignTemplatesScreen() {
  const t = useTranslations("campaigns.templatesScreen")

  return (
    <div className="space-y-4">
      <CampaignModuleNav />

      <AppPageHeader title={t("title")} subtitle={t("subtitle")} />

      <AppCard title={t("cardTitle")} subtitle={t("cardSubtitle")}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {TEMPLATE_CARD_KEYS.map((templateKey) => (
            <article key={templateKey} className="rounded-xl border border-border/70 bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold">{t(`categories.${templateKey}`)}</h3>
                <AppBadge variant="outline" className="text-xs">
                  {t("placeholderBadge")}
                </AppBadge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{t("cardDescription")}</p>
              <div className="mt-4">
                <AppButton size="sm" variant="outline" disabled>
                  {t("useTemplate")}
                </AppButton>
              </div>
            </article>
          ))}
        </div>
      </AppCard>
    </div>
  )
}

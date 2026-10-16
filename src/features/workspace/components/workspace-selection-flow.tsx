"use client"

import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"

import { ROUTES } from "@/constants/routes"

import { AppCard } from "@/components/app"

import { WorkspaceSelectorContent } from "./workspace-selector-content"

import { type Locale, localeDirection } from "@/i18n/locales"

export function WorkspaceSelectionFlow() {
  const t = useTranslations("workspace.selectFlow")
  const locale = useLocale() as Locale
  const router = useRouter()

  return (
    <div
      dir={localeDirection(locale)}
      className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-4 py-10"
    >
      <AppCard className="w-full" title={t("title")} subtitle={t("subtitle")}>
        <WorkspaceSelectorContent onComplete={() => router.replace(ROUTES.dashboard)} />
      </AppCard>
    </div>
  )
}

"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { AlertCircle, ArrowLeft } from "lucide-react"

import { ROUTES } from "@/constants/routes"

import { AppButton } from "@/components/app"

import type { ApplicationCategoryId } from "@/features/applications"
import { PLAN_TIER_META } from "@/features/applications"

import type { MoyasarSelfServePlanTier } from "../types"
import { MoyasarPaymentPanel } from "./moyasar-payment-panel"

import { type Locale, localeDirection } from "@/i18n/locales"

const VALID_APPLICATIONS: ReadonlySet<string> = new Set([
  "advertising",
  "ecommerce",
  "pos",
  "madarApps",
])
const VALID_TIERS: ReadonlySet<string> = new Set(["starter", "growth", "pro"])

// A dedicated, unconstrained page for the Moyasar checkout form -- see moyasar-payment-panel.tsx's
// own comment for why this moved out of the activation dialog's modal.
export function MoyasarCheckoutPage() {
  const t = useTranslations("billing.moyasar.checkoutPage")
  const tCommon = useTranslations("billing.moyasar.common")
  const locale = useLocale() as Locale
  const router = useRouter()
  const searchParams = useSearchParams()
  const application = searchParams.get("application")
  const planTier = searchParams.get("planTier")
  const applicationName = searchParams.get("name")

  const isValid =
    Boolean(application && VALID_APPLICATIONS.has(application)) &&
    Boolean(planTier && VALID_TIERS.has(planTier)) &&
    Boolean(applicationName)

  if (!isValid) {
    return (
      <div
        dir={localeDirection(locale)}
        className="flex min-h-[70vh] items-center justify-center p-6"
      >
        <div className="w-full max-w-[26rem] rounded-[16px] border border-[#e1e7f0] bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto size-12 text-[#d97706]" />
          <p className="mt-4 text-[15px] font-extrabold text-[#0b1738]">{t("invalidLink.title")}</p>
          <p className="mt-1.5 text-[12.5px] text-[#6b7b96]">{t("invalidLink.description")}</p>
          <AppButton
            className="mt-5 h-11 w-full rounded-[10px] text-[13.5px] font-bold"
            onClick={() => router.push(ROUTES.marketplace)}
          >
            {tCommon("backToMarketplace")}
          </AppButton>
        </div>
      </div>
    )
  }

  const tierMeta = PLAN_TIER_META[planTier as MoyasarSelfServePlanTier]

  return (
    <div dir={localeDirection(locale)} className="mx-auto max-w-[32rem] p-6">
      <button
        type="button"
        onClick={() => router.push(ROUTES.marketplace)}
        className="mb-4 flex items-center gap-1.5 text-[12.5px] font-semibold text-[#6b7b96] hover:text-[#0b1738]"
      >
        <ArrowLeft className="size-3.5 rtl:rotate-180" />
        {tCommon("backToMarketplace")}
      </button>

      <div className="rounded-[16px] border border-[#e1e7f0] bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between border-b border-[#eef1f6] pb-5">
          <div>
            <p className="text-[16px] font-extrabold text-[#0b1738]">{applicationName}</p>
            <p className="text-[12px] text-[#6b7b96]">{t("planLabel", { tier: tierMeta.name })}</p>
          </div>
          <p className="text-[18px] font-extrabold text-[#2878ff]">{tierMeta.priceLabel}</p>
        </div>

        <MoyasarPaymentPanel
          key={planTier}
          application={application as ApplicationCategoryId}
          applicationName={applicationName as string}
          planTier={planTier as MoyasarSelfServePlanTier}
        />
      </div>
    </div>
  )
}

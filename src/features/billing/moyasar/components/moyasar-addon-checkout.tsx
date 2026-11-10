"use client"

// Checking out a period of a paid add-on (purpose=addon on the checkout page) -- e.g. the WhatsApp
// daily report's paid plan. The price shown is for information; what's charged is priced
// server-side from Madar Admin's add-on price.

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { AlertCircle, ArrowLeft, Check, MessageCircle } from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppButton } from "@/components/app"

import { formatRiyals } from "@/features/applications"

import { type AddonCode, type AddonOverview, addonsService } from "../services"
import { MoyasarPaymentPanel } from "./moyasar-payment-panel"

import type { BillingInterval } from "@/application/contracts"
import { type Locale, localeDirection } from "@/i18n/locales"

const KNOWN_ADDONS: ReadonlySet<string> = new Set<AddonCode>(["whatsapp_daily_report"])

export function MoyasarAddonCheckout({
  code,
  initialInterval,
}: {
  code: string
  initialInterval: BillingInterval
}) {
  const t = useTranslations("billing.moyasar.addonCheckout")
  const locale = useLocale() as Locale
  const router = useRouter()
  const [interval, setInterval] = useState<BillingInterval>(initialInterval)
  const [addon, setAddon] = useState<AddonOverview | null | undefined>(undefined)

  const known = KNOWN_ADDONS.has(code)
  useEffect(() => {
    if (!known) return
    addonsService
      .get(code as AddonCode)
      .then(setAddon)
      .catch(() => setAddon(null))
  }, [code, known])

  if (!known || addon === null || (addon && !addon.isActive)) {
    return (
      <div
        dir={localeDirection(locale)}
        className="flex min-h-[70vh] items-center justify-center p-6"
      >
        <div className="w-full max-w-[26rem] rounded-[16px] border border-[#e1e7f0] bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto size-12 text-[#d97706]" />
          <p className="mt-4 text-[15px] font-extrabold text-[#0b1738]">{t("unavailable")}</p>
          <AppButton
            className="mt-5 h-11 w-full rounded-[10px] text-[13.5px] font-bold"
            onClick={() => router.push(ROUTES.settingsDailyReport)}
          >
            {t("back")}
          </AppButton>
        </div>
      </div>
    )
  }

  const name = t(`names.${code as AddonCode}`)
  const priceFor = (value: BillingInterval) =>
    addon ? (value === "yearly" ? addon.yearlyPriceHalalas : addon.monthlyPriceHalalas) : null
  const yearlySaving = addon
    ? Math.max(0, addon.monthlyPriceHalalas * 12 - addon.yearlyPriceHalalas)
    : 0

  return (
    <div dir={localeDirection(locale)} className="mx-auto max-w-[32rem] p-6">
      <button
        type="button"
        onClick={() => router.push(ROUTES.settingsDailyReport)}
        className="mb-4 flex items-center gap-1.5 text-[12.5px] font-semibold text-[#6b7b96] hover:text-[#0b1738]"
      >
        <ArrowLeft className="size-3.5 rtl:rotate-180" />
        {t("back")}
      </button>

      <div className="rounded-[16px] border border-[#e1e7f0] bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-start gap-3 border-b border-[#eef1f6] pb-5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-[#e7f8ee] text-[#1a9e55]">
            <MessageCircle className="size-5" />
          </span>
          <div>
            <p className="text-[16px] font-extrabold text-[#0b1738]">{name}</p>
            <ul className="mt-2 flex flex-col gap-1">
              {(t.raw(`features.${code as AddonCode}`) as string[]).map((feature) => (
                <li key={feature} className="flex items-start gap-1.5 text-[12px] text-[#475467]">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-[#1a9e55]" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2.5">
          {(["monthly", "yearly"] as const).map((value) => {
            const price = priceFor(value)
            return (
              <button
                key={value}
                type="button"
                onClick={() => setInterval(value)}
                aria-pressed={interval === value}
                className={cn(
                  "rounded-[12px] border p-3.5 text-start transition-colors",
                  interval === value
                    ? "border-[#2878ff] bg-[#f3f7ff] ring-2 ring-[#2878ff]/15"
                    : "border-[#e1e7f0] hover:border-[#c9d3e3]"
                )}
              >
                <p className="text-[12px] font-semibold text-[#6b7b96]">{t(`interval.${value}`)}</p>
                <p className="mt-1 text-[17px] font-extrabold text-[#0b1738]">
                  {price === null ? "…" : `SAR ${formatRiyals(price)}`}
                </p>
                {value === "yearly" && yearlySaving > 0 ? (
                  <p className="mt-0.5 text-[11px] font-semibold text-[#16a34a]">
                    {t("save", { amount: formatRiyals(yearlySaving) })}
                  </p>
                ) : null}
              </button>
            )
          })}
        </div>

        {addon?.active ? (
          <p className="mb-4 rounded-[10px] bg-[#f0fdf4] px-3.5 py-2.5 text-[12px] text-[#15803d]">
            {t("extends", {
              date: new Intl.DateTimeFormat(
                locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US",
                {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                }
              ).format(new Date(addon.active.currentPeriodEnd)),
            })}
          </p>
        ) : null}

        {addon ? (
          <MoyasarPaymentPanel
            key={`${code}:${interval}`}
            purchase={{ application: "madarApps", packageId: "", interval, addon: code }}
            applicationName={name}
          />
        ) : null}
        <p className="mt-3 text-center text-[11.5px] text-[#95a4bd]">{t("secure")}</p>
      </div>
    </div>
  )
}

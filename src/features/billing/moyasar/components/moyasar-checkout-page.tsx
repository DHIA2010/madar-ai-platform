"use client"

import { useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { AlertCircle, ArrowLeft, TicketPercent, X } from "lucide-react"

import { ROUTES } from "@/constants/routes"

import { AppButton, AppInput } from "@/components/app"

import {
  type CouponQuote,
  formatRiyals,
  priceFor,
  pricingService,
  usePricingCatalog,
} from "@/features/applications"

import type { MoyasarPurchase } from "../types"
import { MoyasarPaymentPanel } from "./moyasar-payment-panel"

import type { BillingInterval, PurchasableApplication } from "@/application/contracts"
import { type Locale, localeDirection } from "@/i18n/locales"

const VALID_APPLICATIONS: ReadonlySet<string> = new Set<PurchasableApplication>([
  "advertising",
  "ecommerce",
  "pos",
  "madarApps",
  "procurement",
  "expenses",
  "ai",
  "customReports",
  "madarComplete",
])
const VALID_INTERVALS: ReadonlySet<string> = new Set<BillingInterval>(["monthly", "yearly"])

// A dedicated, unconstrained page for the Moyasar checkout form -- see moyasar-payment-panel.tsx's
// own comment for why this moved out of the activation dialog's modal. The amount shown here is
// for the customer's information only; what's charged is priced server-side from the package.
export function MoyasarCheckoutPage() {
  const t = useTranslations("billing.moyasar.checkoutPage")
  const tCommon = useTranslations("billing.moyasar.common")
  const tDialog = useTranslations("applications.requestDialog")
  const locale = useLocale() as Locale
  const router = useRouter()
  const searchParams = useSearchParams()
  const catalog = usePricingCatalog()
  const application = searchParams.get("application")
  const packageId = searchParams.get("packageId")
  const interval = searchParams.get("interval")
  const applicationName = searchParams.get("name")
  const [couponInput, setCouponInput] = useState("")
  const [coupon, setCoupon] = useState<CouponQuote | null>(null)
  const [couponError, setCouponError] = useState<string | null>(null)
  const [checkingCoupon, setCheckingCoupon] = useState(false)

  const isValid =
    Boolean(application && VALID_APPLICATIONS.has(application)) &&
    Boolean(packageId) &&
    Boolean(interval && VALID_INTERVALS.has(interval)) &&
    Boolean(applicationName)

  const purchase = useMemo<MoyasarPurchase | null>(
    () =>
      isValid
        ? {
            application: application as PurchasableApplication,
            packageId: packageId as string,
            interval: interval as BillingInterval,
          }
        : null,
    [isValid, application, packageId, interval]
  )

  // The checkout (and its Moyasar form) is re-created whenever the coupon changes, so the amount
  // the customer sees is always the one charged.
  const purchaseWithCoupon = useMemo<MoyasarPurchase | null>(
    () => (purchase ? { ...purchase, couponCode: coupon?.code ?? null } : null),
    [purchase, coupon]
  )

  async function applyCoupon() {
    if (!purchase || !couponInput.trim()) return
    setCheckingCoupon(true)
    setCouponError(null)
    try {
      setCoupon(
        await pricingService.quoteCoupon({
          code: couponInput.trim(),
          application: purchase.application,
          packageId: purchase.packageId,
          interval: purchase.interval,
        })
      )
    } catch (error) {
      const code = (error as { code?: string })?.code ?? ""
      setCoupon(null)
      setCouponError(
        t.has(`couponErrors.${code}` as "couponErrors.generic")
          ? t(`couponErrors.${code}` as "couponErrors.generic")
          : t("couponErrors.generic")
      )
    } finally {
      setCheckingCoupon(false)
    }
  }

  if (!purchase || !purchaseWithCoupon) {
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

  const pkg = catalog
    ?.find((entry) => entry.application === purchase.application)
    ?.packages.find((entry) => entry.id === purchase.packageId)
  const amount = pkg ? priceFor(pkg, purchase.interval) : null

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
            <p className="text-[12px] text-[#6b7b96]">
              {t("planLabel", { tier: pkg?.name ?? "…" })} ·{" "}
              {purchase.interval === "yearly"
                ? tDialog("billingYearly")
                : tDialog("billingMonthly")}
            </p>
          </div>
          {amount !== null ? (
            <div className="text-end">
              {coupon ? (
                <p className="text-[12.5px] font-semibold text-[#95a4bd] line-through">
                  SAR {formatRiyals(coupon.originalAmountHalalas)}
                </p>
              ) : null}
              <p className="text-[18px] font-extrabold text-[#2878ff]">
                SAR {formatRiyals(coupon ? coupon.finalAmountHalalas : amount)}{" "}
                <span className="text-[12px] font-semibold text-[#6b7b96]">
                  {purchase.interval === "yearly" ? tDialog("perYear") : tDialog("perMonth")}
                </span>
              </p>
            </div>
          ) : null}
        </div>

        <div className="mb-5">
          <label className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-[#0b1738]">
            <TicketPercent className="size-4 text-[#2878ff]" />
            {t("couponLabel")}
          </label>
          {coupon ? (
            <div className="flex items-center justify-between rounded-[10px] border border-[#bbf7d0] bg-[#f0fdf4] px-3.5 py-2.5">
              <div>
                <p className="text-[12.5px] font-bold text-[#15803d]">
                  {t("couponApplied", { code: coupon.code })}
                </p>
                <p className="text-[11.5px] text-[#15803d]">
                  {t("couponDiscount")}: SAR {formatRiyals(coupon.discountHalalas)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCoupon(null)
                  setCouponInput("")
                }}
                className="flex items-center gap-1 text-[12px] font-semibold text-[#15803d] hover:underline"
              >
                <X className="size-3.5" />
                {t("couponRemove")}
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <AppInput
                  value={couponInput}
                  onChange={(event) => setCouponInput(event.target.value.toUpperCase())}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void applyCoupon()
                  }}
                  placeholder={t("couponPlaceholder")}
                  dir="ltr"
                  className="h-11 flex-1 rounded-[10px] font-mono"
                />
                <AppButton
                  variant="outline"
                  className="h-11 rounded-[10px] px-5 font-semibold"
                  loading={checkingCoupon}
                  disabled={!couponInput.trim()}
                  onClick={applyCoupon}
                >
                  {t("couponApply")}
                </AppButton>
              </div>
              {couponError ? (
                <p className="mt-1.5 text-[12px] font-medium text-[#dc2626]">{couponError}</p>
              ) : null}
            </>
          )}
        </div>

        <MoyasarPaymentPanel
          key={`${purchase.application}:${purchase.packageId}:${purchase.interval}:${coupon?.code ?? ""}`}
          purchase={purchaseWithCoupon}
          applicationName={applicationName as string}
        />
      </div>
    </div>
  )
}

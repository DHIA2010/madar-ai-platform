"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { AlertCircle, ArrowLeft, Building2, Minus, Plus, TicketPercent, X } from "lucide-react"

import { ROUTES } from "@/constants/routes"

import { AppButton, AppInput } from "@/components/app"

import {
  type CouponQuote,
  extraBranchPriceFor,
  formatRiyals,
  priceFor,
  pricingService,
  usePricingCatalog,
} from "@/features/applications"

import { type BranchAllowance, branchAllowanceService } from "../services"
import type { MoyasarPurchase } from "../types"
import { MoyasarAddonCheckout } from "./moyasar-addon-checkout"
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
  "promotions",
  "invoicing",
  "madarComplete",
])
const VALID_INTERVALS: ReadonlySet<string> = new Set<BillingInterval>(["monthly", "yearly"])
// Branches are sold with POS and the Madar Complete bundle.
const BRANCH_APPLICATIONS: ReadonlySet<string> = new Set([
  "pos",
  "madarComplete",
  "advertising",
  "ecommerce",
])
// Ads and E-commerce call the same add-on a workspace; POS calls it a branch.
const WORKSPACE_APPLICATIONS: ReadonlySet<string> = new Set(["advertising", "ecommerce"])

const clampCount = (value: string | null, min: number) =>
  Math.min(100, Math.max(min, Math.floor(Number(value) || min)))

function Stepper({
  value,
  min,
  onChange,
}: {
  value: number
  min: number
  onChange: (next: number) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label="-"
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        className="flex size-9 items-center justify-center rounded-[9px] border border-[#e1e7f0] text-[#0b1738] hover:bg-[#f7f9fc] disabled:opacity-40"
      >
        <Minus className="size-4" />
      </button>
      <span className="w-9 text-center text-[16px] font-extrabold text-[#0b1738]">{value}</span>
      <button
        type="button"
        aria-label="+"
        disabled={value >= 100}
        onClick={() => onChange(value + 1)}
        className="flex size-9 items-center justify-center rounded-[9px] border border-[#e1e7f0] text-[#0b1738] hover:bg-[#f7f9fc] disabled:opacity-40"
      >
        <Plus className="size-4" />
      </button>
    </div>
  )
}

// The checkout page: a paid add-on (purpose=addon, e.g. the WhatsApp daily report's paid plan) has
// its own screen; everything else buys a package or adds branches.
export function MoyasarCheckoutPage() {
  const searchParams = useSearchParams()
  if (searchParams.get("purpose") === "addon") {
    const interval = searchParams.get("interval")
    return (
      <MoyasarAddonCheckout
        code={searchParams.get("addon") ?? ""}
        initialInterval={interval === "yearly" ? "yearly" : "monthly"}
      />
    )
  }
  return <PackageCheckoutPage />
}

// A dedicated, unconstrained page for the Moyasar checkout form -- see moyasar-payment-panel.tsx's
// own comment for why this moved out of the activation dialog's modal. The amount shown here is
// for the customer's information only; what's charged is priced server-side from the package.
function PackageCheckoutPage() {
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
  // purpose=branches: add branches to the running subscription instead of buying a package.
  const addingBranches = searchParams.get("purpose") === "branches"
  // Total branches for a new subscription (the package includes one), or branches to add.
  // Branches on top of those the package includes.
  const [extraCount, setExtraCount] = useState(() => clampCount(searchParams.get("extra"), 0))
  const [addCount, setAddCount] = useState(() => clampCount(searchParams.get("count"), 1))
  const [allowance, setAllowance] = useState<BranchAllowance | null>(null)

  useEffect(() => {
    if (!addingBranches) return
    branchAllowanceService
      .get()
      .then(setAllowance)
      .catch(() => setAllowance(null))
  }, [addingBranches])
  const [couponInput, setCouponInput] = useState("")
  const [coupon, setCoupon] = useState<CouponQuote | null>(null)
  const [couponError, setCouponError] = useState<string | null>(null)
  const [checkingCoupon, setCheckingCoupon] = useState(false)

  const isWorkspaceUnit = Boolean(application && WORKSPACE_APPLICATIONS.has(application))
  const unitKey = isWorkspaceUnit ? "workspaces" : "branches"
  const addKey = isWorkspaceUnit ? "addWorkspaces" : "addBranches"
  const isValid = addingBranches
    ? Boolean(application && BRANCH_APPLICATIONS.has(application)) &&
      Boolean(interval && VALID_INTERVALS.has(interval)) &&
      Boolean(applicationName)
    : Boolean(application && VALID_APPLICATIONS.has(application)) &&
      Boolean(packageId) &&
      Boolean(interval && VALID_INTERVALS.has(interval)) &&
      Boolean(applicationName)

  const pkg = catalog
    ?.find((entry) => entry.application === application)
    ?.packages.find((entry) => entry.id === packageId)
  const branchPrice = pkg && interval ? extraBranchPriceFor(pkg, interval as BillingInterval) : null
  const includedBranches = pkg?.includedBranches ?? 1
  const extraBranches = !addingBranches && branchPrice !== null ? extraCount : 0

  const purchase = useMemo<MoyasarPurchase | null>(
    () =>
      isValid
        ? {
            application: application as PurchasableApplication,
            packageId: (packageId ?? "") as string,
            interval: interval as BillingInterval,
            ...(addingBranches ? { addBranches: addCount } : { extraBranches }),
          }
        : null,
    [isValid, application, packageId, interval, addingBranches, addCount, extraBranches]
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
          extraBranches: purchase.extraBranches ?? 0,
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

  const basePrice = pkg ? priceFor(pkg, purchase.interval) : null
  const amount = addingBranches
    ? allowance?.proratedHalalasPerBranch != null
      ? allowance.proratedHalalasPerBranch * addCount
      : null
    : basePrice === null
      ? null
      : basePrice + extraBranches * (branchPrice ?? 0)
  const periodEnd = allowance?.subscription?.currentPeriodEnd
    ? new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(allowance.subscription.currentPeriodEnd))
    : null

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
              {addingBranches
                ? t(`${addKey}.subtitle`, { count: addCount })
                : t("planLabel", { tier: pkg?.name ?? "…" })}{" "}
              ·{" "}
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
                {addingBranches ? null : (
                  <span className="text-[12px] font-semibold text-[#6b7b96]">
                    {purchase.interval === "yearly" ? tDialog("perYear") : tDialog("perMonth")}
                  </span>
                )}
              </p>
            </div>
          ) : null}
        </div>

        {addingBranches ? (
          <div className="mb-5 rounded-[12px] border border-[#e1e7f0] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-[13px] font-bold text-[#0b1738]">
                <Building2 className="size-4 text-[#2878ff]" />
                {t(`${addKey}.label`)}
              </p>
              <Stepper value={addCount} min={1} onChange={setAddCount} />
            </div>
            <p className="mt-2.5 text-[12px] leading-5 text-[#6b7b96]">
              {allowance?.proratedHalalasPerBranch != null && periodEnd
                ? t(`${addKey}.hint`, {
                    price: formatRiyals(allowance.proratedHalalasPerBranch),
                    date: periodEnd,
                    full: formatRiyals(allowance.extraBranchPriceHalalas ?? 0),
                  })
                : allowance && !allowance.canBuyBranches
                  ? t(`${addKey}.unavailable`)
                  : "…"}
            </p>
          </div>
        ) : branchPrice !== null && basePrice !== null ? (
          <div className="mb-5 rounded-[12px] border border-[#e1e7f0] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-[13px] font-bold text-[#0b1738]">
                <Building2 className="size-4 text-[#2878ff]" />
                {t(`${unitKey}.label`)}
              </p>
              <Stepper
                value={includedBranches + extraCount}
                min={includedBranches}
                onChange={(next) => {
                  setExtraCount(Math.max(0, next - includedBranches))
                  setCoupon(null)
                }}
              />
            </div>
            <p className="mt-2.5 text-[12px] leading-5 text-[#6b7b96]">
              {t(`${unitKey}.hint`, {
                included: includedBranches,
                price: formatRiyals(branchPrice),
              })}
            </p>
            {extraBranches > 0 ? (
              <p className="mt-1.5 text-[12px] font-semibold text-[#0b1738]">
                {t(`${unitKey}.breakdown`, {
                  base: formatRiyals(basePrice),
                  count: extraBranches,
                  price: formatRiyals(branchPrice),
                })}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className={addingBranches ? "hidden" : "mb-5"}>
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
          key={`${purchase.application}:${purchase.packageId}:${purchase.interval}:${coupon?.code ?? ""}:${purchase.extraBranches ?? 0}:${purchase.addBranches ?? 0}`}
          purchase={purchaseWithCoupon}
          applicationName={applicationName as string}
        />
      </div>
    </div>
  )
}

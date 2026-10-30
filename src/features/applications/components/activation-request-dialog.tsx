"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import type { LucideIcon } from "lucide-react"
import {
  Check,
  CheckCircle2,
  CreditCard,
  Gift,
  Landmark,
  Mail,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react"
import { toast } from "sonner"

import { fileToBase64 } from "@/lib/file-to-base64"
import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppDialog } from "@/components/app"

import { usePricingCatalog, usePublicPlatformSettings } from "../hooks/use-pricing"
import {
  formatRiyals,
  priceFor,
  type PricingPackage,
  purchasablePackages,
  yearlySavingPercent,
} from "../services/pricing.service"

import type { BillingInterval, PurchasableApplication } from "@/application/contracts"
import { type Locale, localeDirection } from "@/i18n/locales"

export interface ActivationRequestTarget {
  applicationId: string
  // What's being bought: one application, or the "madarComplete" bundle.
  category: PurchasableApplication
  name: string
  icon?: LucideIcon
  iconWrapperClassName?: string
  // Whether this application hasn't used its one-time free trial yet (and isn't already active/
  // pending) -- shows the free-trial option above the packages when true.
  trialAvailable?: boolean
}

const ACCEPTED_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"]
const ACCEPT_ATTR = ACCEPTED_CONTENT_TYPES.join(",")
const MAX_FILE_BYTES = 5 * 1024 * 1024
const FALLBACK_TRIAL_DAYS = 7

export interface ActivationRequestInput {
  applicationId: string
  packageId: string
  interval: BillingInterval
  attachmentContentType: string
  attachmentDataBase64: string
}

function firstPricedFor(packages: PricingPackage[], interval: BillingInterval) {
  return (
    packages.find((pkg) => pkg.isRecommended && priceFor(pkg, interval) !== null) ??
    packages.find((pkg) => priceFor(pkg, interval) !== null) ??
    null
  )
}

// Subscribing to an application (or the bundle): pick one of its packages -- as priced in Madar
// Admin -- and a monthly or yearly period, then pay by card right away or attach a bank-transfer
// receipt for Madar staff to approve. An application priced as "contact us" shows how to reach
// the team instead.
export function ActivationRequestDialog({
  target,
  onOpenChange,
  onSubmit,
  onStartTrial,
  onActivateFree,
}: {
  target: ActivationRequestTarget | null
  onOpenChange: (open: boolean) => void
  onSubmit: (input: ActivationRequestInput) => Promise<void>
  onStartTrial: (applicationId: string) => Promise<void>
  onActivateFree: (applicationId: string) => Promise<void>
}) {
  const t = useTranslations("applications.requestDialog")
  const locale = useLocale()
  const dir = localeDirection(locale as Locale)
  const router = useRouter()
  const catalog = usePricingCatalog()
  const platformSettings = usePublicPlatformSettings()
  const trialDays = platformSettings?.trialDays ?? FALLBACK_TRIAL_DAYS

  const pricing = catalog?.find((entry) => entry.application === target?.category)
  const packages = useMemo(() => purchasablePackages(pricing), [pricing])
  const offersYearly = packages.some((pkg) => pkg.yearlyPriceHalalas !== null)
  const offersMonthly = packages.some((pkg) => pkg.monthlyPriceHalalas !== null)

  const [chosenInterval, setChosenInterval] = useState<BillingInterval | null>(null)
  const [chosenPackageId, setChosenPackageId] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<"card" | "bank_transfer">("card")
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [startingTrial, setStartingTrial] = useState(false)

  // Defaults resolve once pricing has loaded: monthly when offered, and the recommended (else
  // first) package with a price for that period.
  const interval: BillingInterval = chosenInterval ?? (offersMonthly ? "monthly" : "yearly")
  const chosenPackage = packages.find((pkg) => pkg.id === chosenPackageId)
  const selectedPackage =
    chosenPackage && priceFor(chosenPackage, interval) !== null
      ? chosenPackage
      : firstPricedFor(packages, interval)
  const amount = selectedPackage ? priceFor(selectedPackage, interval) : null

  const Icon = target?.icon
  const loading = catalog === null
  const isFree = !loading && pricing?.mode === "free"
  const contactOnly = !loading && !isFree && (pricing?.mode === "contact" || packages.length === 0)
  const canBuy = !loading && !isFree && !contactOnly && selectedPackage !== null && amount !== null
  const isCardCheckout = canBuy && paymentMethod === "card"
  const isFixed = pricing?.mode === "fixed"

  function reset() {
    setChosenInterval(null)
    setChosenPackageId(null)
    setPaymentMethod("card")
    setFile(null)
  }

  function close() {
    reset()
    onOpenChange(false)
  }

  // Moyasar's widget injects its own DOM content in ways that don't play well with a
  // scroll-clipped, fixed-position modal (the Apple Pay/3DS surfaces visually escaped the dialog
  // card entirely when mounted inline) -- a dedicated full page is the robust fix, same pattern
  // as the callback page this already redirects to on completion.
  function goToCardCheckout() {
    if (!target || !selectedPackage) return
    const url = new URL(ROUTES.marketplaceBillingCheckout, window.location.origin)
    url.searchParams.set("application", target.category)
    url.searchParams.set("packageId", selectedPackage.id)
    url.searchParams.set("interval", interval)
    url.searchParams.set("name", target.name)
    close()
    router.push(`${url.pathname}${url.search}`)
  }

  async function handleSubmit() {
    if (!target || !selectedPackage) return
    if (!file) {
      toast.error(t("toastAttachRequired"))
      return
    }
    if (!ACCEPTED_CONTENT_TYPES.includes(file.type)) {
      toast.error(t("toastInvalidFileType"))
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error(t("toastFileTooLarge"))
      return
    }

    setSubmitting(true)
    try {
      await onSubmit({
        applicationId: target.applicationId,
        packageId: selectedPackage.id,
        interval,
        attachmentContentType: file.type,
        attachmentDataBase64: await fileToBase64(file),
      })
      toast.success(t("toastRequestSubmitted", { name: target.name }))
      close()
    } catch {
      toast.error(t("toastRequestError"))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleActivateFree() {
    if (!target) return
    setStartingTrial(true)
    try {
      await onActivateFree(target.applicationId)
      toast.success(t("toastFreeActivated", { name: target.name }))
      close()
    } catch {
      toast.error(t("toastFreeError"))
    } finally {
      setStartingTrial(false)
    }
  }

  async function handleStartTrial() {
    if (!target) return
    setStartingTrial(true)
    try {
      await onStartTrial(target.applicationId)
      toast.success(t("toastTrialActivated", { name: target.name, days: trialDays }))
      close()
    } catch {
      toast.error(t("toastTrialError"))
    } finally {
      setStartingTrial(false)
    }
  }

  return (
    <AppDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (submitting || startingTrial) return
        if (!open) reset()
        onOpenChange(open)
      }}
      title={
        target ? (
          <span dir={dir} className="flex items-center gap-3.5">
            {Icon ? (
              <span
                className={cn(
                  "flex size-14 shrink-0 items-center justify-center rounded-[14px]",
                  target.iconWrapperClassName ?? "bg-[#eef4ff] text-[#2878ff]"
                )}
              >
                <Icon className="size-6" />
              </span>
            ) : null}
            <span className="text-[19px] font-extrabold text-[#0b1738]">
              {t("title", { name: target.name })}
            </span>
          </span>
        ) : (
          ""
        )
      }
      description={
        target && !contactOnly && !isFree ? (
          <span dir={dir} className="text-[13.5px] leading-[22px] text-[#6b7b96]">
            {t("description")}
          </span>
        ) : null
      }
      contentClassName={cn(
        locale === "ar" ? "[direction:rtl]" : "[direction:ltr]",
        "max-w-[40rem] gap-5 p-6"
      )}
      footer={
        <div className="flex w-full gap-2">
          <AppButton
            variant="outline"
            className="h-12 flex-1 rounded-[10px] text-[14px] font-semibold"
            disabled={submitting || startingTrial}
            onClick={close}
          >
            {t("cancel")}
          </AppButton>
          {isFree ? (
            <AppButton
              className="h-12 flex-1 rounded-[10px] text-[14px] font-bold shadow-sm"
              loading={startingTrial}
              onClick={handleActivateFree}
            >
              {t("activateFree")}
            </AppButton>
          ) : null}
          {canBuy ? (
            <AppButton
              className="h-12 flex-1 rounded-[10px] text-[14px] font-bold shadow-sm"
              loading={submitting}
              disabled={startingTrial}
              onClick={isCardCheckout ? goToCardCheckout : handleSubmit}
            >
              {isCardCheckout ? t("payNow") : t("submitRequest")}
            </AppButton>
          ) : null}
        </div>
      }
    >
      {target ? (
        <div dir={dir} className="max-h-[62vh] space-y-5 overflow-y-auto">
          {target.trialAvailable && !isFree ? (
            <div className="flex items-center justify-between gap-3 rounded-[12px] bg-[#2878ff] p-4 shadow-[0_6px_16px_rgba(40,120,255,0.3)]">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-white/15 text-white">
                  <Sparkles className="size-5" />
                </span>
                <div>
                  <p className="text-[14px] font-extrabold text-white">
                    {t("trialBannerTitle", { days: trialDays })}
                  </p>
                  <p className="text-[11.5px] font-medium text-white/80">
                    {t("trialBannerSubtitle")}
                  </p>
                </div>
              </div>
              <AppButton
                className="h-10 shrink-0 rounded-[10px] bg-white px-4 text-[13px] font-bold text-[#2878ff] shadow-sm hover:bg-white/90 hover:text-[#2878ff] active:bg-white/80 active:text-[#2878ff]"
                loading={startingTrial}
                disabled={submitting}
                onClick={handleStartTrial}
              >
                {t("startTrial")}
              </AppButton>
            </div>
          ) : null}

          {loading ? (
            <p className="py-6 text-center text-[13px] text-[#6b7b96]">{t("loadingPackages")}</p>
          ) : isFree ? (
            <div className="flex items-start gap-3 rounded-[12px] border border-[#bbf7d0] bg-[#f0fdf4] p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[#dcfce7] text-[#15803d]">
                <Gift className="size-5" />
              </span>
              <div>
                <p className="text-[14px] font-extrabold text-[#0b1738]">{t("freeTitle")}</p>
                <p className="mt-1 text-[12.5px] leading-[21px] text-[#6b7b96]">
                  {t("freeLimitedSubtitle", { days: pricing?.freeDays ?? 0 })}
                </p>
              </div>
            </div>
          ) : contactOnly ? (
            <div className="flex items-start gap-3 rounded-[12px] border border-[#e1e7f0] bg-[#f7f9fd] p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[#eef4ff] text-[#2878ff]">
                <Mail className="size-5" />
              </span>
              <div>
                <p className="text-[14px] font-extrabold text-[#0b1738]">{t("contactTitle")}</p>
                <p className="mt-1 text-[12.5px] leading-[21px] text-[#6b7b96]">
                  {t("contactDescription", {
                    email: platformSettings?.supportEmail ?? "support@madar.my",
                  })}
                </p>
              </div>
            </div>
          ) : (
            <>
              {offersYearly && offersMonthly ? (
                <div className="grid grid-cols-2 gap-2 rounded-[12px] bg-[#f1f4f9] p-1">
                  {(["monthly", "yearly"] as const).map((option) => {
                    // The saving of the package being chosen, not the best across all of them.
                    const selectedSaving = selectedPackage
                      ? (yearlySavingPercent(selectedPackage) ?? 0)
                      : 0
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setChosenInterval(option)}
                        className={cn(
                          "flex h-10 items-center justify-center gap-1.5 rounded-[9px] text-[12.5px] font-bold transition-colors",
                          interval === option
                            ? "bg-white text-[#2878ff] shadow-sm"
                            : "text-[#6b7b96] hover:text-[#0b1738]"
                        )}
                      >
                        {option === "monthly" ? t("billingMonthly") : t("billingYearly")}
                        {option === "yearly" && selectedSaving > 0 ? (
                          <span className="rounded-full bg-[#dcfce7] px-2 py-0.5 text-[10.5px] font-bold text-[#15803d]">
                            {t("yearlySaving", { percent: selectedSaving })}
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              ) : null}

              <div>
                <label className="mb-2 block text-[12.5px] font-semibold text-[#0b1738]">
                  {isFixed ? t("priceLabel") : t("planLabel")}
                </label>
                <div
                  className={cn(
                    "grid gap-2.5",
                    packages.length === 1 ? "grid-cols-1" : "sm:grid-cols-2"
                  )}
                >
                  {packages.map((pkg) => {
                    const price = priceFor(pkg, interval)
                    const selected = selectedPackage?.id === pkg.id
                    const saving = interval === "yearly" ? yearlySavingPercent(pkg) : null
                    return (
                      <button
                        key={pkg.id}
                        type="button"
                        disabled={price === null}
                        onClick={() => setChosenPackageId(pkg.id)}
                        className={cn(
                          "relative rounded-[12px] border p-3.5 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                          selected
                            ? "border-[#2878ff] bg-[#eef4ff]"
                            : "border-[#e1e7f0] bg-white hover:border-[#c4d5f0]"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={cn(
                              "text-[13.5px] font-bold",
                              selected ? "text-[#2878ff]" : "text-[#0b1738]"
                            )}
                          >
                            {pkg.name}
                          </p>
                          {pkg.isRecommended ? (
                            <span className="shrink-0 rounded-full bg-[#fff3d6] px-2 py-0.5 text-[10.5px] font-bold text-[#c2900c]">
                              ★
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-[15px] font-extrabold text-[#0b1738]">
                          {price === null ? (
                            <span className="text-[12px] font-semibold text-[#95a4bd]">
                              {t("noPriceForPeriod")}
                            </span>
                          ) : (
                            <>
                              SAR {formatRiyals(price)}{" "}
                              <span className="text-[11.5px] font-medium text-[#6b7b96]">
                                {interval === "yearly" ? t("perYear") : t("perMonth")}
                              </span>
                            </>
                          )}
                        </p>
                        {saving ? (
                          <span className="mt-1 inline-block rounded-full bg-[#dcfce7] px-2 py-0.5 text-[10.5px] font-bold text-[#15803d]">
                            {t("yearlySaving", { percent: saving })}
                          </span>
                        ) : null}
                        {pkg.description ? (
                          <p className="mt-1.5 text-[11.5px] text-[#6b7b96]">{pkg.description}</p>
                        ) : null}
                        {pkg.features.length > 0 ? (
                          <ul className="mt-2 space-y-1">
                            {pkg.features.map((feature) => (
                              <li
                                key={feature}
                                className="flex items-center gap-1.5 text-[11.5px] text-[#334155]"
                              >
                                <Check className="size-3.5 shrink-0 text-[#16a34a]" />
                                {feature}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 rounded-[12px] bg-[#f1f4f9] p-1">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("card")}
                  className={cn(
                    "flex h-10 items-center justify-center gap-1.5 rounded-[9px] text-[12.5px] font-bold transition-colors",
                    paymentMethod === "card"
                      ? "bg-white text-[#2878ff] shadow-sm"
                      : "text-[#6b7b96] hover:text-[#0b1738]"
                  )}
                >
                  <CreditCard className="size-3.5" />
                  {t("payNow")}
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("bank_transfer")}
                  className={cn(
                    "flex h-10 items-center justify-center gap-1.5 rounded-[9px] text-[12.5px] font-bold transition-colors",
                    paymentMethod === "bank_transfer"
                      ? "bg-white text-[#2878ff] shadow-sm"
                      : "text-[#6b7b96] hover:text-[#0b1738]"
                  )}
                >
                  <Landmark className="size-3.5" />
                  {t("bankTransfer")}
                </button>
              </div>

              {isCardCheckout ? (
                <div className="flex items-start gap-2.5 rounded-[12px] border border-[#e1e7f0] bg-[#f7f9fd] p-3.5">
                  <ShieldCheck className="size-4 shrink-0 text-[#2878ff]" />
                  <p className="text-[12px] leading-[20px] text-[#6b7b96]">
                    {t("cardCheckoutNotice")}
                  </p>
                </div>
              ) : (
                <div>
                  <label className="mb-2 block text-[12.5px] font-semibold text-[#0b1738]">
                    {t("receiptLabel")}
                  </label>
                  <label
                    className={cn(
                      "flex h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[12px] border-2 border-dashed text-center transition-colors",
                      file
                        ? "border-[#16a34a] bg-[#f0fdf4]"
                        : "border-[#dbe6f8] bg-[#f7f9fd] hover:border-[#c4d5f0]"
                    )}
                  >
                    <input
                      type="file"
                      accept={ACCEPT_ATTR}
                      className="hidden"
                      onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                    />
                    {file ? (
                      <>
                        <CheckCircle2 className="size-5 text-[#16a34a]" />
                        <span className="text-[12px] font-semibold text-[#16a34a]">
                          {file.name}
                        </span>
                      </>
                    ) : (
                      <>
                        <Upload className="size-5 text-[#95a4bd]" />
                        <span className="text-[11.5px] text-[#6b7b96]">{t("uploadPrompt")}</span>
                      </>
                    )}
                  </label>
                </div>
              )}
            </>
          )}
        </div>
      ) : null}
    </AppDialog>
  )
}

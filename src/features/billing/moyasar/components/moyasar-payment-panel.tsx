"use client"

import { useCallback, useEffect, useRef } from "react"
import { useLocale, useTranslations } from "next-intl"
import { CreditCard, RotateCcw } from "lucide-react"
import { toast } from "sonner"

import { ROUTES } from "@/constants/routes"

import { AppButton } from "@/components/app"

import { useMoyasarCheckout } from "../hooks"
import { loadMoyasarStylesheet, removeMoyasarStylesheet } from "../services"
import type { MoyasarPurchase } from "../types"

import { type Locale, localeDirection } from "@/i18n/locales"

// Mounted on the dedicated /marketplace/billing/checkout page (see moyasar-checkout-page.tsx) --
// not embedded in the activation dialog itself: Moyasar's widget injects DOM content in ways that
// don't play well with a scroll-clipped, fixed-position modal (Apple Pay/3DS surfaces visually
// escaped a modal card entirely when this was tried inline), so a full, unconstrained page is the
// robust container. A different package/period re-mounts this component (the parent keys it by
// purchase), so each gets its own fresh checkout intent rather than this panel trying to mutate
// an in-flight one.
export function MoyasarPaymentPanel({
  purchase,
  applicationName,
}: {
  purchase: MoyasarPurchase
  applicationName: string
}) {
  // Always rendered, regardless of stage -- retry (triggered from the error state) needs this
  // ref's node to already exist, so the mount point can never be behind a conditional that
  // unmounts it while an error is showing.
  const t = useTranslations("billing.moyasar.paymentPanel")
  const tCommon = useTranslations("billing.moyasar.common")
  const locale = useLocale() as Locale
  const formRef = useRef<HTMLDivElement>(null)
  const { stage, errorMessage, start, reset } = useMoyasarCheckout()
  const purchaseKey = `${purchase.application}:${purchase.packageId}:${purchase.interval}:${purchase.couponCode ?? ""}`
  const startedFor = useRef<string | null>(null)

  const runStart = useCallback(() => {
    if (!formRef.current) return
    void start({
      purchase,
      applicationName,
      returnPath: ROUTES.marketplaceBillingCallback,
      formElement: formRef.current,
      onFailure: (message) => toast.error(message),
    })
  }, [purchase, applicationName, start])

  // Moyasar's stylesheet lives only as long as this panel -- see removeMoyasarStylesheet.
  useEffect(() => {
    loadMoyasarStylesheet()
    return removeMoyasarStylesheet
  }, [])

  useEffect(() => {
    // Guards against React 18 strict-mode's double-invoke in dev and against re-running when
    // unrelated parent state changes -- this must fire exactly once per purchase, since each run
    // creates a brand new billing_moyasar_payments row on the backend.
    if (startedFor.current === purchaseKey) return
    startedFor.current = purchaseKey
    runStart()
  }, [purchaseKey, runStart])

  return (
    <div dir={localeDirection(locale)} className="space-y-3">
      {stage === "error" ? (
        <div className="flex flex-col items-center gap-3 rounded-[12px] border border-[#fecaca] bg-[#fef2f2] p-5 text-center">
          <p className="text-[13px] font-semibold text-[#b91c1c]">
            {errorMessage ?? t("startFailedFallback")}
          </p>
          <AppButton
            variant="outline"
            className="h-10 rounded-[10px] text-[13px] font-semibold"
            onClick={() => {
              reset()
              startedFor.current = purchaseKey
              runStart()
            }}
          >
            <RotateCcw className="size-3.5" />
            {tCommon("retry")}
          </AppButton>
        </div>
      ) : null}
      {stage === "creating" ? (
        <div className="flex items-center justify-center gap-2 rounded-[12px] border border-[#e1e7f0] bg-[#f7f9fd] p-6 text-[12.5px] font-medium text-[#6b7b96]">
          <CreditCard className="size-4 animate-pulse" />
          {t("preparingForm")}
        </div>
      ) : null}
      <div ref={formRef} className={stage === "error" ? "hidden" : "mysr-form"} />
    </div>
  )
}

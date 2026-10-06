"use client"

import { useCallback, useEffect, useRef } from "react"
import { CreditCard, RotateCcw } from "lucide-react"
import { toast } from "sonner"

import { ROUTES } from "@/constants/routes"

import { AppButton } from "@/components/app"

import type { ApplicationCategoryId } from "@/features/applications"

import { useMoyasarCheckout } from "../hooks"
import type { MoyasarSelfServePlanTier } from "../types"

// Mounted on the dedicated /marketplace/billing/checkout page (see moyasar-checkout-page.tsx) --
// not embedded in the activation dialog itself: Moyasar's widget injects DOM content in ways that
// don't play well with a scroll-clipped, fixed-position modal (Apple Pay/3DS surfaces visually
// escaped a modal card entirely when this was tried inline), so a full, unconstrained page is the
// robust container. A tier change re-mounts this component (parent keys it by tier), so each tier
// gets its own fresh checkout intent rather than this panel trying to mutate an in-flight one.
export function MoyasarPaymentPanel({
  application,
  applicationName,
  planTier,
}: {
  application: ApplicationCategoryId
  applicationName: string
  planTier: MoyasarSelfServePlanTier
}) {
  // Always rendered, regardless of stage -- retry (triggered from the error state) needs this
  // ref's node to already exist, so the mount point can never be behind a conditional that
  // unmounts it while an error is showing.
  const formRef = useRef<HTMLDivElement>(null)
  const { stage, errorMessage, start, reset } = useMoyasarCheckout()
  const startedForTier = useRef<MoyasarSelfServePlanTier | null>(null)

  const runStart = useCallback(() => {
    if (!formRef.current) return
    void start({
      application,
      planTier,
      applicationName,
      returnPath: ROUTES.marketplaceBillingCallback,
      formElement: formRef.current,
      onFailure: (message) => toast.error(message),
    })
  }, [application, applicationName, planTier, start])

  useEffect(() => {
    // Guards against React 18 strict-mode's double-invoke in dev and against re-running when
    // unrelated parent state changes -- this must fire exactly once per tier selection, since
    // each run creates a brand new billing_moyasar_payments row on the backend.
    if (startedForTier.current === planTier) return
    startedForTier.current = planTier
    runStart()
  }, [planTier, runStart])

  return (
    <div dir="rtl" className="space-y-3">
      {stage === "error" ? (
        <div className="flex flex-col items-center gap-3 rounded-[12px] border border-[#fecaca] bg-[#fef2f2] p-5 text-center">
          <p className="text-[13px] font-semibold text-[#b91c1c]">
            {errorMessage ?? "تعذر بدء عملية الدفع."}
          </p>
          <AppButton
            variant="outline"
            className="h-10 rounded-[10px] text-[13px] font-semibold"
            onClick={() => {
              reset()
              startedForTier.current = planTier
              runStart()
            }}
          >
            <RotateCcw className="size-3.5" />
            إعادة المحاولة
          </AppButton>
        </div>
      ) : null}
      {stage === "creating" ? (
        <div className="flex items-center justify-center gap-2 rounded-[12px] border border-[#e1e7f0] bg-[#f7f9fd] p-6 text-[12.5px] font-medium text-[#6b7b96]">
          <CreditCard className="size-4 animate-pulse" />
          جاري تجهيز نموذج الدفع...
        </div>
      ) : null}
      <div ref={formRef} className={stage === "error" ? "hidden" : "mysr-form"} />
    </div>
  )
}

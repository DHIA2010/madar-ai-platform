"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AlertCircle, CheckCircle2, Loader2, XCircle } from "lucide-react"

import { ROUTES } from "@/constants/routes"

import { AppButton } from "@/components/app"

import { moyasarBillingService } from "../services"

type CallbackState = "verifying" | "paid" | "failed" | "invalid_link" | "error"

// Lands here after Moyasar's hosted form redirects back (a real top-level page navigation it
// performs, not a Next router transition -- see useMoyasarCheckout's callback_url). Moyasar's own
// `status`/`message` query params are deliberately never read: a customer can edit those in the
// address bar before this page even loads, so the only thing trusted from the URL is the payment
// id, which confirmCheckout re-verifies server-side against Moyasar's API with the secret key.
export function MoyasarCheckoutCallback() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const moyasarPaymentId = searchParams.get("id")
  const checkoutId = searchParams.get("checkout_id")
  const hasValidLink = Boolean(moyasarPaymentId && checkoutId)

  // Computed from the initial render, not an effect -- a missing query param is known
  // synchronously from the URL itself, so there's nothing to "effect" here.
  const [state, setState] = useState<CallbackState>(hasValidLink ? "verifying" : "invalid_link")
  // Bumped by the retry button to re-run the effect below -- an effect dependency, not a
  // directly-called function, since every attempt at calling an async confirm helper from an
  // effect here tripped react-hooks/set-state-in-effect regardless of shape; this is the
  // react.dev-canonical "fetch in an effect" pattern (inline async fn + cancelled flag) instead.
  const [retryToken, setRetryToken] = useState(0)

  useEffect(() => {
    if (!hasValidLink) return
    let cancelled = false

    moyasarBillingService
      .confirmCheckout(checkoutId as string, moyasarPaymentId as string)
      .then((result) => {
        if (!cancelled) setState(result.status === "paid" ? "paid" : "failed")
      })
      .catch(() => {
        if (!cancelled) setState("error")
      })

    return () => {
      cancelled = true
    }
  }, [hasValidLink, checkoutId, moyasarPaymentId, retryToken])

  const retry = useCallback(() => {
    setState("verifying")
    setRetryToken((token) => token + 1)
  }, [])

  return (
    <div dir="rtl" className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="w-full max-w-[26rem] rounded-[16px] border border-[#e1e7f0] bg-white p-8 text-center shadow-sm">
        {state === "verifying" ? (
          <>
            <Loader2 className="mx-auto size-10 animate-spin text-[#2878ff]" />
            <p className="mt-4 text-[14px] font-semibold text-[#0b1738]">
              جاري التحقق من عملية الدفع...
            </p>
          </>
        ) : null}

        {state === "paid" ? (
          <>
            <CheckCircle2 className="mx-auto size-12 text-[#16a34a]" />
            <p className="mt-4 text-[15px] font-extrabold text-[#0b1738]">تم الدفع بنجاح</p>
            <p className="mt-1.5 text-[12.5px] text-[#6b7b96]">تم تفعيل التطبيق فورًا.</p>
            <AppButton
              className="mt-5 h-11 w-full rounded-[10px] text-[13.5px] font-bold"
              onClick={() => router.push(ROUTES.marketplace)}
            >
              العودة إلى المتجر
            </AppButton>
          </>
        ) : null}

        {state === "failed" ? (
          <>
            <XCircle className="mx-auto size-12 text-[#dc2626]" />
            <p className="mt-4 text-[15px] font-extrabold text-[#0b1738]">فشلت عملية الدفع</p>
            <p className="mt-1.5 text-[12.5px] text-[#6b7b96]">
              لم يتم خصم أي مبلغ. يمكنك المحاولة مرة أخرى من صفحة المتجر.
            </p>
            <AppButton
              className="mt-5 h-11 w-full rounded-[10px] text-[13.5px] font-bold"
              onClick={() => router.push(ROUTES.marketplace)}
            >
              العودة إلى المتجر
            </AppButton>
          </>
        ) : null}

        {state === "invalid_link" ? (
          <>
            <AlertCircle className="mx-auto size-12 text-[#d97706]" />
            <p className="mt-4 text-[15px] font-extrabold text-[#0b1738]">رابط غير صالح</p>
            <p className="mt-1.5 text-[12.5px] text-[#6b7b96]">
              تعذر العثور على بيانات عملية الدفع في هذا الرابط.
            </p>
            <AppButton
              className="mt-5 h-11 w-full rounded-[10px] text-[13.5px] font-bold"
              onClick={() => router.push(ROUTES.marketplace)}
            >
              العودة إلى المتجر
            </AppButton>
          </>
        ) : null}

        {state === "error" ? (
          <>
            <AlertCircle className="mx-auto size-12 text-[#d97706]" />
            <p className="mt-4 text-[15px] font-extrabold text-[#0b1738]">
              تعذر التحقق من عملية الدفع
            </p>
            <p className="mt-1.5 text-[12.5px] text-[#6b7b96]">
              قد تكون عملية الدفع قد تمت -- حاول التحقق مرة أخرى قبل إعادة الدفع.
            </p>
            <AppButton
              className="mt-5 h-11 w-full rounded-[10px] text-[13.5px] font-bold"
              onClick={retry}
            >
              إعادة المحاولة
            </AppButton>
          </>
        ) : null}
      </div>
    </div>
  )
}

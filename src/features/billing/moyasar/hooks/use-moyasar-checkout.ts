"use client"

import { useCallback, useState } from "react"

import type { ApplicationCategoryId } from "@/features/applications"

import { loadMoyasarWidget, moyasarBillingService } from "../services"
import type { MoyasarSelfServePlanTier } from "../types"

export type MoyasarCheckoutStage = "idle" | "creating" | "ready" | "error"

export interface StartMoyasarCheckoutInput {
  application: ApplicationCategoryId
  planTier: MoyasarSelfServePlanTier
  applicationName: string
  // Where the browser lands (a real top-level navigation, not a route change -- Moyasar's own
  // redirect, not Next's router) once the customer finishes on Moyasar's side, success or not.
  returnPath: string
  formElementSelector: string
  onFailure?: (message: string) => void
}

// Orchestrates the checkout half of the flow: create the checkout intent, load the widget script
// once, then mount Moyasar's own form into the caller's DOM node. Confirming the payment after
// the browser comes back is a separate step (moyasarBillingService.confirmCheckout), handled by
// the /marketplace/billing/callback page this redirects to -- this hook's job ends at redirect.
export function useMoyasarCheckout() {
  const [stage, setStage] = useState<MoyasarCheckoutStage>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const start = useCallback(async (input: StartMoyasarCheckoutInput) => {
    setStage("creating")
    setErrorMessage(null)
    try {
      const [intent] = await Promise.all([
        moyasarBillingService.createCheckout({
          application: input.application,
          planTier: input.planTier,
        }),
        loadMoyasarWidget(),
      ])

      if (!window.Moyasar) {
        throw new Error("MOYASAR_WIDGET_UNAVAILABLE")
      }

      const callbackUrl = new URL(input.returnPath, window.location.origin)
      callbackUrl.searchParams.set("checkout_id", intent.checkoutId)

      window.Moyasar.init({
        element: input.formElementSelector,
        publishable_api_key: intent.publishableKey,
        amount: intent.amount,
        currency: intent.currency,
        description: `اشتراك ${input.applicationName}`,
        callback_url: callbackUrl.toString(),
        // Round-trips to the webhook's payload.data.metadata.checkout_id -- see
        // billing/moyasar/service.ts's handleWebhookEvent on the backend. The synchronous confirm
        // path (the callback page) doesn't need this; it gets checkoutId from the URL directly.
        metadata: { checkout_id: intent.checkoutId },
        on_failure: () => {
          input.onFailure?.("فشلت عملية الدفع. تحقق من بيانات البطاقة وحاول مرة أخرى.")
        },
      })
      setStage("ready")
    } catch {
      setStage("error")
      setErrorMessage("تعذر بدء عملية الدفع. حاول مرة أخرى.")
    }
  }, [])

  const reset = useCallback(() => {
    setStage("idle")
    setErrorMessage(null)
  }, [])

  return { stage, errorMessage, start, reset }
}

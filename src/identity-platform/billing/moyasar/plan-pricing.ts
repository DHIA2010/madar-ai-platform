import type { MoyasarSelfServePlanTier } from "./types"

// Backend-local copy of the prices in src/features/applications/services/plan-tiers.ts's
// PLAN_TIER_META -- command-handlers.ts's own APPLICATION_SETTINGS_KEY comment explains why this
// duplication is intentional (backend modules must not import frontend feature code). Amount is
// in halalas (Moyasar's smallest SAR unit, per https://docs.moyasar.com/api/payments/01-create-payment)
// computed from the same SAR/month figures shown to the customer. Enterprise is deliberately
// absent -- its price is "تواصل معنا" (contact us), not a fixed self-serve checkout amount, so it
// stays on the manual subscription_activation_requests review path.
export const MOYASAR_PLAN_TIER_AMOUNT_HALALAS: Record<MoyasarSelfServePlanTier, number> = {
  // TEMPORARY: dropped to 1 SAR (100 halalas) to test the live Moyasar production checkout
  // end-to-end -- must match plan-tiers.ts's starter.monthlyPrice or the dialog label and the
  // actual charge diverge. Revert to 9900 once that test is confirmed working.
  starter: 100,
  growth: 29900,
  pro: 49900,
}

export const MOYASAR_CURRENCY = "SAR"

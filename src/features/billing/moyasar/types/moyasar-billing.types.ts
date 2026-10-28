import type { BillingInterval, PurchasableApplication } from "@/application/contracts"

export type MoyasarSelfServePlanTier = "starter" | "growth" | "pro"

export interface MoyasarCheckoutIntent {
  checkoutId: string
  amount: number
  currency: string
  publishableKey: string
}

export type MoyasarPaymentStatus = "initiated" | "paid" | "failed"

// Subset of billing/moyasar/types.ts's MoyasarPaymentRecord (the backend's confirm response) --
// only the fields this feature actually reads, same convention as ChatSessionDto etc. above.
export interface MoyasarPaymentRecord {
  id: string
  status: MoyasarPaymentStatus
  application: PurchasableApplication
  planTier: MoyasarSelfServePlanTier | null
  packageId: string | null
  billingInterval: BillingInterval
}

// What's being bought at checkout -- the amount is priced server-side from this.
export interface MoyasarPurchase {
  application: PurchasableApplication
  packageId: string
  interval: BillingInterval
  couponCode?: string | null
}

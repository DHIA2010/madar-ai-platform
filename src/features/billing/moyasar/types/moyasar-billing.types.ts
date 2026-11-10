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
  // "branches" when the payment added branches to a running subscription; "addon" when it bought
  // a period of a paid add-on (e.g. the WhatsApp daily report's paid plan).
  purpose?: "subscription" | "branches" | "addon"
  addonCode?: string | null
}

// What's being bought at checkout -- the amount is priced server-side from this.
export interface MoyasarPurchase {
  application: PurchasableApplication
  packageId: string
  interval: BillingInterval
  // Branches on top of the one the package includes.
  extraBranches?: number
  couponCode?: string | null
  // Set instead of buying a package: adds this many branches to the running subscription, for
  // what's left of its period.
  addBranches?: number
  // Set instead of buying a package: a period of this paid add-on, priced server-side.
  addon?: string
}

import type { BillingInterval, PurchasableApplication } from "../../subscriptions/types"

export type MoyasarApplication = PurchasableApplication
export type MoyasarSelfServePlanTier = "starter" | "growth" | "pro"
export type MoyasarPaymentStatus = "initiated" | "paid" | "failed"
// "subscription" buys a package (with any extra branches); "branches" adds branches to a running
// subscription for what's left of its period; "addon" buys a period of a paid add-on
// (subscriptions/addons.ts), independent of any package.
export type MoyasarPaymentPurpose = "subscription" | "branches" | "addon"

export interface MoyasarPaymentRecord {
  id: string
  organizationId: string
  requestedByUserId: string
  application: MoyasarApplication
  // The account-wide tier the package maps to, if any (null for packages created in Madar Admin).
  planTier: MoyasarSelfServePlanTier | null
  packageId: string | null
  billingInterval: BillingInterval
  purpose: MoyasarPaymentPurpose
  // The add-on bought, for an "addon" payment.
  addonCode: string | null
  // Branches bought: on top of the package's included one ("subscription"), or added ("branches").
  extraBranches: number
  // The coupon used, and the price before it (null when no coupon was used).
  couponId: string | null
  originalAmount: number | null
  discountHalalas: number | null
  amount: number
  currency: string
  moyasarPaymentId: string | null
  status: MoyasarPaymentStatus
  createdAt: string
  updatedAt: string
}

// The amount is never taken from the client -- it's resolved from the package's current price.
export interface CreateCheckoutIntentInput {
  application: MoyasarApplication
  packageId: string
  interval: BillingInterval
  extraBranches?: number
  couponCode?: string | null
}

// Buys a period of a paid add-on (subscriptions/addons.ts).
export interface CreateAddonCheckoutInput {
  addonCode: string
  interval: BillingInterval
}

// Adds branches to the organization's running POS / Madar Complete subscription.
export interface CreateBranchCheckoutInput {
  count: number
}

export interface CreateCheckoutIntentResult {
  checkoutId: string
  amount: number
  currency: string
  publishableKey: string
}

export interface ConfirmCheckoutInput {
  checkoutId: string
  moyasarPaymentId: string
}

// Mirrors the subset of Moyasar's payment object this codebase actually reads -- not the full
// API surface. See https://docs.moyasar.com/api/payments/01-create-payment for the complete shape.
export interface MoyasarPaymentObject {
  id: string
  status: string
  amount: number
  currency: string
  metadata: Record<string, unknown> | null
}

export interface MoyasarWebhookPayload {
  id: string
  type: string
  secret_token: string
  data: MoyasarPaymentObject
}

export type MoyasarApplication = "advertising" | "ecommerce" | "pos" | "madarApps"
export type MoyasarSelfServePlanTier = "starter" | "growth" | "pro"
export type MoyasarPaymentStatus = "initiated" | "paid" | "failed"

export interface MoyasarPaymentRecord {
  id: string
  organizationId: string
  requestedByUserId: string
  application: MoyasarApplication
  planTier: MoyasarSelfServePlanTier
  amount: number
  currency: string
  moyasarPaymentId: string | null
  status: MoyasarPaymentStatus
  createdAt: string
  updatedAt: string
}

export interface CreateCheckoutIntentInput {
  application: MoyasarApplication
  planTier: MoyasarSelfServePlanTier
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

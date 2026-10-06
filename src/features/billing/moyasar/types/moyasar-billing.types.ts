import type { ApplicationCategoryId } from "@/features/applications"

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
  application: ApplicationCategoryId
  planTier: MoyasarSelfServePlanTier
}

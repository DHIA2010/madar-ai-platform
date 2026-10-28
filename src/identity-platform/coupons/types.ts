import type { BillingInterval, PurchasableApplication } from "../subscriptions/types"

export type CouponDiscountType = "percentage" | "fixed"
// Derived at read time: disabled by staff, past its expiry, or out of uses.
export type CouponStatus = "active" | "disabled" | "expired" | "exhausted"

export interface Coupon {
  id: string
  code: string
  discountType: CouponDiscountType
  // Whole percent for "percentage"; halalas for "fixed".
  discountValue: number
  // Empty = every application (and the bundle).
  applications: PurchasableApplication[]
  // Empty = any package of the allowed applications.
  packageIds: string[]
  billingIntervals: BillingInterval[]
  usageLimit: number | null
  usedCount: number
  expiresAt: string | null
  isActive: boolean
  status: CouponStatus
  createdAt: string
}

export interface CouponInput {
  code: string
  discountType: CouponDiscountType
  discountValue: number
  applications: PurchasableApplication[]
  packageIds: string[]
  billingIntervals: BillingInterval[]
  usageLimit: number | null
  // The last day the coupon works (YYYY-MM-DD, Riyadh time), or null for no expiry.
  expiresOn: string | null
  isActive: boolean
}

export interface CouponQuote {
  couponId: string
  code: string
  originalAmountHalalas: number
  discountHalalas: number
  finalAmountHalalas: number
}

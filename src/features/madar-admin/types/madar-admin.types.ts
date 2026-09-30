import type { LucideIcon } from "lucide-react"

export type PlanTier = "starter" | "growth" | "pro" | "enterprise"

export type SubscriptionStatus = "active" | "trial" | "overdue" | "cancelled" | "expired"

export type PlatformKey = "Salla" | "Shopify" | "Zid" | "WooCommerce" | "Other"

export type PaymentMethod = "visa" | "mastercard" | "mada"

export interface MadarAdminCustomer {
  id: string
  name: string
  email: string
  storeName: string
  storeCount: number
  platform: PlatformKey
  plan: PlanTier
  status: SubscriptionStatus
  paymentMethod: PaymentMethod
  monthlyRevenue: number
  subscriptionDate: string
  renewalDate: string
  lastActivity: string
}

// Subscriptions is a subscription-centric view of the same underlying rows (one active
// subscription per customer in this mock dataset) -- kept as a type alias rather than a
// duplicate shape so the two list pages can never drift apart while this is still mock data.
export type MadarAdminSubscription = MadarAdminCustomer

export interface MadarPlanFeature {
  label: string
}

export interface MadarPlan {
  tier: PlanTier
  name: string
  icon: LucideIcon
  badgeLabel?: string
  priceLabel: string
  monthlyPrice: number | null
  billingSuffix?: string
  features: MadarPlanFeature[]
  customerCount: number
  isActive: boolean
}

export type CouponDiscountType = "percentage" | "fixed"
export type CouponStatus = "active" | "expired" | "disabled"

export interface Coupon {
  id: string
  code: string
  discountType: CouponDiscountType
  value: number
  usageLimit: number
  usedCount: number
  expiresAt: string
  status: CouponStatus
  applicablePlans: PlanTier[]
}

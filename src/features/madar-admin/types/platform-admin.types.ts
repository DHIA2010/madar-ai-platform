// Mirrors the backend's /v1/platform-admin/* contracts (src/identity-platform/platform-admin/
// types.ts) -- frontend code doesn't import backend modules, so they're restated here.

import type { PlanTier } from "./madar-admin.types"

import type { SubscriptionApplication } from "@/application/contracts/workspace.contracts"

export type AdminSubscriptionStatus = "active" | "trial" | "overdue" | "expired" | "cancelled"
export type AdminCustomerStatus = AdminSubscriptionStatus | "none"
export type BillingInterval = "monthly" | "yearly"
export type SubscriptionSource = "trial" | "payment" | "bank_transfer" | "admin" | "existing"
export type AdminStorePlatform = "salla" | "zid" | "shopify"

export interface AdminPage<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface AdminSubscriptionView {
  id: string
  organizationId: string
  application: SubscriptionApplication
  status: AdminSubscriptionStatus
  planTier: PlanTier | null
  billingInterval: BillingInterval | null
  priceHalalas: number | null
  currency: string
  source: SubscriptionSource
  startedAt: string
  currentPeriodEnd: string | null
  trialEndsAt: string | null
  cancelledAt: string | null
}

export interface AdminCustomer {
  id: string
  name: string
  createdAt: string
  owner: { userId: string; name: string; email: string } | null
  status: AdminCustomerStatus
  planTier: PlanTier | null
  subscriptions: AdminSubscriptionView[]
  monthlyRevenueHalalas: number
  storeCount: number
  platforms: AdminStorePlatform[]
  lastActivityAt: string | null
}

export interface AdminCustomerDetail extends AdminCustomer {
  members: Array<{ userId: string; name: string; email: string; role: string; status: string }>
  payments: Array<{
    id: string
    application: string
    planTier: string
    amountHalalas: number
    currency: string
    status: string
    createdAt: string
  }>
  activity: Array<{ action: string; actorName: string | null; createdAt: string }>
}

export interface AdminCustomerFilters {
  search?: string
  status?: AdminCustomerStatus | "all"
  planTier?: PlanTier | "all"
  platform?: AdminStorePlatform | "all"
  application?: SubscriptionApplication | "all"
}

export interface AdminCustomerSummary {
  total: number
  active: number
  trial: number
  overdue: number
  renewingSoon: number
}

export interface AdminSubscriptionRow extends AdminSubscriptionView {
  organizationName: string
  ownerEmail: string | null
  paymentMethod: string | null
}

export interface AdminSubscriptionFilters {
  search?: string
  status?: AdminSubscriptionStatus | "all"
  planTier?: PlanTier | "all"
  application?: SubscriptionApplication | "all"
}

export interface AdminSubscriptionSummary {
  total: number
  active: number
  trial: number
  overdue: number
  expired: number
  cancelled: number
}

export interface GrantSubscriptionInput {
  application: SubscriptionApplication
  planTier: PlanTier | null
  interval: BillingInterval
  priceHalalas: number | null
}

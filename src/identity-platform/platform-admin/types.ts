import type {
  BillingInterval,
  SubscriptionApplication,
  SubscriptionPlanTier,
  SubscriptionSource,
  SubscriptionStatus,
} from "../subscriptions/types"

export interface PageRequest {
  page: number
  pageSize: number
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export type StorePlatform = "salla" | "zid" | "shopify"

// The customer's overall standing across every app: the best of its subscriptions, or "none" when
// it has never had one (a sign-up that hasn't activated anything yet).
export type CustomerStatus = SubscriptionStatus | "none"

export interface PlatformAdminSubscriptionView {
  id: string
  organizationId: string
  application: SubscriptionApplication
  status: SubscriptionStatus
  planTier: SubscriptionPlanTier | null
  billingInterval: BillingInterval | null
  priceHalalas: number | null
  currency: string
  source: SubscriptionSource
  startedAt: string
  currentPeriodEnd: string | null
  trialEndsAt: string | null
  cancelledAt: string | null
}

export interface PlatformAdminCustomer {
  id: string
  name: string
  createdAt: string
  owner: { userId: string; name: string; email: string } | null
  status: CustomerStatus
  planTier: SubscriptionPlanTier | null
  subscriptions: PlatformAdminSubscriptionView[]
  monthlyRevenueHalalas: number
  storeCount: number
  platforms: StorePlatform[]
  lastActivityAt: string | null
}

export interface PlatformAdminCustomerFilters {
  search?: string
  status?: CustomerStatus
  application?: SubscriptionApplication
  planTier?: SubscriptionPlanTier
  platform?: StorePlatform
}

export interface PlatformAdminCustomerSummary {
  total: number
  active: number
  trial: number
  overdue: number
  // Paid periods (or trials) ending within the next 7 days.
  renewingSoon: number
}

export interface PlatformAdminCustomerDetail extends PlatformAdminCustomer {
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

export interface PlatformAdminSubscriptionRow extends PlatformAdminSubscriptionView {
  organizationName: string
  ownerEmail: string | null
  // Card brand of the latest successful Moyasar charge for this app ("mada", "visa", ...), or
  // "bank_transfer" / null when the subscription wasn't paid by card.
  paymentMethod: string | null
}

export interface PlatformAdminSubscriptionFilters {
  search?: string
  status?: SubscriptionStatus
  application?: SubscriptionApplication
  planTier?: SubscriptionPlanTier
}

export interface PlatformAdminSubscriptionSummary {
  total: number
  active: number
  trial: number
  overdue: number
  expired: number
  cancelled: number
}

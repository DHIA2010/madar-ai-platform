import type {
  BillingInterval,
  PurchasableApplication,
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
  application: PurchasableApplication
  status: SubscriptionStatus
  planTier: SubscriptionPlanTier | null
  packageId: string | null
  packageName: string | null
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
  application?: PurchasableApplication
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
  application?: PurchasableApplication
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

export interface PlatformAdminPayment {
  id: string
  method: "card" | "bank_transfer"
  organizationId: string
  organizationName: string
  application: PurchasableApplication
  packageName: string | null
  billingInterval: BillingInterval | null
  amountHalalas: number
  originalAmountHalalas: number | null
  discountHalalas: number | null
  couponCode: string | null
  status: "initiated" | "paid" | "failed"
  // "mada", "visa", ... for a card payment.
  cardBrand: string | null
  // Moyasar's payment id for a card, or the receipt attachment for a bank transfer.
  reference: string | null
  receiptId: string | null
  createdAt: string
}

export interface PlatformAdminPaymentFilters {
  search?: string
  status?: PlatformAdminPayment["status"]
  method?: PlatformAdminPayment["method"]
  application?: PurchasableApplication
  // YYYY-MM-DD, Riyadh time, inclusive.
  from?: string
  to?: string
}

export interface PlatformAdminPaymentSummary {
  collectedHalalas: number
  collectedThisMonthHalalas: number
  paidCount: number
  failedCount: number
  discountsHalalas: number
}

export interface PlatformAdminOverview {
  kpis: {
    customers: { value: number; deltaPct: number | null }
    stores: { value: number; deltaPct: number | null }
    activeSubscriptions: { value: number; deltaPct: number | null }
    mrrHalalas: { value: number; deltaPct: number | null }
    liveVisitors: { value: number; deltaPct: number | null }
  }
  // YYYY-MM, oldest first.
  trend: Array<{ month: string; revenueHalalas: number; newSubscriptions: number }>
  subscriptionsByApplication: Array<{ application: string; count: number }>
  subscriptionStatus: Array<{ status: SubscriptionStatus; count: number }>
  storesByPlatform: Array<{ platform: string; count: number }>
  today: {
    events: number
    purchases: number
    newCustomers: number
    paymentsToday: number
    integrationErrors: number
  }
  recentCustomers: Array<{
    id: string
    name: string
    createdAt: string
    status: CustomerStatus
    platforms: StorePlatform[]
  }>
  recentActivity: Array<{
    action: string
    organizationName: string | null
    actorName: string | null
    metadata: Record<string, unknown>
    createdAt: string
  }>
}

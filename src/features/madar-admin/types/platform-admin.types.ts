// Mirrors the backend's /v1/platform-admin/* contracts (src/identity-platform/platform-admin/
// types.ts) -- frontend code doesn't import backend modules, so they're restated here.

import type { PlanTier } from "./madar-admin.types"

import type { PurchasableApplication } from "@/application/contracts/workspace.contracts"

export type AdminSubscriptionStatus = "active" | "trial" | "overdue" | "expired" | "cancelled"
export type AdminCustomerStatus = AdminSubscriptionStatus | "none"
export type BillingInterval = "monthly" | "yearly"
export type SubscriptionSource =
  | "trial"
  | "payment"
  | "bank_transfer"
  | "admin"
  | "existing"
  | "free"
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
  application: PurchasableApplication
  status: AdminSubscriptionStatus
  planTier: PlanTier | null
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
  application?: PurchasableApplication | "all"
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
  application?: PurchasableApplication | "all"
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
  application: PurchasableApplication
  packageId: string | null
  interval: BillingInterval
  priceHalalas: number | null
}

export type PricingMode = "packages" | "fixed" | "contact" | "free"

export interface AdminPackage {
  id: string
  application: PurchasableApplication
  name: string
  description: string
  features: string[]
  monthlyPriceHalalas: number | null
  yearlyPriceHalalas: number | null
  isRecommended: boolean
  isActive: boolean
  sortOrder: number
  subscriberCount: number
}

export interface AdminApplicationPricing {
  application: PurchasableApplication
  mode: PricingMode
  // false = hidden from the customer marketplace (can't be bought or trialled).
  visible: boolean
  // Free mode: how many days a free activation lasts (1-365); null in every other mode.
  freeDays: number | null
  packages: AdminPackage[]
}

export interface PackageInput {
  name: string
  description: string
  features: string[]
  monthlyPriceHalalas: number | null
  yearlyPriceHalalas: number | null
  isRecommended: boolean
  isActive: boolean
}

export interface AdminPlatformSettings {
  platformName: string
  supportEmail: string
  announcementBanner: string
  maintenanceMode: boolean
  newSignupsEnabled: boolean
  trialDays: number
  renewalReminderDays: number
  gracePeriodDays: number
}

export type AdminCouponStatus = "active" | "disabled" | "expired" | "exhausted"

export interface AdminCoupon {
  id: string
  code: string
  discountType: "percentage" | "fixed"
  // Whole percent, or halalas for a fixed discount.
  discountValue: number
  // Empty = every application.
  applications: PurchasableApplication[]
  // Empty = any package of those applications.
  packageIds: string[]
  billingIntervals: BillingInterval[]
  usageLimit: number | null
  usedCount: number
  expiresAt: string | null
  isActive: boolean
  status: AdminCouponStatus
  createdAt: string
}

export interface AdminCouponInput {
  code: string
  discountType: "percentage" | "fixed"
  discountValue: number
  applications: PurchasableApplication[]
  packageIds: string[]
  billingIntervals: BillingInterval[]
  usageLimit: number | null
  // YYYY-MM-DD, the last day it works; null = no expiry.
  expiresOn: string | null
  isActive: boolean
}

export interface AdminPayment {
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
  cardBrand: string | null
  reference: string | null
  receiptId: string | null
  createdAt: string
}

export interface AdminPaymentFilters {
  search?: string
  status?: AdminPayment["status"] | "all"
  method?: AdminPayment["method"] | "all"
  application?: PurchasableApplication | "all"
  from?: string
  to?: string
}

export interface AdminPaymentSummary {
  collectedHalalas: number
  collectedThisMonthHalalas: number
  paidCount: number
  failedCount: number
  discountsHalalas: number
}

export interface AdminReceipt {
  id: string
  number: string
  organizationId: string
  sourceType: "card" | "bank_transfer"
  application: PurchasableApplication
  packageName: string | null
  billingInterval: BillingInterval | null
  amountHalalas: number
  originalAmountHalalas: number | null
  discountHalalas: number | null
  couponCode: string | null
  currency: string
  paymentMethod: string | null
  paymentReference: string | null
  customer: {
    name: string
    email: string | null
    taxNumber: string | null
    commercialRegistration: string | null
    phone: string | null
    address: string | null
  }
  paidAt: string
}

export interface AdminReceiptDetail extends AdminReceipt {
  seller: { name: string; email: string }
}

export type AdminProviderKey =
  | "google_ads"
  | "meta_ads"
  | "snapchat_ads"
  | "tiktok_ads"
  | "google_analytics"
  | "salla"
  | "zid"
  | "shopify"

export interface AdminStore {
  id: string
  platform: AdminStorePlatform
  accountId: string
  accountName: string | null
  organizationId: string
  organizationName: string
  connectionStatus: string
  isSelected: boolean
  lastSyncAt: string | null
  lastSyncStatus: string | null
  lastSyncError: string | null
}

export interface AdminStoreFilters {
  search?: string
  platform?: AdminStorePlatform | "all"
  status?: string
}

export interface AdminStoreSummary {
  total: number
  connected: number
  syncErrors: number
  byPlatform: Record<AdminStorePlatform, number>
}

export interface AdminIntegrations {
  providers: Array<{
    provider: AdminProviderKey
    category: "ads" | "analytics" | "ecommerce"
    total: number
    connected: number
    errored: number
    disconnected: number
    syncsLast24h: number
    failedSyncsLast24h: number
    lastSyncAt: string | null
  }>
  recentFailures: Array<{
    provider: AdminProviderKey
    connectionId: string
    organizationId: string
    organizationName: string
    errorMessage: string | null
    failedAt: string
  }>
}

export interface AdminTracking {
  eventsToday: number
  purchasesToday: number
  liveVisitorsNow: number
  trackingCustomersToday: number
  eventsByTypeToday: Record<string, number>
  last7Days: Array<{ day: string; events: number; purchases: number }>
  topCustomersToday: Array<{ organizationId: string; organizationName: string; events: number }>
}

export interface AdminSystemHealth {
  checkedAt: string
  database: { ok: boolean; latencyMs: number }
  cache: { ok: boolean | null }
  server: { uptimeSeconds: number; memoryMb: number; nodeVersion: string; version: string | null }
  outbox: { pending: number; oldestPendingAt: string | null; failed: number }
  scheduleFailuresLast7Days: number
  syncsLast24h: Array<{
    provider: AdminProviderKey
    total: number
    failed: number
    successRate: number | null
  }>
}

export type AdminStaffRole = "super_admin" | "operations" | "finance" | "support"

export interface AdminStaffMember {
  userId: string | null
  name: string | null
  email: string
  role: AdminStaffRole
  status: "active" | "disabled"
  isOwner: boolean
  addedAt: string | null
}

export interface AdminFeatureFlag {
  key: string
  description: string | null
  enabled: boolean
  rolloutPercentage: number | null
  overrides: Array<{ organizationId: string; organizationName: string; enabled: boolean }>
  updatedAt: string | null
}

export interface AdminOverview {
  kpis: {
    customers: { value: number; deltaPct: number | null }
    stores: { value: number; deltaPct: number | null }
    activeSubscriptions: { value: number; deltaPct: number | null }
    mrrHalalas: { value: number; deltaPct: number | null }
    liveVisitors: { value: number; deltaPct: number | null }
  }
  trend: Array<{ month: string; revenueHalalas: number; newSubscriptions: number }>
  subscriptionsByApplication: Array<{ application: PurchasableApplication; count: number }>
  subscriptionStatus: Array<{ status: AdminSubscriptionStatus; count: number }>
  storesByPlatform: Array<{ platform: AdminStorePlatform; count: number }>
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
    status: AdminCustomerStatus
    platforms: AdminStorePlatform[]
  }>
  recentActivity: Array<{
    action: string
    organizationName: string | null
    actorName: string | null
    metadata: Record<string, unknown>
    createdAt: string
  }>
}

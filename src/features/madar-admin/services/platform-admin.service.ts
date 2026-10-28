import type {
  AdminApplicationPricing,
  AdminCoupon,
  AdminCouponInput,
  AdminCustomer,
  AdminCustomerDetail,
  AdminCustomerFilters,
  AdminCustomerSummary,
  AdminFeatureFlag,
  AdminIntegrations,
  AdminOverview,
  AdminPackage,
  AdminPage,
  AdminPayment,
  AdminPaymentFilters,
  AdminPaymentSummary,
  AdminPlatformSettings,
  AdminReceipt,
  AdminReceiptDetail,
  AdminStaffMember,
  AdminStaffRole,
  AdminStore,
  AdminStoreFilters,
  AdminStoreSummary,
  AdminSubscriptionFilters,
  AdminSubscriptionRow,
  AdminSubscriptionSummary,
  AdminSubscriptionView,
  AdminSystemHealth,
  AdminTracking,
  BillingInterval,
  GrantSubscriptionInput,
  PackageInput,
  PricingMode,
} from "../types/platform-admin.types"

import type { PurchasableApplication } from "@/application/contracts"
import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// The Madar Admin console's backend (/v1/platform-admin/*). Cross-tenant, so no workspace header.
const PATH_SEPARATOR = String.fromCharCode(47)
const ENDPOINT = ["", "v1", "platform-admin"].join(PATH_SEPARATOR)

const sessionManager = createSessionManager()
const client = createHttpDataClient({ getSession: () => sessionManager.restore() })

// Drops empty and "all" filters so the backend only sees real ones.
function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "" || value === "all") continue
    search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ""
}

export const platformAdminService = {
  listCustomers(
    filters: AdminCustomerFilters,
    page: number,
    pageSize: number
  ): Promise<AdminPage<AdminCustomer>> {
    return client.get(`${ENDPOINT}/customers${toQuery({ ...filters, page, pageSize })}`)
  },

  getCustomerSummary(): Promise<AdminCustomerSummary> {
    return client.get(`${ENDPOINT}/customers/summary`)
  },

  getCustomer(organizationId: string): Promise<AdminCustomerDetail> {
    return client.get(`${ENDPOINT}/customers/${encodeURIComponent(organizationId)}`)
  },

  grantSubscription(
    organizationId: string,
    input: GrantSubscriptionInput
  ): Promise<AdminSubscriptionView> {
    return client.post(
      `${ENDPOINT}/customers/${encodeURIComponent(organizationId)}/subscriptions`,
      input
    )
  },

  listSubscriptions(
    filters: AdminSubscriptionFilters,
    page: number,
    pageSize: number
  ): Promise<AdminPage<AdminSubscriptionRow>> {
    return client.get(`${ENDPOINT}/subscriptions${toQuery({ ...filters, page, pageSize })}`)
  },

  getSubscriptionSummary(): Promise<AdminSubscriptionSummary> {
    return client.get(`${ENDPOINT}/subscriptions/summary`)
  },

  renewSubscription(
    subscriptionId: string,
    interval: BillingInterval
  ): Promise<AdminSubscriptionView> {
    return client.post(`${ENDPOINT}/subscriptions/${encodeURIComponent(subscriptionId)}/renew`, {
      interval,
    })
  },

  cancelSubscription(subscriptionId: string): Promise<AdminSubscriptionView> {
    return client.post(`${ENDPOINT}/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {})
  },

  getPricing(): Promise<AdminApplicationPricing[]> {
    return client.get(`${ENDPOINT}/pricing`)
  },

  // freeDays: free mode only (required there) -- days a free activation lasts, 1-365.
  setPricingMode(
    application: PurchasableApplication,
    mode: PricingMode,
    freeDays: number | null = null
  ): Promise<unknown> {
    return client.put(`${ENDPOINT}/pricing/${application}/mode`, { mode, freeDays })
  },

  setApplicationVisibility(
    application: PurchasableApplication,
    visible: boolean
  ): Promise<unknown> {
    return client.put(`${ENDPOINT}/pricing/${application}/visibility`, { visible })
  },

  createPackage(application: PurchasableApplication, input: PackageInput): Promise<AdminPackage> {
    return client.post(`${ENDPOINT}/pricing/${application}/packages`, input)
  },

  updatePackage(packageId: string, input: PackageInput): Promise<AdminPackage> {
    return client.patch(`${ENDPOINT}/packages/${encodeURIComponent(packageId)}`, input)
  },

  deletePackage(packageId: string): Promise<unknown> {
    return client.request({
      method: "DELETE",
      path: `${ENDPOINT}/packages/${encodeURIComponent(packageId)}`,
    })
  },

  reorderPackages(application: PurchasableApplication, packageIds: string[]): Promise<unknown> {
    return client.put(`${ENDPOINT}/pricing/${application}/order`, { packageIds })
  },

  getSettings(): Promise<AdminPlatformSettings> {
    return client.get(`${ENDPOINT}/settings`)
  },

  updateSettings(patch: Partial<AdminPlatformSettings>): Promise<AdminPlatformSettings> {
    return client.patch(`${ENDPOINT}/settings`, patch)
  },

  listCoupons(): Promise<AdminCoupon[]> {
    return client.get(`${ENDPOINT}/coupons`)
  },

  createCoupon(input: AdminCouponInput): Promise<AdminCoupon> {
    return client.post(`${ENDPOINT}/coupons`, input)
  },

  updateCoupon(couponId: string, input: AdminCouponInput): Promise<AdminCoupon> {
    return client.patch(`${ENDPOINT}/coupons/${encodeURIComponent(couponId)}`, input)
  },

  deleteCoupon(couponId: string): Promise<unknown> {
    return client.request({
      method: "DELETE",
      path: `${ENDPOINT}/coupons/${encodeURIComponent(couponId)}`,
    })
  },

  listPayments(
    filters: AdminPaymentFilters,
    page: number,
    pageSize: number
  ): Promise<AdminPage<AdminPayment>> {
    return client.get(`${ENDPOINT}/payments${toQuery({ ...filters, page, pageSize })}`)
  },

  getPaymentSummary(): Promise<AdminPaymentSummary> {
    return client.get(`${ENDPOINT}/payments/summary`)
  },

  listReceipts(
    filters: { search?: string },
    page: number,
    pageSize: number
  ): Promise<AdminPage<AdminReceipt>> {
    return client.get(`${ENDPOINT}/receipts${toQuery({ ...filters, page, pageSize })}`)
  },

  getReceipt(receiptId: string): Promise<AdminReceiptDetail> {
    return client.get(`${ENDPOINT}/receipts/${encodeURIComponent(receiptId)}`)
  },

  listStores(
    filters: AdminStoreFilters,
    page: number,
    pageSize: number
  ): Promise<AdminPage<AdminStore>> {
    return client.get(`${ENDPOINT}/stores${toQuery({ ...filters, page, pageSize })}`)
  },

  getStoreSummary(): Promise<AdminStoreSummary> {
    return client.get(`${ENDPOINT}/stores/summary`)
  },

  getIntegrations(): Promise<AdminIntegrations> {
    return client.get(`${ENDPOINT}/integrations`)
  },

  getTracking(): Promise<AdminTracking> {
    return client.get(`${ENDPOINT}/tracking`)
  },

  getSystemHealth(): Promise<AdminSystemHealth> {
    return client.get(`${ENDPOINT}/system-health`)
  },

  getRolePermissions(): Promise<Record<AdminStaffRole, string[]>> {
    return client.get(`${ENDPOINT}/roles`)
  },

  listStaff(): Promise<AdminStaffMember[]> {
    return client.get(`${ENDPOINT}/staff`)
  },

  addStaff(email: string, role: AdminStaffRole): Promise<unknown> {
    return client.post(`${ENDPOINT}/staff`, { email, role })
  },

  updateStaff(
    userId: string,
    patch: { role?: AdminStaffRole; status?: "active" | "disabled" }
  ): Promise<unknown> {
    return client.patch(`${ENDPOINT}/staff/${encodeURIComponent(userId)}`, patch)
  },

  listFeatureFlags(): Promise<AdminFeatureFlag[]> {
    return client.get(`${ENDPOINT}/feature-flags`)
  },

  createFeatureFlag(input: {
    key: string
    description: string | null
    enabled: boolean
    rolloutPercentage: number | null
  }): Promise<unknown> {
    return client.post(`${ENDPOINT}/feature-flags`, input)
  },

  updateFeatureFlag(
    key: string,
    input: { description: string | null; enabled: boolean; rolloutPercentage: number | null }
  ): Promise<unknown> {
    return client.patch(`${ENDPOINT}/feature-flags/${encodeURIComponent(key)}`, input)
  },

  setFeatureFlagOverride(
    key: string,
    organizationId: string,
    enabled: boolean | null
  ): Promise<unknown> {
    return client.put(`${ENDPOINT}/feature-flags/${encodeURIComponent(key)}/overrides`, {
      organizationId,
      enabled,
    })
  },

  deleteFeatureFlag(key: string): Promise<unknown> {
    return client.request({
      method: "DELETE",
      path: `${ENDPOINT}/feature-flags/${encodeURIComponent(key)}`,
    })
  },

  getOverview(): Promise<AdminOverview> {
    return client.get(`${ENDPOINT}/overview`)
  },
}

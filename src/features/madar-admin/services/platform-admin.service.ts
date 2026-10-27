import type {
  AdminCustomer,
  AdminCustomerDetail,
  AdminCustomerFilters,
  AdminCustomerSummary,
  AdminPage,
  AdminSubscriptionFilters,
  AdminSubscriptionRow,
  AdminSubscriptionSummary,
  AdminSubscriptionView,
  BillingInterval,
  GrantSubscriptionInput,
} from "../types/platform-admin.types"

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
}

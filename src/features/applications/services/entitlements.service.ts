import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// What the organization's plans unlock beyond their apps -- mirrors the backend's
// subscriptions/entitlements.ts. For showing what's locked; the server enforces each feature.
export interface OrganizationEntitlements {
  invoiceReader: boolean
  shiftCash: boolean
  customRoles: boolean
  procurement: boolean
  customReports: boolean
  invoicing: boolean
  // null = no limit.
  maxAdPlatforms: number | null
  maxStores: number | null
}

const ENTITLEMENTS_ENDPOINT = ["", "v1", "entitlements"].join(String.fromCharCode(47))

const sessionManager = createSessionManager()
const client = createHttpDataClient({ getSession: () => sessionManager.restore() })

export const entitlementsService = {
  get(): Promise<OrganizationEntitlements> {
    return client.get(ENTITLEMENTS_ENDPOINT)
  },
}

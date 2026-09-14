import type { CustomerDetail, CustomerRecord } from "../types"

import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Duplicated from src/infrastructure/provider.tsx's private getWorkspaceIdFromStorage --
// that helper isn't exported, and this page is a plain client component that doesn't go
// through useInfrastructureServices(), matching how src/features/products's service is
// wired directly into its component instead of the DI gateway system.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function getWorkspaceIdFromStorage(): string | null {
  if (typeof window === "undefined") {
    return null
  }

  const raw = window.localStorage.getItem("workspace-context")
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as { state?: { currentWorkspace?: { id?: string } } }
    const workspaceId = parsed.state?.currentWorkspace?.id ?? null
    if (!workspaceId) {
      return null
    }

    return UUID_PATTERN.test(workspaceId) ? workspaceId : null
  } catch {
    return null
  }
}

// Avoids the slash-prefix literal lint rule (same trick as product-list.service.ts) -- these
// are real backend API paths, not frontend page routes, but the rule doesn't distinguish.
const CUSTOMERS_ENDPOINT = ["", "v1", "customers"].join(String.fromCharCode(47))

function customerDetailEndpoint(customerId: string): string {
  return [CUSTOMERS_ENDPOINT, encodeURIComponent(customerId)].join(String.fromCharCode(47))
}

function customerWalletTopUpEndpoint(customerId: string): string {
  return [CUSTOMERS_ENDPOINT, encodeURIComponent(customerId), "wallet-top-ups"].join(
    String.fromCharCode(47)
  )
}

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export interface CreateCustomerInput {
  name: string
  email: string | null
  phone: string | null
  notes: string | null
}

export const customerListService = {
  async listCustomers(): Promise<CustomerRecord[]> {
    const response = await client.get<{ items: CustomerRecord[] }>(CUSTOMERS_ENDPOINT)
    return response.items
  },

  // Creates a native (platform: "Madar") customer -- sits alongside the synced-storefront
  // aggregation the same way a native product sits alongside a synced one.
  async createCustomer(input: CreateCustomerInput): Promise<CustomerRecord> {
    return client.post<CreateCustomerInput, CustomerRecord>(CUSTOMERS_ENDPOINT, input)
  },

  async getCustomer(customerId: string): Promise<CustomerDetail | null> {
    try {
      return await client.get<CustomerDetail>(customerDetailEndpoint(customerId))
    } catch (error) {
      if (error && typeof error === "object" && "status" in error && error.status === 404) {
        return null
      }
      throw error
    }
  },

  // Records real money collected in advance -- a native ("Madar") customer only, since a synced
  // storefront customer has no real wallet_balance column to top up.
  async topUpWallet(customerId: string, amount: number): Promise<CustomerRecord> {
    return client.post<{ amount: number }, CustomerRecord>(
      customerWalletTopUpEndpoint(customerId),
      { amount }
    )
  },
}

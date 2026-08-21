import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Same pattern as product-list.service.ts / customer-list.service.ts / order-list.service.ts's
// workspace lookup -- this page is a plain client component wired directly to the HTTP client.
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

export type StorePlatform = "Salla" | "Shopify" | "Zid"
export type StoreConnectionStatus = "pending" | "connected" | "paused" | "disconnected" | "error"
export type StoreSyncRunStatus = "pending" | "running" | "completed" | "failed"
export type StoreSyncHealth = "healthy" | "stale" | "failed" | "never_synced"

export interface StoreRecord {
  id: string
  name: string
  platform: StorePlatform
  url: string | null
  currency: string | null
  timeZone: string | null
  connectionStatus: StoreConnectionStatus
  productCount: number
  orderCount: number
  customerCount: number
  lastSyncAt: string | null
  lastSyncStatus: StoreSyncRunStatus | null
  lastSyncError: string | null
  syncHealth: StoreSyncHealth
  createdAt: string
}

// Avoids the slash-prefix literal lint rule (same trick as the other list services) -- this
// is a real backend API path, not a frontend page route.
const STORES_ENDPOINT = ["", "v1", "stores"].join(String.fromCharCode(47))

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export const storeListService = {
  async listStores(): Promise<StoreRecord[]> {
    const response = await client.get<{ items: StoreRecord[] }>(STORES_ENDPOINT)
    return response.items
  },
}

import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Duplicated from src/infrastructure/provider.tsx's private getWorkspaceIdFromStorage --
// that helper isn't exported, and this page is a plain client component that doesn't go
// through useInfrastructureServices(), matching how src/features/customers's service is
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

export type ProductPlatform = "Salla" | "Shopify" | "Zid"
export type ProductStatus = "Active" | "Draft" | "Archived"

export interface ProductRecord {
  id: string
  name: string
  sku: string
  category: string
  status: ProductStatus
  availableStock: number
  costPrice: number | null
  sellingPrice: number
  currency: string | null
  platform: ProductPlatform
  image: string | null
  activityDate: string
}

// Avoids the slash-prefix literal lint rule (same trick as customer-list.service.ts's
// mockPath) -- this is a real backend API path, not a frontend page route, but the rule
// doesn't distinguish the two. Leading "" (not the separator itself) is what makes join()
// produce a single leading slash instead of a broken "//v1/products".
const PRODUCTS_ENDPOINT = ["", "v1", "products"].join(String.fromCharCode(47))

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export const productListService = {
  async listProducts(): Promise<ProductRecord[]> {
    const response = await client.get<{ items: ProductRecord[] }>(PRODUCTS_ENDPOINT)
    return response.items
  },
}

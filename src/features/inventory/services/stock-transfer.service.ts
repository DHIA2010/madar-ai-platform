import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Same getWorkspaceIdFromStorage duplication convention as the products and purchases services.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function getWorkspaceIdFromStorage(): string | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem("workspace-context")
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { state?: { currentWorkspace?: { id?: string } } }
    const workspaceId = parsed.state?.currentWorkspace?.id ?? null
    return workspaceId && UUID_PATTERN.test(workspaceId) ? workspaceId : null
  } catch {
    return null
  }
}

const PATH_SEPARATOR = String.fromCharCode(47)
const INVENTORY_ENDPOINT = ["", "v1", "inventory"].join(PATH_SEPARATOR)

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export interface StockTransferItem {
  productId: string
  productName: string
  sku: string
  quantity: number
}

export interface StockTransfer {
  id: string
  reference: string
  fromWorkspaceId: string
  fromWorkspaceName: string
  toWorkspaceId: string
  toWorkspaceName: string
  transferDate: string
  notes: string
  items: StockTransferItem[]
  totalQuantity: number
  createdByName: string | null
  createdAt: string
}

export interface BranchStockItem {
  productId: string
  name: string
  sku: string
  quantity: number
}

export interface CreateStockTransferInput {
  fromWorkspaceId: string
  toWorkspaceId: string
  transferDate: string
  notes: string
  items: { productId: string; quantity: number }[]
}

export const stockTransferService = {
  async list(): Promise<StockTransfer[]> {
    const response = await client.get<{ items: StockTransfer[] }>(
      [INVENTORY_ENDPOINT, "transfers"].join(PATH_SEPARATOR)
    )
    return response.items
  },

  async create(input: CreateStockTransferInput): Promise<StockTransfer> {
    return client.post<CreateStockTransferInput, StockTransfer>(
      [INVENTORY_ENDPOINT, "transfers"].join(PATH_SEPARATOR),
      input
    )
  },

  // The organization's real branches (the browser's saved list can hold ones the server doesn't).
  async branches(): Promise<{ id: string; name: string }[]> {
    const response = await client.get<{ items: { id: string; name: string }[] }>(
      [INVENTORY_ENDPOINT, "branches"].join(PATH_SEPARATOR)
    )
    return response.items
  },

  // Every transferable product with its quantity in one branch.
  async branchStock(workspaceId: string): Promise<BranchStockItem[]> {
    const response = await client.get<{ items: BranchStockItem[] }>(
      `${[INVENTORY_ENDPOINT, "branch-stock"].join(PATH_SEPARATOR)}?workspaceId=${encodeURIComponent(workspaceId)}`
    )
    return response.items
  },
}

import { INVENTORY_ENDPOINT, inventoryClient, PATH_SEPARATOR } from "./inventory-client"

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
    const response = await inventoryClient.get<{ items: StockTransfer[] }>(
      [INVENTORY_ENDPOINT, "transfers"].join(PATH_SEPARATOR)
    )
    return response.items
  },

  async create(input: CreateStockTransferInput): Promise<StockTransfer> {
    return inventoryClient.post<CreateStockTransferInput, StockTransfer>(
      [INVENTORY_ENDPOINT, "transfers"].join(PATH_SEPARATOR),
      input
    )
  },

  // The organization's real branches (the browser's saved list can hold ones the server doesn't).
  async branches(): Promise<{ id: string; name: string }[]> {
    const response = await inventoryClient.get<{ items: { id: string; name: string }[] }>(
      [INVENTORY_ENDPOINT, "branches"].join(PATH_SEPARATOR)
    )
    return response.items
  },

  // Every transferable product with its quantity in one branch.
  async branchStock(workspaceId: string): Promise<BranchStockItem[]> {
    const response = await inventoryClient.get<{ items: BranchStockItem[] }>(
      `${[INVENTORY_ENDPOINT, "branch-stock"].join(PATH_SEPARATOR)}?workspaceId=${encodeURIComponent(workspaceId)}`
    )
    return response.items
  },
}

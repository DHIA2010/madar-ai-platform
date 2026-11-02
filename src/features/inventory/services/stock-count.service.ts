import { INVENTORY_ENDPOINT, inventoryClient, PATH_SEPARATOR } from "./inventory-client"

export type StockCountStatus = "draft" | "completed"

export interface StockCountItem {
  productId: string
  productName: string
  sku: string
  systemQuantity: number
  countedQuantity: number
  difference: number
  unitCost: number | null
}

export interface StockCount {
  id: string
  reference: string
  workspaceId: string
  workspaceName: string
  countDate: string
  status: StockCountStatus
  notes: string
  items: StockCountItem[]
  differences: number
  netDifference: number
  netDifferenceValue: number
  createdByName: string | null
  completedByName: string | null
  createdAt: string
  completedAt: string | null
}

export interface SaveStockCountInput {
  countDate: string
  notes: string
  items: { productId: string; countedQuantity: number }[]
}

const COUNTS_ENDPOINT = [INVENTORY_ENDPOINT, "stock-counts"].join(PATH_SEPARATOR)
const countPath = (id: string, ...rest: string[]) =>
  [COUNTS_ENDPOINT, encodeURIComponent(id), ...rest].join(PATH_SEPARATOR)

export const stockCountService = {
  async list(): Promise<StockCount[]> {
    const response = await inventoryClient.get<{ items: StockCount[] }>(COUNTS_ENDPOINT)
    return response.items
  },

  get(id: string): Promise<StockCount> {
    return inventoryClient.get<StockCount>(countPath(id))
  },

  create(input: SaveStockCountInput & { workspaceId: string }): Promise<StockCount> {
    return inventoryClient.post<SaveStockCountInput & { workspaceId: string }, StockCount>(
      COUNTS_ENDPOINT,
      input
    )
  },

  update(id: string, input: SaveStockCountInput): Promise<StockCount> {
    return inventoryClient.patch<SaveStockCountInput, StockCount>(countPath(id), input)
  },

  async remove(id: string): Promise<void> {
    await inventoryClient.delete<unknown>(countPath(id))
  },

  // Sets each counted product's stock in the branch to its counted quantity, and locks the count.
  complete(id: string): Promise<StockCount> {
    return inventoryClient.post<Record<string, never>, StockCount>(countPath(id, "complete"), {})
  },
}

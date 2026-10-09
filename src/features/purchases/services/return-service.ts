import type { PurchaseReturn, ReturnFormValues } from "../types"

import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

const PATH_SEPARATOR = String.fromCharCode(47)
const RETURNS_ENDPOINT = ["", "v1", "purchase-returns"].join(PATH_SEPARATOR)

const sessionManager = createSessionManager()
const client = createHttpDataClient({ getSession: () => sessionManager.restore() })

// "الفرع" (shown in the UI) is really just the workspace a purchase/return belongs to -- there's
// no separate warehouses table (see identity-platform/migrations/094_procurement.sql's own
// comment, the field/column is still named warehouseId). The backend DTO carries warehouseId
// only; the name is resolved client-side from the same workspace-context localStorage the Zustand
// workspace store already persists to (same getWorkspaceIdFromStorage duplication convention
// purchase-service.ts follows).
function getAvailableWorkspacesFromStorage(): Array<{ id: string; name: string }> {
  if (typeof window === "undefined") return []
  const raw = window.localStorage.getItem("workspace-context")
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as {
      state?: { availableWorkspaces?: Array<{ id: string; name: string }> }
    }
    return parsed.state?.availableWorkspaces ?? []
  } catch {
    return []
  }
}

type PurchaseReturnDto = Omit<PurchaseReturn, "warehouseName">

function withWarehouseName(dto: PurchaseReturnDto): PurchaseReturn {
  const warehouseName =
    getAvailableWorkspacesFromStorage().find((workspace) => workspace.id === dto.warehouseId)
      ?.name ?? dto.warehouseId
  return { ...dto, warehouseName }
}

export const returnService = {
  async list(): Promise<PurchaseReturn[]> {
    const response = await client.get<{ items: PurchaseReturnDto[] }>(RETURNS_ENDPOINT)
    return response.items.map(withWarehouseName)
  },

  // unitCost/productName/sku/status are all resolved server-side (status from comparing the
  // submitted items against the original purchase, see returns-repository.ts) -- the client only
  // ever sends which product and how many units.
  async create(values: ReturnFormValues): Promise<PurchaseReturn> {
    const dto = await client.post<
      {
        purchaseId: string
        warehouseId: string
        items: Array<{ productId: string; qty: number }>
        returnDate: string
        notes: string
      },
      PurchaseReturnDto
    >(RETURNS_ENDPOINT, {
      purchaseId: values.purchaseId,
      warehouseId: values.warehouseId,
      items: values.items.map((item) => ({ productId: item.productId, qty: item.qty })),
      returnDate: values.returnDate,
      notes: values.notes,
    })
    return withWarehouseName(dto)
  },
}

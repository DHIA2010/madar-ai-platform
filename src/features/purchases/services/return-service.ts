import type { PurchaseReturn, ReturnFormValues, ReturnStatus } from "../types"
import { WAREHOUSES } from "./warehouses"

import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

const PATH_SEPARATOR = String.fromCharCode(47)
const RETURNS_ENDPOINT = ["", "v1", "purchase-returns"].join(PATH_SEPARATOR)

const sessionManager = createSessionManager()
const client = createHttpDataClient({ getSession: () => sessionManager.restore() })

type PurchaseReturnDto = Omit<PurchaseReturn, "warehouseName">

function withWarehouseName(dto: PurchaseReturnDto): PurchaseReturn {
  const warehouseName = WAREHOUSES.find((wh) => wh.id === dto.warehouseId)?.name ?? dto.warehouseId
  return { ...dto, warehouseName }
}

export const returnService = {
  async list(): Promise<PurchaseReturn[]> {
    const response = await client.get<{ items: PurchaseReturnDto[] }>(RETURNS_ENDPOINT)
    return response.items.map(withWarehouseName)
  },

  // unitCost/productName/sku are resolved server-side from the original purchase line -- the
  // client only ever sends which product and how many units.
  async create(values: ReturnFormValues): Promise<PurchaseReturn> {
    const dto = await client.post<
      {
        purchaseId: string
        warehouseId: string
        items: Array<{ productId: string; qty: number }>
        status: ReturnStatus
        returnDate: string
        notes: string
      },
      PurchaseReturnDto
    >(RETURNS_ENDPOINT, {
      purchaseId: values.purchaseId,
      warehouseId: values.warehouseId,
      items: values.items.map((item) => ({ productId: item.productId, qty: item.qty })),
      status: values.status,
      returnDate: values.returnDate,
      notes: values.notes,
    })
    return withWarehouseName(dto)
  },

  async setStatus(id: string, status: ReturnStatus): Promise<PurchaseReturn> {
    const dto = await client.patch<{ status: ReturnStatus }, PurchaseReturnDto>(
      [RETURNS_ENDPOINT, encodeURIComponent(id), "status"].join(PATH_SEPARATOR),
      { status }
    )
    return withWarehouseName(dto)
  },
}

import type { Purchase, PurchaseFormValues } from "../types"

import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Same getWorkspaceIdFromStorage duplication convention as
// src/features/suppliers/services/supplier-service.ts and src/features/products' own service.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function getWorkspaceIdFromStorage(): string | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem("workspace-context")
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { state?: { currentWorkspace?: { id?: string } } }
    const workspaceId = parsed.state?.currentWorkspace?.id ?? null
    if (!workspaceId) return null
    return UUID_PATTERN.test(workspaceId) ? workspaceId : null
  } catch {
    return null
  }
}

// "الفرع" (shown in the UI) is really just the workspace a purchase belongs to -- there's no
// separate warehouses table (see identity-platform/migrations/094_procurement.sql's own comment,
// the field/column is still named warehouseId). The backend DTO carries warehouseId only; the
// name is resolved client-side from the same workspace-context localStorage the Zustand
// workspace store already persists to.
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

const PATH_SEPARATOR = String.fromCharCode(47)
const PURCHASES_ENDPOINT = ["", "v1", "purchases"].join(PATH_SEPARATOR)

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

// The backend DTO carries warehouseId only (no warehouses table exists) -- warehouseName is
// resolved client-side from the real workspaces list (see getAvailableWorkspacesFromStorage).
type PurchaseDto = Omit<Purchase, "warehouseName">

function withWarehouseName(dto: PurchaseDto): Purchase {
  const warehouseName =
    getAvailableWorkspacesFromStorage().find((workspace) => workspace.id === dto.warehouseId)
      ?.name ?? dto.warehouseId
  return { ...dto, warehouseName }
}

// The backend only needs productId + the line's own cost/qty/discount/tax -- id/productName/sku
// are server-resolved (id generated, productName/sku read from the real product row), never
// trusted from the client.
function toLineItemPayload(items: PurchaseFormValues["items"]) {
  return items.map((item) => ({
    productId: item.productId,
    netUnitCost: item.netUnitCost,
    qty: item.qty,
    discount: item.discount,
    taxPercent: item.taxPercent,
  }))
}

function toSavePayload(values: PurchaseFormValues) {
  return {
    supplierId: values.supplierId,
    warehouseId: values.warehouseId,
    date: values.date,
    dueDate: values.dueDate.trim() || null,
    deliveryDate: values.deliveryDate.trim() || null,
    status: values.status,
    items: toLineItemPayload(values.items),
    orderTaxPercent: values.orderTaxPercent,
    discountAmount: values.discountAmount,
    shippingAmount: values.shippingAmount,
    otherCosts: values.otherCosts,
    currency: values.currency,
    paymentMethod: values.paymentMethod,
    referenceNumber: values.referenceNumber,
    note: values.note,
  }
}

export const purchaseService = {
  async list(): Promise<Purchase[]> {
    const response = await client.get<{ items: PurchaseDto[] }>(PURCHASES_ENDPOINT)
    return response.items.map(withWarehouseName)
  },

  async get(id: string): Promise<Purchase> {
    const dto = await client.get<PurchaseDto>(
      [PURCHASES_ENDPOINT, encodeURIComponent(id)].join(PATH_SEPARATOR)
    )
    return withWarehouseName(dto)
  },

  async create(values: PurchaseFormValues): Promise<Purchase> {
    const dto = await client.post<ReturnType<typeof toSavePayload>, PurchaseDto>(
      PURCHASES_ENDPOINT,
      toSavePayload(values)
    )
    return withWarehouseName(dto)
  },

  async update(id: string, values: PurchaseFormValues): Promise<Purchase> {
    const dto = await client.patch<ReturnType<typeof toSavePayload>, PurchaseDto>(
      [PURCHASES_ENDPOINT, encodeURIComponent(id)].join(PATH_SEPARATOR),
      toSavePayload(values)
    )
    return withWarehouseName(dto)
  },
}

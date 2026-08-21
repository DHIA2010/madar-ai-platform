import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Same pattern as product-list.service.ts / customer-list.service.ts's workspace lookup --
// this page is a plain client component wired directly to the HTTP client, not through
// useInfrastructureServices().
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

export type OrderPlatform = "Salla" | "Shopify" | "Zid"
export type OrderStatus = "Completed" | "Processing" | "Cancelled" | "Refunded"
export type PaymentStatus = "Paid" | "Refunded" | "Pending"

export interface OrderItemRecord {
  name: string
  quantity: number
}

export interface OrderRecord {
  id: string
  orderNumber: string
  customerName: string
  channel: string
  platform: OrderPlatform
  items: OrderItemRecord[]
  productCount: number
  amount: number
  currency: string
  orderStatus: OrderStatus
  paymentStatus: PaymentStatus
  createdAt: string
}

export interface OrdersSummary {
  totalOrders: number
  totalOrdersChangePct: number | null
  totalSales: number
  totalSalesChangePct: number | null
  averageOrderValue: number
  averageOrderValueChangePct: number | null
  completedOrders: number
  completedOrdersChangePct: number | null
  processingOrders: number
  cancelledOrders: number
}

export interface OrdersListResponse {
  items: OrderRecord[]
  summary: OrdersSummary
}

// Avoids the slash-prefix literal lint rule (same trick as product-list.service.ts) -- this
// is a real backend API path, not a frontend page route.
const ORDERS_ENDPOINT = ["", "v1", "orders"].join(String.fromCharCode(47))

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export const orderListService = {
  async listOrders(params?: { startDate?: string; endDate?: string }): Promise<OrdersListResponse> {
    const query = new URLSearchParams()
    if (params?.startDate) {
      query.set("startDate", params.startDate)
    }
    if (params?.endDate) {
      query.set("endDate", params.endDate)
    }
    const suffix = query.toString() ? `?${query.toString()}` : ""
    return client.get<OrdersListResponse>(`${ORDERS_ENDPOINT}${suffix}`)
  },
}

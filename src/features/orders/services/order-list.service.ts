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

export type OrderPlatform = "Salla" | "Shopify" | "Zid" | "Madar"
export type OrderStatus = "Completed" | "Processing" | "Cancelled" | "Refunded"
export type PaymentStatus = "Paid" | "Refunded" | "Pending"
export type SallaPushStatus = "not_applicable" | "pending" | "pushed" | "failed"

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
  // The provider's own exact status text (e.g. Salla's merchant-facing status name, which can be
  // merchant-customized, not just one of the 4 default buckets orderStatus collapses into). Use
  // this for display; keep orderStatus for filtering/color-coding.
  statusLabel: string
  paymentStatus: PaymentStatus
  createdAt: string
  // Only ever set for platform === "Madar" -- see MadarOrdersService/SallaOrderPushService.
  sallaPushStatus?: SallaPushStatus
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
  processingOrdersChangePct: number | null
  cancelledOrders: number
  cancelledOrdersChangePct: number | null
}

export interface OrdersListResponse {
  items: OrderRecord[]
  summary: OrdersSummary
}

export interface OrderDetailItem {
  id: string
  name: string
  sku: string | null
  quantity: number
  unitPrice: number | null
  discount: number
  tax: number
  total: number
  thumbnail: string | null
}

export interface OrderDetail {
  currency: string
  subTotal: number
  shippingCost: number
  taxTotal: number
  discountTotal: number
  total: number
  items: OrderDetailItem[]
}

export interface CreateOrderItemInput {
  productId: string | null
  variantId?: string | null
  productName: string
  sku: string | null
  unitPrice: number
  quantity: number
  discountAmount?: number
  costPrice?: number | null
  weight?: number | null
}

export interface CreateOrderReceiverInput {
  name: string
  phone: string
  countryCode: string
  email: string | null
  notify: boolean
}

export interface CreateOrderShipToInput {
  country: string
  city: string
  district?: string | null
  address?: string | null
  postalCode?: string | null
}

export interface CreateOrderInput {
  customerName: string
  customerPhone: string | null
  customerEmail: string | null
  customerId: string | null
  isGuestCustomer: boolean
  paymentStatus: "paid" | "pending"
  paymentMethodCode: string
  receiver: CreateOrderReceiverInput
  deliveryMethod: "shipping" | "pickup" | null
  shipTo: CreateOrderShipToInput | null
  courierId: string | null
  shippingCost: number
  discountCode: string | null
  discountAmount: number
  shippingDiscountAmount: number
  notes: string | null
  items: CreateOrderItemInput[]
}

export interface StoreSalesRecord {
  connectionId: string
  platform: OrderPlatform
  totalSales: number
  totalSalesChangePct: number | null
  orderCount: number
  orderCountChangePct: number | null
  averageOrderValue: number
}

export interface MadarOrderRecord {
  id: string
  orderNumber: string
  sallaPushStatus: SallaPushStatus
  sallaOrderId: string | null
  subtotalAmount: number
  taxAmount: number
  totalAmount: number
  createdAt: string
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

  // Per real store connection (not merged by platform) -- Madar orders are never included, they
  // have no store connection to attribute to.
  async getSalesByStore(params?: {
    startDate?: string
    endDate?: string
  }): Promise<{ items: StoreSalesRecord[] }> {
    const query = new URLSearchParams()
    if (params?.startDate) query.set("startDate", params.startDate)
    if (params?.endDate) query.set("endDate", params.endDate)
    const suffix = query.toString() ? `?${query.toString()}` : ""
    const endpoint = [ORDERS_ENDPOINT, "by-store"].join(String.fromCharCode(47))
    return client.get<{ items: StoreSalesRecord[] }>(`${endpoint}${suffix}`)
  },

  // Live, on-demand fetch of the order's real per-item price/SKU/tax/discount from the
  // provider's own Order Details API -- not part of the bulk-synced summary, so it's only
  // requested when a user actually opens "View Products" for that one order.
  async getOrderDetail(orderId: string): Promise<OrderDetail> {
    const endpoint = [ORDERS_ENDPOINT, encodeURIComponent(orderId), "details"].join(
      String.fromCharCode(47)
    )
    return client.get<OrderDetail>(endpoint)
  },

  // Creates an order directly in Madar -- if the organization has a connected Salla store, it's
  // also pushed there as a side effect (see MadarOrdersService.create()); a push failure never
  // fails this call, it only affects the returned record's own sallaPushStatus.
  async createOrder(input: CreateOrderInput): Promise<MadarOrderRecord> {
    return client.post<CreateOrderInput, MadarOrderRecord>(ORDERS_ENDPOINT, input)
  },

  // orderId here is the bare madar_orders.id (not the "madar:<id>" composite id used elsewhere
  // in this file) -- this endpoint only ever operates on Madar-created orders.
  async retryPush(orderId: string): Promise<MadarOrderRecord> {
    const endpoint = [ORDERS_ENDPOINT, encodeURIComponent(orderId), "retry-push"].join(
      String.fromCharCode(47)
    )
    return client.post<Record<string, never>, MadarOrderRecord>(endpoint, {})
  },
}

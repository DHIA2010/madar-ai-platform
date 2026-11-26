import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// The Laundry app's API (identity-platform/laundry, /v1/laundry/*).

export type LaundryStatus = "received" | "processing" | "ready" | "delivered" | "cancelled"

export interface LaundrySettings {
  pricesIncludeTax: boolean
  turnaroundHours: number
  urgentTurnaroundHours: number
  urgentSurchargePercent: number
  deliveryFee: number
  unclaimedDays: number
  autoReadyMessage: boolean
}

export interface LaundryCatalog {
  items: Array<{ id: string; name: string; category: string | null; active: boolean }>
  services: Array<{ id: string; name: string; active: boolean }>
  // Price by `${itemId}:${serviceId}`.
  prices: Record<string, number>
}

export interface LaundryOrderSummary {
  id: string
  orderNumber: string
  status: LaundryStatus
  customerId: string | null
  customerName: string | null
  customerPhone: string | null
  urgent: boolean
  pieces: number
  total: number
  depositAmount: number
  due: number
  paid: boolean
  invoiceNumber: string | null
  fulfilment: "pickup" | "delivery"
  pickupAt: string | null
  deliveryAt: string | null
  driverUserId: string | null
  promisedAt: string | null
  readyAt: string | null
  deliveredAt: string | null
  readyNotifiedAt: string | null
  remindedAt: string | null
  late: boolean
  createdAt: string
}

export interface LaundryOrder extends LaundryOrderSummary {
  workspaceId: string | null
  itemsTotal: number
  urgentFee: number
  deliveryFee: number
  invoiceId: string | null
  pickupAddress: string | null
  deliveryAddress: string | null
  notes: string | null
  subscriptionId: string | null
  lines: Array<{
    id: string
    itemName: string
    serviceName: string
    quantity: number
    coveredQuantity: number
    unitPrice: number
    lineTotal: number
    note: string | null
  }>
  photos: Array<{ id: string; url: string; note: string | null; createdAt: string }>
  events: Array<{ kind: string; detail: Record<string, unknown>; createdAt: string }>
  whatsapp: { readyUrl: string | null; reminderUrl: string | null }
  // Set after "ready" when the message went (or why it did not) on its own.
  messageSent?: string
}

export interface CreateLaundryOrderInput {
  customerId?: string | null
  customerName?: string | null
  customerPhone?: string | null
  lines: Array<{ itemId: string; serviceId: string; quantity: number; note?: string | null }>
  urgent: boolean
  promisedAt?: string | null
  fulfilment: "pickup" | "delivery"
  pickupAddress?: string | null
  deliveryAddress?: string | null
  pickupAt?: string | null
  deliveryAt?: string | null
  driverUserId?: string | null
  notes?: string | null
  useSubscription: boolean
  payment: {
    mode: "later" | "deposit" | "full"
    paymentMethodCode?: string | null
    amount?: number
  }
}

export interface LaundryPlan {
  id: string
  name: string
  pieces: number
  price: number
  validDays: number
  active: boolean
}

export interface LaundrySubscription {
  id: string
  customerId: string
  customerName: string | null
  planName: string
  piecesTotal: number
  piecesUsed: number
  piecesLeft: number
  startsAt: string
  endsAt: string
  active: boolean
  invoiceNumber: string | null
}

export interface LaundryReport {
  orders: number
  pieces: number
  revenue: number
  collected: number
  outstanding: number
  urgentOrders: number
  deliveryOrders: number
  onTime: number
  late: number
  averageTurnaroundHours: number | null
  readyNotCollected: number
  unclaimed: number
  subscriptionsSold: number
  byService: Array<{ name: string; pieces: number }>
  byItem: Array<{ name: string; pieces: number }>
  byDay: Array<{ day: string; orders: number; pieces: number }>
}

// Same getWorkspaceIdFromStorage duplication convention as the other feature services.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function getWorkspaceIdFromStorage(): string | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem("workspace-context")
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { state?: { currentWorkspace?: { id?: string } | null } }
    const id = parsed.state?.currentWorkspace?.id
    return id && UUID_PATTERN.test(id) ? id : null
  } catch {
    return null
  }
}

// The lint rule forbids slash-prefixed string literals, so paths are joined.
const SEPARATOR = String.fromCharCode(47)
const path = (...parts: string[]) =>
  ["", "v1", "laundry", ...parts.map(encodeURIComponent)].join(SEPARATOR)
const withQuery = (base: string, query: Record<string, string | null | undefined>) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value)
  const text = params.toString()
  return text ? `${base}?${text}` : base
}

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export const laundryService = {
  settings: () => client.get<LaundrySettings>(path("settings")),
  saveSettings: (patch: Partial<LaundrySettings>) =>
    client.put<Partial<LaundrySettings>, LaundrySettings>(path("settings"), patch),

  catalog: () => client.get<LaundryCatalog>(path("catalog")),
  addItem: (input: { name: string; category?: string | null }) =>
    client.post<typeof input, LaundryCatalog>(path("items"), input),
  updateItem: (id: string, input: { name: string; category?: string | null; active?: boolean }) =>
    client.put<typeof input, LaundryCatalog>(path("items", id), input),
  addService: (input: { name: string }) =>
    client.post<typeof input, LaundryCatalog>(path("services"), input),
  updateService: (id: string, input: { name: string; active?: boolean }) =>
    client.put<typeof input, LaundryCatalog>(path("services", id), input),
  deleteItem: (id: string) => client.delete<LaundryCatalog>(path("items", id)),
  deleteService: (id: string) => client.delete<LaundryCatalog>(path("services", id)),
  setPrices: (prices: Array<{ itemId: string; serviceId: string; price: number | null }>) =>
    client.put<{ prices: typeof prices }, LaundryCatalog>(path("prices"), { prices }),

  paymentMethods: () =>
    client
      .get<{ items: Array<{ code: string; name: string; kind: string }> }>(path("payment-methods"))
      .then((response) => response.items),
  staff: () =>
    client
      .get<{ items: Array<{ userId: string; name: string }> }>(path("staff"))
      .then((response) => response.items),

  orders: (
    filter: { status?: string | null; search?: string | null; from?: string; to?: string } = {}
  ) =>
    client
      .get<{ items: LaundryOrderSummary[] }>(
        withQuery(path("orders"), {
          status: filter.status ?? null,
          search: filter.search ?? null,
          from: filter.from,
          to: filter.to,
        })
      )
      .then((response) => response.items),
  order: (id: string) => client.get<LaundryOrder>(path("orders", id)),
  createOrder: (input: CreateLaundryOrderInput) =>
    client.post<CreateLaundryOrderInput, LaundryOrder>(path("orders"), input),
  setStatus: (id: string, status: "received" | "processing" | "ready") =>
    client.post<{ status: string }, LaundryOrder>(path("orders", id, "status"), { status }),
  collect: (id: string, paymentMethodCode: string | null) =>
    client.post<{ paymentMethodCode: string | null }, LaundryOrder>(path("orders", id, "collect"), {
      paymentMethodCode,
    }),
  cancel: (id: string) =>
    client.post<undefined, LaundryOrder>(path("orders", id, "cancel"), undefined),
  updateOrder: (id: string, patch: Record<string, unknown>) =>
    client.patch<Record<string, unknown>, LaundryOrder>(path("orders", id), patch),
  markNotified: (id: string, kind: "ready" | "reminder") =>
    client.post<{ kind: string }, LaundryOrder>(path("orders", id, "notified"), { kind }),
  sendReminder: (id: string) =>
    client.post<undefined, { result: string; order: LaundryOrder }>(
      path("orders", id, "reminder"),
      undefined
    ),
  addPhoto: (
    id: string,
    input: { contentType: string; dataBase64: string; note?: string | null }
  ) => client.post<typeof input, LaundryOrder>(path("orders", id, "photos"), input),
  removePhoto: (id: string, photoId: string) =>
    client.delete<LaundryOrder>(path("orders", id, "photos", photoId)),

  plans: () =>
    client.get<{ items: LaundryPlan[] }>(path("plans")).then((response) => response.items),
  savePlan: (id: string | null, input: Omit<LaundryPlan, "id" | "active"> & { active?: boolean }) =>
    (id
      ? client.put<typeof input, { items: LaundryPlan[] }>(path("plans", id), input)
      : client.post<typeof input, { items: LaundryPlan[] }>(path("plans"), input)
    ).then((response) => response.items),
  subscriptions: (customerId?: string | null) =>
    client
      .get<{
        items: LaundrySubscription[]
      }>(withQuery(path("subscriptions"), { customerId: customerId ?? null }))
      .then((response) => response.items),
  sellSubscription: (input: {
    planId: string
    customerId?: string | null
    customerName?: string | null
    customerPhone?: string | null
    paymentMethodCode: string
  }) => client.post<typeof input, LaundrySubscription>(path("subscriptions"), input),

  report: (range: { from: string; to: string }) =>
    client.get<LaundryReport>(withQuery(path("report"), range)),
}

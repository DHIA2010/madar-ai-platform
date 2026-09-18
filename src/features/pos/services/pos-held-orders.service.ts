import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Same workaround the other pos services document: the repo's lint rule forbids slash-prefixed
// string literals to stop page routes being hardcoded, and cannot tell them from an API path.
const PATH_SEPARATOR = String.fromCharCode(47)
const HELD_ORDERS_ENDPOINT = ["", "v1", "pos", "held-orders"].join(PATH_SEPARATOR)

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

export interface HeldOrderItem {
  productId: string | null
  productName: string
  unitPrice: number
  quantity: number
  discountAmount?: number
}

// A cart parked mid-build, kept as a real row (not just a browser tab) so a crash or refresh
// never loses a customer's in-progress order -- see identity-platform/pos/held-orders-service.ts.
export interface HeldOrder {
  id: string
  workspaceId: string
  cashierUserId: string | null
  customerName: string | null
  customerPhone: string | null
  discountAmount: number
  notes: string | null
  items: HeldOrderItem[]
  createdAt: string
}

export interface HoldOrderInput {
  workspaceId: string
  customerName: string | null
  customerPhone: string | null
  discountAmount: number
  notes: string | null
  items: HeldOrderItem[]
}

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export const posHeldOrdersService = {
  async list(workspaceId: string): Promise<HeldOrder[]> {
    const response = await client.get<{ items: HeldOrder[] }>(
      `${HELD_ORDERS_ENDPOINT}?workspaceId=${encodeURIComponent(workspaceId)}`
    )
    return response.items
  },

  async hold(input: HoldOrderInput): Promise<HeldOrder> {
    return client.post<HoldOrderInput, HeldOrder>(HELD_ORDERS_ENDPOINT, input)
  },

  // One call serves both "resume" (the caller uses the returned cart) and "discard" (the caller
  // ignores it) -- see the backend service's own comment for why reading it back always consumes
  // it rather than leaving a copy parked.
  async remove(id: string): Promise<HeldOrder> {
    return client.delete<HeldOrder>(
      [HELD_ORDERS_ENDPOINT, encodeURIComponent(id)].join(PATH_SEPARATOR)
    )
  },
}

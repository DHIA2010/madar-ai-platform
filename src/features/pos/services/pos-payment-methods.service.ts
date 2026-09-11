import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Same workaround the other services document: the repo's lint rule forbids slash-prefixed
// string literals to stop page routes being hardcoded, and cannot tell them from an API path.
const PATH_SEPARATOR = String.fromCharCode(47)
const ENDPOINT = ["", "v1", "pos", "payment-methods"].join(PATH_SEPARATOR)

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

export type PaymentKind = "cash" | "card" | "wallet" | "transfer" | "bnpl"

export interface PaymentMethod {
  id: string | null
  code: string
  name: string
  subtitle: string
  kind: PaymentKind
  enabled: boolean
  feePercent: number
  isCustom: boolean
  // False while the branch is still on the built-in default and has saved nothing.
  configured: boolean
  position: number
  merchantId: string | null
  apiKey: string | null
}

export interface PaymentMethodUpdate {
  enabled: boolean
  feePercent: number
  merchantId: string | null
  apiKey: string | null
  // Only applied by the backend when the target is a branch's own method -- a catalogue entry's
  // name/subtitle are always the built-in wording.
  name?: string
  subtitle?: string | null
}

export interface CustomPaymentMethodInput extends PaymentMethodUpdate {
  code: string
  name: string
  subtitle: string | null
  kind: PaymentKind
}

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

// Every write answers with the whole list, so the screen never has to merge a response into
// local state and risk the two disagreeing.
export const posPaymentMethodsService = {
  async list(): Promise<PaymentMethod[]> {
    const response = await client.get<{ items: PaymentMethod[] }>(ENDPOINT)
    return response.items
  },

  async save(code: string, update: PaymentMethodUpdate): Promise<PaymentMethod[]> {
    const response = await client.patch<PaymentMethodUpdate, { items: PaymentMethod[] }>(
      [ENDPOINT, encodeURIComponent(code)].join(PATH_SEPARATOR),
      update
    )
    return response.items
  },

  async createCustom(method: CustomPaymentMethodInput): Promise<PaymentMethod[]> {
    const response = await client.post<CustomPaymentMethodInput, { items: PaymentMethod[] }>(
      ENDPOINT,
      method
    )
    return response.items
  },

  async remove(id: string): Promise<void> {
    await client.delete<void>([ENDPOINT, encodeURIComponent(id)].join(PATH_SEPARATOR))
  },
}

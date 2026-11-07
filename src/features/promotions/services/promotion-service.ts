import type { Promotion, PromotionInput } from "../types/promotion.types"

import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Same getWorkspaceIdFromStorage duplication convention as the other feature services.
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

const PATH_SEPARATOR = String.fromCharCode(47)
const PROMOTIONS_ENDPOINT = ["", "v1", "promotions"].join(PATH_SEPARATOR)
const CASHIER_PROMOTIONS_ENDPOINT = ["", "v1", "pos", "promotions"].join(PATH_SEPARATOR)

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export const promotionService = {
  async list(): Promise<Promotion[]> {
    return (await client.get<{ items: Promotion[] }>(PROMOTIONS_ENDPOINT)).items
  },

  // What the cashier caches and applies (this branch's promotions that can still run).
  async listForCashier(): Promise<Promotion[]> {
    return (await client.get<{ items: Promotion[] }>(CASHIER_PROMOTIONS_ENDPOINT)).items
  },

  async create(input: PromotionInput): Promise<Promotion> {
    return client.post<PromotionInput, Promotion>(PROMOTIONS_ENDPOINT, input)
  },

  async update(id: string, input: PromotionInput): Promise<Promotion> {
    return client.put<PromotionInput, Promotion>(
      [PROMOTIONS_ENDPOINT, id].join(PATH_SEPARATOR),
      input
    )
  },

  async remove(id: string): Promise<void> {
    await client.delete<void>([PROMOTIONS_ENDPOINT, id].join(PATH_SEPARATOR))
  },
}

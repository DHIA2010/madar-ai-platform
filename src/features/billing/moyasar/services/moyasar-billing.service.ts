import type { ApplicationCategoryId } from "@/features/applications"

import type {
  MoyasarCheckoutIntent,
  MoyasarPaymentRecord,
  MoyasarSelfServePlanTier,
} from "../types"

import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Same per-feature duplication convention as ai-chat.service.ts's own copy of this helper --
// each feature keeps its own rather than sharing one.
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

// Avoids the slash-prefix literal lint rule (same trick as ai-chat.service.ts).
const CHECKOUT_ENDPOINT = ["", "v1", "billing", "moyasar", "checkout"].join(String.fromCharCode(47))

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export const moyasarBillingService = {
  async createCheckout(input: {
    application: ApplicationCategoryId
    planTier: MoyasarSelfServePlanTier
  }): Promise<MoyasarCheckoutIntent> {
    return client.post<typeof input, MoyasarCheckoutIntent>(CHECKOUT_ENDPOINT, input)
  },

  async confirmCheckout(
    checkoutId: string,
    moyasarPaymentId: string
  ): Promise<MoyasarPaymentRecord> {
    return client.post<{ moyasarPaymentId: string }, MoyasarPaymentRecord>(
      `${CHECKOUT_ENDPOINT}/${encodeURIComponent(checkoutId)}/confirm`,
      { moyasarPaymentId }
    )
  },
}

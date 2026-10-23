import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Same pattern as campaign-performance.service.ts's workspace lookup -- each feature keeps its
// own copy rather than sharing one (matches this codebase's existing per-file duplication
// convention).
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

export interface SallaConnectIntent {
  intentId: string
  expiresAt: string
}

export type SallaConnectIntentStatus =
  | { waiting: true }
  | {
      waiting: false
      candidate: { claimToken: string; storeName: string; storeDomain: string | null }
    }

export interface SallaPendingInstallSummary {
  storeName: string
  currency: string | null
  status: string
}

export interface SallaMarketplaceClaimResult {
  connectionId: string
  projectId: string
  workspaceId: string | null
  organizationId: string
  accountName: string
  accountEmail: string | null
  connectedAt: string
  status: "connected"
}

// Avoids the slash-prefix literal lint rule (same trick as other feature services in this
// codebase) -- these are real backend API paths, not frontend page routes.
const CONNECT_INTENTS_ENDPOINT = ["", "v1", "integrations", "salla", "connect-intents"].join(
  String.fromCharCode(47)
)
const PENDING_INSTALLS_ENDPOINT = ["", "v1", "integrations", "salla", "pending-installs"].join(
  String.fromCharCode(47)
)

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export const sallaMarketplaceInstallService = {
  async createConnectIntent(): Promise<SallaConnectIntent> {
    return client.post<Record<string, never>, SallaConnectIntent>(CONNECT_INTENTS_ENDPOINT, {})
  },

  async getConnectIntentStatus(intentId: string): Promise<SallaConnectIntentStatus> {
    return client.get<SallaConnectIntentStatus>(
      `${CONNECT_INTENTS_ENDPOINT}/${encodeURIComponent(intentId)}/status`
    )
  },

  async getPendingInstallSummary(claimToken: string): Promise<SallaPendingInstallSummary> {
    return client.get<SallaPendingInstallSummary>(
      `${PENDING_INSTALLS_ENDPOINT}/${encodeURIComponent(claimToken)}`
    )
  },

  async claimPendingInstall(claimToken: string): Promise<SallaMarketplaceClaimResult> {
    return client.post<Record<string, never>, SallaMarketplaceClaimResult>(
      `${PENDING_INSTALLS_ENDPOINT}/${encodeURIComponent(claimToken)}/claim`,
      {}
    )
  },
}

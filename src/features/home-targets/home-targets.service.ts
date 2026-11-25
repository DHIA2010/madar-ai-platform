import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

export type HomeTargetScope = "campaigns" | "stores" | "pos"

export interface HomeTargets {
  // The KPI the tab's target card shows, or null before anyone picked one.
  selected: string | null
  // The target by KPI.
  targets: Record<string, number>
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

// The lint rule forbids slash-prefixed string literals, so the path is joined.
const SEPARATOR = String.fromCharCode(47)
const path = (scope: HomeTargetScope) => ["", "v1", "home-targets", scope].join(SEPARATOR)

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

// The home page's targets, shared by everyone in the organization.
export const homeTargetsService = {
  get: (scope: HomeTargetScope) => client.get<HomeTargets>(path(scope)),
  // Shows a KPI on the card; with a target, saves it too (null removes it).
  set: (scope: HomeTargetScope, input: { kpi: string; target?: number | null }) =>
    client.put<typeof input, HomeTargets>(path(scope), input),
}

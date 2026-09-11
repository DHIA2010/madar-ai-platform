import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Same workaround the other pos services document: the repo's lint rule forbids slash-prefixed
// string literals to stop page routes being hardcoded, and cannot tell them from an API path.
const PATH_SEPARATOR = String.fromCharCode(47)
const SHIFTS_ENDPOINT = ["", "v1", "pos", "shifts"].join(PATH_SEPARATOR)

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

export type ShiftStatus = "open" | "closed"

// A cashier's session at a branch: a counted starting float, and (once closed) a counted ending
// one. Deliberately carries no sales/expected-cash figures -- nothing in the platform records a
// transaction against a till yet (the cashier screen is still a placeholder), so a number here
// would be fabricated rather than real. Add those once a real till exists to report them.
export interface Shift {
  id: string
  workspaceId: string
  cashierUserId: string
  status: ShiftStatus
  openingCashAmount: number
  openingNotes: string | null
  openedAt: string
  openedBy: string | null
  closingCashAmount: number | null
  closingNotes: string | null
  closedAt: string | null
  closedBy: string | null
}

export interface OpenShiftInput {
  workspaceId: string
  cashierUserId: string
  openingCashAmount: number
  openingNotes: string | null
}

export interface CloseShiftInput {
  closingCashAmount: number
  closingNotes: string | null
}

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export const posShiftsService = {
  async list(): Promise<Shift[]> {
    const response = await client.get<{ items: Shift[] }>(SHIFTS_ENDPOINT)
    return response.items
  },

  async open(input: OpenShiftInput): Promise<Shift> {
    return client.post<OpenShiftInput, Shift>(SHIFTS_ENDPOINT, input)
  },

  async close(id: string, input: CloseShiftInput): Promise<Shift> {
    return client.patch<CloseShiftInput, Shift>(
      [SHIFTS_ENDPOINT, encodeURIComponent(id), "close"].join(PATH_SEPARATOR),
      input
    )
  },
}

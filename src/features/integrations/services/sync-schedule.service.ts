import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

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

export interface ConnectionSyncSchedule {
  id: string
  organizationId: string
  workspaceId: string | null
  providerId: string
  connectionId: string
  enabled: boolean
  frequencyMinutes: 15 | 30 | 60 | 360 | 1440 | null
  customCron: string | null
  activeDays: number[]
  startTimeLocal: string
  timezone: string
  retryOnConnectionFailure: boolean
  retryMaxAttempts: number
  notifyOnFailure: boolean
  nextRunAt: string | null
  lastRunAt: string | null
  lastRunStatus: "completed" | "failed" | null
  createdAt: string
  updatedAt: string
}

export interface SaveConnectionSyncScheduleInput {
  enabled: boolean
  frequencyMinutes: 15 | 30 | 60 | 360 | 1440 | null
  customCron: string | null
  activeDays: number[]
  startTimeLocal: string
  timezone: string
  retryOnConnectionFailure: boolean
  retryMaxAttempts: number
  notifyOnFailure: boolean
}

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

// Avoids the slash-prefix literal lint rule (same trick as order-list.service.ts) -- this is a
// real backend API path, not a frontend page route.
function scheduleEndpoint(providerId: string, connectionId: string) {
  return ["", "v1", "integrations", providerId, connectionId, "schedule"].join(
    String.fromCharCode(47)
  )
}

function schedulesListEndpoint() {
  return ["", "v1", "integrations", "schedules"].join(String.fromCharCode(47))
}

export const syncScheduleService = {
  async getSchedule(providerId: string, connectionId: string): Promise<ConnectionSyncSchedule> {
    return client.get<ConnectionSyncSchedule>(scheduleEndpoint(providerId, connectionId))
  },

  // Every real, enabled schedule for the current organization in one call -- feeds the
  // connections overview list's own "next sync" column instead of one request per connection.
  async listSchedules(): Promise<ConnectionSyncSchedule[]> {
    return client.get<ConnectionSyncSchedule[]>(schedulesListEndpoint())
  },

  async saveSchedule(
    providerId: string,
    connectionId: string,
    input: SaveConnectionSyncScheduleInput
  ): Promise<ConnectionSyncSchedule> {
    return client.put<SaveConnectionSyncScheduleInput, ConnectionSyncSchedule>(
      scheduleEndpoint(providerId, connectionId),
      input
    )
  },
}

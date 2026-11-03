import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Same getWorkspaceIdFromStorage duplication convention as the other features' services: the
// backend shows branch notifications for the branch the person is working in.
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
const NOTIFICATIONS_ENDPOINT = ["", "v1", "notifications"].join(PATH_SEPARATOR)

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export type NotificationType =
  | "stock_low"
  | "stock_out"
  | "order_new"
  | "orders_new_batch"
  | "sync_failed"
  | "subscription_ending"
  | "subscription_expired"
  | "payment_succeeded"
  | "payment_failed"
  | "activation_approved"
  | "activation_rejected"

export interface AppNotification {
  id: string
  type: NotificationType
  params: Record<string, unknown>
  link: string | null
  workspaceId: string | null
  read: boolean
  createdAt: string
}

export const notificationService = {
  list(): Promise<{ items: AppNotification[]; unreadCount: number }> {
    return client.get<{ items: AppNotification[]; unreadCount: number }>(NOTIFICATIONS_ENDPOINT)
  },

  async markRead(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    await client.post<{ ids: string[] }, unknown>(
      [NOTIFICATIONS_ENDPOINT, "read"].join(PATH_SEPARATOR),
      { ids }
    )
  },

  async markAllRead(): Promise<void> {
    await client.post<Record<string, never>, unknown>(
      [NOTIFICATIONS_ENDPOINT, "read-all"].join(PATH_SEPARATOR),
      {}
    )
  },
}

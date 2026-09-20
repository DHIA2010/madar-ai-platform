import type { Connection, ConnectionStatus, IntegrationStatusDto } from "@/application/contracts"

export const CONNECTION_ACTION_IDS = {
  RUN_SYNC: "run_sync",
  RECONNECT: "reconnect",
  PAUSE_SYNC: "pause_sync",
  RESUME_SYNC: "resume_sync",
  RETRY: "retry",
  DISCONNECT: "disconnect",
  DELETE_CONNECTION: "delete_connection",
} as const

export type ConnectionActionId = (typeof CONNECTION_ACTION_IDS)[keyof typeof CONNECTION_ACTION_IDS]

export type ConnectionActionIcon =
  | "run_sync"
  | "reconnect"
  | "pause"
  | "resume"
  | "retry"
  | "disconnect"
  | "delete"

export interface ConnectionActionConfirmation {
  title: string
  description: string
  confirmLabel: string
}

export interface ConnectionActionDefinition {
  id: ConnectionActionId
  label: string
  icon: ConnectionActionIcon
  destructive: boolean
  requiresConfirmation: boolean
  visible: boolean
  enabled: boolean
  disabledReason?: string
  confirmation?: ConnectionActionConfirmation
}

export interface ConnectionActionPolicyInput {
  connection: Pick<Connection, "connectionId" | "connectorId" | "status" | "metadata">
  integrationStatus?: Pick<IntegrationStatusDto, "latestJob" | "latestRun">
  workspaceStatus?: "active" | "archived" | "deleted"
}

export type ConnectionActionState =
  | "connected"
  | "paused"
  | "failed"
  | "disconnected"
  | "unsupported"

const DELETE_CONFIRMATION: ConnectionActionConfirmation = {
  title: "Delete Connection",
  description:
    "This will permanently remove the connection, OAuth tokens, synced metadata, and history.\nThis action cannot be undone.",
  confirmLabel: "Delete",
}

const CONNECTION_ACTION_CATALOG: Record<
  ConnectionActionId,
  Omit<ConnectionActionDefinition, "visible" | "enabled" | "disabledReason">
> = {
  [CONNECTION_ACTION_IDS.RUN_SYNC]: {
    id: CONNECTION_ACTION_IDS.RUN_SYNC,
    label: "Run Sync",
    icon: "run_sync",
    destructive: false,
    requiresConfirmation: false,
  },
  [CONNECTION_ACTION_IDS.RECONNECT]: {
    id: CONNECTION_ACTION_IDS.RECONNECT,
    label: "Reconnect",
    icon: "reconnect",
    destructive: false,
    requiresConfirmation: false,
  },
  [CONNECTION_ACTION_IDS.PAUSE_SYNC]: {
    id: CONNECTION_ACTION_IDS.PAUSE_SYNC,
    label: "Pause Sync",
    icon: "pause",
    destructive: false,
    requiresConfirmation: false,
  },
  [CONNECTION_ACTION_IDS.RESUME_SYNC]: {
    id: CONNECTION_ACTION_IDS.RESUME_SYNC,
    label: "Resume Sync",
    icon: "resume",
    destructive: false,
    requiresConfirmation: false,
  },
  [CONNECTION_ACTION_IDS.RETRY]: {
    id: CONNECTION_ACTION_IDS.RETRY,
    label: "Retry",
    icon: "retry",
    destructive: false,
    requiresConfirmation: false,
  },
  [CONNECTION_ACTION_IDS.DISCONNECT]: {
    id: CONNECTION_ACTION_IDS.DISCONNECT,
    label: "Disconnect",
    icon: "disconnect",
    destructive: true,
    requiresConfirmation: false,
  },
  [CONNECTION_ACTION_IDS.DELETE_CONNECTION]: {
    id: CONNECTION_ACTION_IDS.DELETE_CONNECTION,
    label: "Delete Connection",
    icon: "delete",
    destructive: true,
    requiresConfirmation: true,
    confirmation: DELETE_CONFIRMATION,
  },
}

const ACTIONS_BY_STATE: Record<ConnectionActionState, ConnectionActionId[]> = {
  connected: [
    CONNECTION_ACTION_IDS.PAUSE_SYNC,
    CONNECTION_ACTION_IDS.DISCONNECT,
    CONNECTION_ACTION_IDS.DELETE_CONNECTION,
  ],
  paused: [
    CONNECTION_ACTION_IDS.RESUME_SYNC,
    CONNECTION_ACTION_IDS.DISCONNECT,
    CONNECTION_ACTION_IDS.DELETE_CONNECTION,
  ],
  failed: [
    CONNECTION_ACTION_IDS.RETRY,
    CONNECTION_ACTION_IDS.RECONNECT,
    CONNECTION_ACTION_IDS.DELETE_CONNECTION,
  ],
  disconnected: [CONNECTION_ACTION_IDS.RECONNECT, CONNECTION_ACTION_IDS.DELETE_CONNECTION],
  unsupported: [CONNECTION_ACTION_IDS.DELETE_CONNECTION],
}

function isRetryAvailable(input: ConnectionActionPolicyInput) {
  return input.connection.metadata.retryAvailable === "true"
}

function isRunSyncEnabled(input: ConnectionActionPolicyInput) {
  return input.connection.status === "connected" && !isWorkspaceArchived(input)
}

function isWorkspaceArchived(input: ConnectionActionPolicyInput) {
  return input.workspaceStatus === "archived"
}

const WORKSPACE_ARCHIVED_REASON = "Workspace is archived. Restore it to resume sync."

export function resolveConnectionActionState(status: ConnectionStatus): ConnectionActionState {
  if (status === "connected" || status === "valid" || status === "authorized") {
    return "connected"
  }

  if (status === "paused") {
    return "paused"
  }

  if (status === "error") {
    return "failed"
  }

  if (status === "disconnected") {
    return "disconnected"
  }

  return "unsupported"
}

function toActionDefinition(
  input: ConnectionActionPolicyInput,
  actionId: ConnectionActionId
): ConnectionActionDefinition {
  const action = CONNECTION_ACTION_CATALOG[actionId]

  if (actionId === CONNECTION_ACTION_IDS.RUN_SYNC) {
    const enabled = isRunSyncEnabled(input)
    return {
      ...action,
      visible: true,
      enabled,
      disabledReason: enabled
        ? undefined
        : isWorkspaceArchived(input)
          ? WORKSPACE_ARCHIVED_REASON
          : "Connection must be connected before syncing",
    }
  }

  if (actionId === CONNECTION_ACTION_IDS.RETRY) {
    const retryVisible = isRetryAvailable(input)
    const enabled = retryVisible && !isWorkspaceArchived(input)
    return {
      ...action,
      visible: retryVisible,
      enabled,
      disabledReason: !retryVisible
        ? "Retry is unavailable for the latest operation."
        : enabled
          ? undefined
          : WORKSPACE_ARCHIVED_REASON,
    }
  }

  if (
    actionId === CONNECTION_ACTION_IDS.RESUME_SYNC ||
    actionId === CONNECTION_ACTION_IDS.PAUSE_SYNC
  ) {
    const enabled = !isWorkspaceArchived(input)
    return {
      ...action,
      visible: true,
      enabled,
      disabledReason: enabled ? undefined : WORKSPACE_ARCHIVED_REASON,
    }
  }

  return {
    ...action,
    visible: true,
    enabled: true,
  }
}

export const connectionActionPolicy = {
  getAction(
    input: ConnectionActionPolicyInput,
    actionId: ConnectionActionId
  ): ConnectionActionDefinition {
    return toActionDefinition(input, actionId)
  },

  getAvailableActions(input: ConnectionActionPolicyInput): ConnectionActionDefinition[] {
    const actionState = resolveConnectionActionState(input.connection.status)

    return (ACTIONS_BY_STATE[actionState] ?? [])
      .map((actionId) => this.getAction(input, actionId))
      .filter((action) => action.visible)
  },
}

// Arabic labels for the action menu/confirm dialog -- the catalog above stays English since it's
// also consumed by places asserting on the literal label, but every surface a user sees
// (connections list cards/table, connection detail page) renders through this localizer so the
// menu never mixes an Arabic page with English action text.
const ACTION_LABEL_AR: Record<ConnectionActionId, string> = {
  [CONNECTION_ACTION_IDS.RUN_SYNC]: "مزامنة الآن",
  [CONNECTION_ACTION_IDS.RECONNECT]: "إعادة الاتصال",
  [CONNECTION_ACTION_IDS.PAUSE_SYNC]: "إيقاف المزامنة مؤقتًا",
  [CONNECTION_ACTION_IDS.RESUME_SYNC]: "استئناف المزامنة",
  [CONNECTION_ACTION_IDS.RETRY]: "إعادة المحاولة",
  [CONNECTION_ACTION_IDS.DISCONNECT]: "قطع الاتصال",
  [CONNECTION_ACTION_IDS.DELETE_CONNECTION]: "حذف الاتصال",
}

const ACTION_CONFIRMATION_AR: Partial<Record<ConnectionActionId, ConnectionActionConfirmation>> = {
  [CONNECTION_ACTION_IDS.DELETE_CONNECTION]: {
    title: "حذف الاتصال",
    description:
      "سيؤدي هذا إلى حذف الاتصال ورموز المصادقة والبيانات المتزامنة والسجل نهائيًا.\nلا يمكن التراجع عن هذا الإجراء.",
    confirmLabel: "حذف",
  },
}

export function localizeConnectionAction(
  action: ConnectionActionDefinition
): ConnectionActionDefinition {
  return {
    ...action,
    label: ACTION_LABEL_AR[action.id] ?? action.label,
    confirmation: action.confirmation
      ? (ACTION_CONFIRMATION_AR[action.id] ?? action.confirmation)
      : action.confirmation,
  }
}

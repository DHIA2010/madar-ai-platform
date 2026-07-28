export type IntegrationConnectionStatus = "pending" | "connected" | "disconnected" | "error"

export type IntegrationSyncMode = "full" | "incremental"

export type IntegrationSyncRunStatus = "pending" | "running" | "completed" | "failed"

export interface IntegrationConnectionView {
  id: string
  organizationId: string
  workspaceId: string | null
  projectId: string
  dataSourceId: string | null
  providerAccountId: string | null
  providerAccountName: string | null
  providerAccountEmail: string | null
  scopes: string[]
  tokenExpiresAt: string | null
  status: IntegrationConnectionStatus
  connectionReference: string | null
  lastConnectedAt: string | null
  lastDisconnectedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface IntegrationDiscoveredAccountView {
  id: string
  connectionId: string
  customerId: string
  displayName: string | null
  currencyCode: string | null
  timeZone: string | null
  status: "active" | "inactive"
  isSelected: boolean
  discoveredAt: string
  createdAt: string
  updatedAt: string
}

export interface IntegrationSyncRunView {
  id: string
  connectionId: string
  organizationId: string
  workspaceId: string | null
  projectId: string
  customerId: string
  dateStart: string
  dateEnd: string
  idempotencyKey: string
  status: IntegrationSyncRunStatus
  metrics: Record<string, number>
  errorCode: string | null
  errorMessage: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface IntegrationRecordView {
  id: string
  entityType: string
  customerId: string
  entityId: string
  recordDate: string
  payload: Record<string, unknown>
  updatedAt: string
}

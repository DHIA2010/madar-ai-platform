import type {
  Connection,
  ConnectionStatus,
  ConnectorCapability,
  IntegrationStatusDto,
  SyncHistoryDto,
  SyncJobStatus,
} from "@/application/contracts"

export type ConnectionsHealthState =
  | "Healthy"
  | "Warning"
  | "Error"
  | "Expired Token"
  | "Paused"
  | "Disconnected"
  | "Running Sync"
  | "Queued"

export interface ConnectorCatalogEntry {
  connectorDefinitionId: string
  connectorId: string
  key: string
  displayName: string
  logo: string
  version: string
  connectedAccountLabel: string
  workspaceLabel: string
  capabilities: ConnectorCapability[]
}

export interface ConnectionCenterRecord {
  connectorDefinitionId: string
  connectorId: string
  platformName: string
  platformLogo: string
  version: string
  capabilities: ConnectorCapability[]
  workspaceName: string
  connectedAccount: string
  connectedAccounts: string[]
  connection: Connection
  integrationStatus: IntegrationStatusDto
  syncHistory?: SyncHistoryDto
  healthState: ConnectionsHealthState
  retryCount: number
  lastError?: string
  tokenExpiresAt?: string
  nextSyncAt?: string
  lastSyncAt?: string
  latestSyncStatus?: SyncJobStatus
}

export interface ConnectionsFilterState {
  search: string
  status: "all" | ConnectionStatus
  health: "all" | ConnectionsHealthState
  platform: "all" | string
  workspace: "all" | string
  capability: "all" | ConnectorCapability
}

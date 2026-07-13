export interface ProviderOAuthStartInputDto {
  workspaceId?: string | null
  projectId?: string | null
  connectionName?: string | null
}

export interface ProviderOAuthStartResultDto {
  authorizationUrl: string
  connectionId: string
  state: string
  projectId: string
  workspaceId: string | null
}

export interface ProviderOAuthCallbackResultDto {
  connectionId: string
  projectId: string
  workspaceId: string | null
  organizationId: string
  accountName: string
  accountEmail: string | null
  connectedAt: string
  status: "connected"
}

export interface ProviderSyncRequestDto {
  connectionId: string
  customerId: string
  startDate: string
  endDate: string
  idempotencyKey: string
  mode?: "full" | "incremental"
}

export interface ProviderRecordsQueryDto {
  connectionId: string
  customerId: string
  entityType?: string
  startDate?: string
  endDate?: string
  pageSize?: number
}

export interface ProviderAccountsQueryDto {
  connectionId: string
}

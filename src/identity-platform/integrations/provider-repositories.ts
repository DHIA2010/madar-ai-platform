import type {
  IntegrationConnectionView,
  IntegrationDiscoveredAccountView,
  IntegrationRecordView,
  IntegrationSyncRunView,
} from "./provider-models"

export interface ProviderProjectResolutionInput {
  organizationId: string
  workspaceId: string | null
  projectId: string | null
}

export interface ProviderProjectResolutionResult {
  projectId: string
  workspaceId: string | null
}

export interface ProviderStateRecordInput {
  id: string
  state: string
  organizationId: string
  workspaceId: string | null
  projectId: string
  userId: string
  connectionId: string
  requestedScopes: string[]
  redirectUri: string
  expiresAt: string
}

export interface ProviderConnectionUpsertInput {
  id: string
  organizationId: string
  workspaceId: string | null
  projectId: string
  dataSourceId: string | null
  providerAccountId: string | null
  providerAccountName: string | null
  providerAccountEmail: string | null
  encryptedRefreshToken: string | null
  encryptedAccessToken: string | null
  scopes: string[]
  tokenExpiresAt: string | null
  status: "pending" | "connected" | "disconnected" | "error"
  connectionReference: string | null
  lastConnectedAt: string | null
  lastDisconnectedAt: string | null
  actorUserId: string
  nowIso: string
}

export interface ProviderConnectionOwnershipView {
  id: string
  organizationId: string
  workspaceId: string | null
}

export interface ProviderConnectionLifecycleRepository {
  withTransaction<T>(work: () => Promise<T>): Promise<T>
  resolveProject(input: ProviderProjectResolutionInput): Promise<ProviderProjectResolutionResult>
  savePendingState(input: ProviderStateRecordInput): Promise<void>
  findPendingStateByValue(state: string): Promise<Record<string, unknown> | null>
  consumeStateOnce(stateId: string, consumedAt: string): Promise<boolean>
  upsertConnection(input: ProviderConnectionUpsertInput): Promise<void>
  findConnectionById(connectionId: string): Promise<IntegrationConnectionView | null>
  findConnectionOwnershipById(connectionId: string): Promise<ProviderConnectionOwnershipView | null>
  findConnectionByProject(organizationId: string, projectId: string): Promise<IntegrationConnectionView | null>
  saveEvent(connectionId: string, eventType: string, metadata: Record<string, unknown>): Promise<void>
  appendAuditLog(input: {
    actorUserId: string
    organizationId: string
    workspaceId: string | null
    action: string
    entityId: string
    metadata: Record<string, unknown>
    createdAt: string
  }): Promise<void>
  appendOutboxEvent(input: {
    eventType: string
    aggregateId: string
    occurredAt: string
    metadata: Record<string, unknown>
    payload: Record<string, unknown>
  }): Promise<void>
  deleteConnectionCascade(connectionId: string): Promise<void>
}

export interface ProviderReplaceAccountsInput {
  connectionId: string
  actorUserId: string
  selectedCustomerId: string | null
  accounts: Array<{
    customerId: string
    displayName: string | null
    currencyCode: string | null
    timeZone: string | null
  }>
}

export interface ProviderAccountDiscoveryRepository {
  replaceAccessibleCustomerAccounts(input: ProviderReplaceAccountsInput): Promise<void>
  listAccessibleCustomerAccounts(connectionId: string): Promise<IntegrationDiscoveredAccountView[]>
  findAccessibleCustomerAccount(
    connectionId: string,
    customerId: string
  ): Promise<IntegrationDiscoveredAccountView | null>
}

export interface ProviderSyncRepository<
  TBundle extends {
    customers: unknown[]
    campaigns: unknown[]
    campaignMetrics: unknown[]
    adGroups: unknown[]
    adGroupMetrics: unknown[]
    ads: unknown[]
    adMetrics: unknown[]
    keywords: unknown[]
    keywordMetrics: unknown[]
    searchTerms: unknown[]
    geoMetrics: unknown[]
    deviceMetrics: unknown[]
    conversionActions: unknown[]
  } = {
    customers: unknown[]
    campaigns: unknown[]
    campaignMetrics: unknown[]
    adGroups: unknown[]
    adGroupMetrics: unknown[]
    ads: unknown[]
    adMetrics: unknown[]
    keywords: unknown[]
    keywordMetrics: unknown[]
    searchTerms: unknown[]
    geoMetrics: unknown[]
    deviceMetrics: unknown[]
    conversionActions: unknown[]
  },
  TQuery extends {
    connectionId: string
    customerId: string
    entityType?: string
    startDate?: string
    endDate?: string
    pageSize?: number
  } = {
    connectionId: string
    customerId: string
    entityType?: string
    startDate?: string
    endDate?: string
    pageSize?: number
  },
  TRecord extends IntegrationRecordView = IntegrationRecordView,
> {
  withTransaction<T>(work: () => Promise<T>): Promise<T>
  createOrLoadSyncRun(input: {
    connectionId: string
    organizationId: string
    workspaceId: string | null
    projectId: string
    customerId: string
    startDate: string
    endDate: string
    idempotencyKey: string
    actorUserId: string
  }): Promise<IntegrationSyncRunView>
  findSyncRunById(syncRunId: string): Promise<IntegrationSyncRunView | null>
  markSyncRunRunning(syncRunId: string, actorUserId: string): Promise<void>
  markSyncRunCompleted(
    syncRunId: string,
    actorUserId: string,
    metrics: Record<string, number>
  ): Promise<void>
  markSyncRunFailed(
    syncRunId: string,
    actorUserId: string,
    errorCode: string,
    errorMessage: string
  ): Promise<void>
  acquireSyncLock(input: {
    providerKey: string
    connectionId: string
    projectId: string
    organizationId: string
    actorUserId: string
    leaseSeconds?: number
  }): Promise<{ lockToken: string } | null>
  extendSyncLock(input: {
    providerKey: string
    connectionId: string
    projectId: string
    lockToken: string
    leaseSeconds?: number
  }): Promise<{ id: string; lockedUntil: string } | null>
  releaseSyncLock(input: {
    providerKey: string
    connectionId: string
    projectId: string
    lockToken: string
  }): Promise<void>
  loadSyncCheckpoint(input: {
    providerKey: string
    connectionId: string
    customerId: string
  }): Promise<{
    id: string
    providerKey: string
    connectionId: string
    customerId: string
    checkpointKey: string
    checkpointVersion: number
    checkpointState: Record<string, unknown>
    lastRecordDate: string | null
    syncRunId: string | null
    status: "in_progress" | "completed"
    updatedAt: string
  } | null>
  saveSyncCheckpoint(input: {
    providerKey: string
    connectionId: string
    customerId: string
    checkpointKey: string
    checkpointVersion: number
    checkpointState: Record<string, unknown>
    lastRecordDate: string | null
    syncRunId: string | null
    status: "in_progress" | "completed"
  }): Promise<void>
  upsertBundle(input: {
    syncRunId: string
    connectionId: string
    customerId: string
    bundle: TBundle
  }): Promise<number>
  listRecords(query: TQuery): Promise<TRecord[]>
}

import type { IncomingMessage } from "node:http"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import type { MarketingPlatformAdapter, MarketingPlatformKey } from "./marketing-platform"

export type IntegrationProviderFamily =
  | "google"
  | "meta"
  | "snapchat"
  | "tiktok"
  | "linkedin"
  | "other"

export interface IntegrationProviderCapability {
  key: string
  displayName: string
  enabled: boolean
  description?: string
}

export interface IntegrationProviderProduct {
  key: string
  displayName: string
  capabilities: IntegrationProviderCapability[]
}

export interface IntegrationProviderSyncInput {
  connectionId: string
  customerId: string
  startDate: string
  endDate: string
  idempotencyKey: string
  mode?: "full" | "incremental"
  trigger?: "manual" | "retry"
}

export interface IntegrationProviderRetryStatus {
  connectionId: string
  available: boolean
  reason:
    | "retryable_failure"
    | "connection_not_connected"
    | "sync_running"
    | "no_previous_failure"
    | "non_retryable_failure"
  lastOperation?: {
    syncRunId: string
    status: "pending" | "running" | "completed" | "failed"
    customerId: string
    startDate: string
    endDate: string
    errorCode: string | null
    errorMessage: string | null
    createdAt: string
  }
}

export interface IntegrationProviderRecordQuery {
  connectionId: string
  customerId: string
  entityType?: string
  startDate?: string
  endDate?: string
  pageSize?: number
}

export interface IntegrationProviderAccountsQuery {
  connectionId: string
}

export interface IntegrationProviderAccountSelectionInput {
  connectionId: string
  customerId: string
}

export interface IntegrationProviderOAuthStartInput {
  workspaceId?: string | null
  projectId?: string | null
  connectionName?: string | null
}

export interface IntegrationProviderOAuthCallbackInput {
  state: string
  code: string
}

export interface IntegrationProviderOAuthControllerResult {
  status: number
  headers: Record<string, string>
}

export interface IntegrationProviderDisconnectInput {
  connectionId: string
  reason?: string
}

export interface IntegrationProviderEventsQuery {
  connectionId: string
  limit: number
}

export interface IntegrationProviderTimelineEvent {
  id: string
  action: string
  occurredAt: string
  actor: "user" | "system"
  message: string
}

export interface IntegrationProviderTimelineResult {
  connectionId: string
  items: IntegrationProviderTimelineEvent[]
}

export interface IntegrationProvider {
  providerId: string
  displayName: string
  providerFamily?: IntegrationProviderFamily
  platform?: MarketingPlatformKey
  products?: IntegrationProviderProduct[]
  capabilities?: IntegrationProviderCapability[]
  marketingAdapter?: MarketingPlatformAdapter
  oauthStart?(
    actor: AuthenticatedActor,
    input: IntegrationProviderOAuthStartInput
  ): Promise<unknown>
  oauthCallback?(
    request: IncomingMessage,
    query: URLSearchParams
  ): Promise<IntegrationProviderOAuthControllerResult>
  getActiveConnection?(actor: AuthenticatedActor): Promise<unknown>
  sync?(actor: AuthenticatedActor, input: IntegrationProviderSyncInput): Promise<unknown>
  retry?(actor: AuthenticatedActor, input: { connectionId: string }): Promise<unknown>
  getRetryStatus?(
    actor: AuthenticatedActor,
    input: { connectionId: string }
  ): Promise<IntegrationProviderRetryStatus>
  listRecords?(actor: AuthenticatedActor, query: IntegrationProviderRecordQuery): Promise<unknown>
  listAccounts?(
    actor: AuthenticatedActor,
    query: IntegrationProviderAccountsQuery
  ): Promise<unknown>
  selectAccount?(
    actor: AuthenticatedActor,
    input: IntegrationProviderAccountSelectionInput
  ): Promise<unknown>
  getSelectedAccount?(
    actor: AuthenticatedActor,
    query: IntegrationProviderAccountsQuery
  ): Promise<unknown>
  pause?(actor: AuthenticatedActor, input: { connectionId: string }): Promise<unknown>
  resume?(actor: AuthenticatedActor, input: { connectionId: string }): Promise<unknown>
  disconnect?(
    actor: AuthenticatedActor,
    input: IntegrationProviderDisconnectInput
  ): Promise<unknown>
  reconnect?(actor: AuthenticatedActor, input: { connectionId: string }): Promise<unknown>
  listEvents?(
    actor: AuthenticatedActor,
    query: IntegrationProviderEventsQuery
  ): Promise<IntegrationProviderTimelineResult>
}

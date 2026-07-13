import type { IncomingMessage } from "node:http"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"

export interface IntegrationProviderSyncInput {
  connectionId: string
  customerId: string
  startDate: string
  endDate: string
  idempotencyKey: string
  mode?: "full" | "incremental"
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

export interface IntegrationProvider {
  providerId: string
  displayName: string
  oauthStart?(actor: AuthenticatedActor, input: IntegrationProviderOAuthStartInput): Promise<unknown>
  oauthCallback?(request: IncomingMessage, query: URLSearchParams): Promise<IntegrationProviderOAuthControllerResult>
  getActiveConnection?(actor: AuthenticatedActor): Promise<unknown>
  sync?(actor: AuthenticatedActor, input: IntegrationProviderSyncInput): Promise<unknown>
  listRecords?(actor: AuthenticatedActor, query: IntegrationProviderRecordQuery): Promise<unknown>
  listAccounts?(actor: AuthenticatedActor, query: IntegrationProviderAccountsQuery): Promise<unknown>
}

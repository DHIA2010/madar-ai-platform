import type { IncomingMessage } from "node:http"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import type { MarketingPlatformAdapter, MarketingPlatformKey } from "./marketing-platform"

export type IntegrationProviderFamily = "google" | "meta" | "snapchat" | "tiktok" | "linkedin" | "other"

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

export interface IntegrationProvider {
  providerId: string
  displayName: string
  providerFamily?: IntegrationProviderFamily
  platform?: MarketingPlatformKey
  products?: IntegrationProviderProduct[]
  capabilities?: IntegrationProviderCapability[]
  marketingAdapter?: MarketingPlatformAdapter
  oauthStart?(actor: AuthenticatedActor, input: IntegrationProviderOAuthStartInput): Promise<unknown>
  oauthCallback?(request: IncomingMessage, query: URLSearchParams): Promise<IntegrationProviderOAuthControllerResult>
  getActiveConnection?(actor: AuthenticatedActor): Promise<unknown>
  sync?(actor: AuthenticatedActor, input: IntegrationProviderSyncInput): Promise<unknown>
  listRecords?(actor: AuthenticatedActor, query: IntegrationProviderRecordQuery): Promise<unknown>
  listAccounts?(actor: AuthenticatedActor, query: IntegrationProviderAccountsQuery): Promise<unknown>
  selectAccount?(actor: AuthenticatedActor, input: IntegrationProviderAccountSelectionInput): Promise<unknown>
  getSelectedAccount?(actor: AuthenticatedActor, query: IntegrationProviderAccountsQuery): Promise<unknown>
}

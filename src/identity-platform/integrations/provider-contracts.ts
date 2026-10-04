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
  trigger?: "manual" | "retry" | "scheduled"
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
  // Shop-scoped providers (Shopify) need this to build a per-store authorize URL. Ignored
  // by every other provider's oauthStart implementation.
  shopDomain?: string | null
}

export interface IntegrationProviderOAuthCallbackInput {
  state: string
  code: string
}

// Merchant-supplied credential (a store id + a pre-issued access token from the provider's own
// dashboard), for providers that support connecting without going through the OAuth
// authorization-code redirect -- e.g. Zid's "Direct API Integration", useful before an OAuth
// app has been approved for public installs.
export interface IntegrationProviderDirectConnectInput {
  workspaceId?: string | null
  projectId?: string | null
  connectionName?: string | null
  storeId: string
  accessToken: string
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

export interface IntegrationProviderOrderDetailQuery {
  connectionId: string
  orderId: string
}

export interface IntegrationProviderOrderDetailItem {
  id: string
  name: string
  sku: string | null
  quantity: number
  unitPrice: number | null
  discount: number
  tax: number
  total: number
  thumbnail: string | null
}

export interface IntegrationProviderOrderDetail {
  currency: string
  subTotal: number
  shippingCost: number
  taxTotal: number
  discountTotal: number
  total: number
  items: IntegrationProviderOrderDetailItem[]
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
  connectDirect?(
    actor: AuthenticatedActor,
    input: IntegrationProviderDirectConnectInput
  ): Promise<unknown>
  oauthCallback?(
    request: IncomingMessage,
    query: URLSearchParams
  ): Promise<IntegrationProviderOAuthControllerResult>
  // Unauthenticated, anonymous-visitor equivalent of oauthStart -- for a provider whose app-store
  // "Activate" flow sends a merchant straight to a URL of ours before any MADAR session exists
  // (first added for Zid; see zid-oauth/controller.ts's startMarketplace).
  oauthMarketplaceStart?(): Promise<IntegrationProviderOAuthControllerResult>
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
  pauseAllForWorkspace?(actor: AuthenticatedActor, workspaceId: string): Promise<unknown>
  resumeAllForWorkspace?(actor: AuthenticatedActor, workspaceId: string): Promise<unknown>
  disconnect?(
    actor: AuthenticatedActor,
    input: IntegrationProviderDisconnectInput
  ): Promise<unknown>
  reconnect?(actor: AuthenticatedActor, input: { connectionId: string }): Promise<unknown>
  listEvents?(
    actor: AuthenticatedActor,
    query: IntegrationProviderEventsQuery
  ): Promise<IntegrationProviderTimelineResult>
  getOrderDetail?(
    actor: AuthenticatedActor,
    query: IntegrationProviderOrderDetailQuery
  ): Promise<IntegrationProviderOrderDetail>
}

import type {
  ProviderOAuthCallbackResultDto,
  ProviderOAuthStartInputDto,
  ProviderOAuthStartResultDto,
} from "../integrations/provider-dtos"
import type {
  IntegrationConnectionView,
  IntegrationDiscoveredAccountView,
} from "../integrations/provider-models"

export type GoogleOAuthStartInput = ProviderOAuthStartInputDto

export type GoogleOAuthStartResult = ProviderOAuthStartResultDto

export type GoogleOAuthCallbackResult = ProviderOAuthCallbackResultDto

export type GoogleOAuthConnectionView = IntegrationConnectionView

export type GoogleAdsCustomerAccountView = IntegrationDiscoveredAccountView

export interface GoogleOAuthRecentEventView {
  id: string
  eventType: string
  occurredAt: string
  metadata: Record<string, unknown>
  payload: Record<string, unknown>
}

export interface GoogleOAuthRecentEventsResult {
  connectionId: string
  items: GoogleOAuthRecentEventView[]
}

export interface GoogleOAuthTimelineEvent {
  id: string
  action: string
  occurredAt: string
  actor: "system" | "user"
  message: string
  // Only populated for a "sync.completed" event, resolved from that sync run's own real,
  // already-stored per-entity counts (google_ads_sync_runs.metrics) -- absent for every other
  // action, and for a sync run whose metrics row can no longer be found.
  syncedItems?: string
}

export interface GoogleOAuthTimelineResult {
  connectionId: string
  items: GoogleOAuthTimelineEvent[]
}

import type {
  ProviderOAuthCallbackResultDto,
  ProviderOAuthStartInputDto,
  ProviderOAuthStartResultDto,
} from "../integrations/provider-dtos"
import type {
  IntegrationConnectionView,
  IntegrationDiscoveredAccountView,
} from "../integrations/provider-models"

export interface GoogleOAuthStartInput extends ProviderOAuthStartInputDto {}

export interface GoogleOAuthStartResult extends ProviderOAuthStartResultDto {}

export interface GoogleOAuthCallbackResult extends ProviderOAuthCallbackResultDto {}

export interface GoogleOAuthConnectionView extends IntegrationConnectionView {}

export interface GoogleAdsCustomerAccountView extends IntegrationDiscoveredAccountView {}

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
}

export interface GoogleOAuthTimelineResult {
  connectionId: string
  items: GoogleOAuthTimelineEvent[]
}

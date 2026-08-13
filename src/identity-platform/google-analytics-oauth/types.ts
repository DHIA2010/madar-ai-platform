import type {
  ProviderOAuthCallbackResultDto,
  ProviderOAuthStartInputDto,
  ProviderOAuthStartResultDto,
} from "../integrations/provider-dtos"
import type {
  IntegrationConnectionView,
  IntegrationDiscoveredAccountView,
} from "../integrations/provider-models"

export type GoogleAnalyticsOAuthStartInput = ProviderOAuthStartInputDto

export type GoogleAnalyticsOAuthStartResult = ProviderOAuthStartResultDto

export type GoogleAnalyticsOAuthCallbackResult = ProviderOAuthCallbackResultDto

export type GoogleAnalyticsOAuthConnectionView = IntegrationConnectionView

export interface GoogleAnalyticsPropertyView extends IntegrationDiscoveredAccountView {
  organizationId: string | null
  organizationName: string | null
}

export interface GoogleAnalyticsOAuthTimelineEvent {
  id: string
  action: string
  occurredAt: string
  actor: "system" | "user"
  message: string
}

export interface GoogleAnalyticsOAuthTimelineResult {
  connectionId: string
  items: GoogleAnalyticsOAuthTimelineEvent[]
}

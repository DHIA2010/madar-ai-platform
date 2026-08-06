import type {
  ProviderOAuthCallbackResultDto,
  ProviderOAuthStartInputDto,
  ProviderOAuthStartResultDto,
} from "../integrations/provider-dtos"
import type {
  IntegrationConnectionView,
  IntegrationDiscoveredAccountView,
} from "../integrations/provider-models"

export type SnapchatOAuthStartInput = ProviderOAuthStartInputDto

export type SnapchatOAuthStartResult = ProviderOAuthStartResultDto

export type SnapchatOAuthCallbackResult = ProviderOAuthCallbackResultDto

export type SnapchatOAuthConnectionView = IntegrationConnectionView

export interface SnapchatAdsAccountView extends IntegrationDiscoveredAccountView {
  organizationId: string | null
  organizationName: string | null
}

export interface SnapchatOAuthTimelineEvent {
  id: string
  action: string
  occurredAt: string
  actor: "system" | "user"
  message: string
}

export interface SnapchatOAuthTimelineResult {
  connectionId: string
  items: SnapchatOAuthTimelineEvent[]
}

import type {
  ProviderOAuthCallbackResultDto,
  ProviderOAuthStartInputDto,
  ProviderOAuthStartResultDto,
} from "../integrations/provider-dtos"
import type {
  IntegrationConnectionView,
  IntegrationDiscoveredAccountView,
} from "../integrations/provider-models"

export type MetaOAuthStartInput = ProviderOAuthStartInputDto

export type MetaOAuthStartResult = ProviderOAuthStartResultDto

export type MetaOAuthCallbackResult = ProviderOAuthCallbackResultDto

export type MetaOAuthConnectionView = IntegrationConnectionView

export interface MetaAdsAccountView extends IntegrationDiscoveredAccountView {
  organizationId: string | null
  organizationName: string | null
}

export interface MetaOAuthTimelineEvent {
  id: string
  action: string
  occurredAt: string
  actor: "system" | "user"
  message: string
}

export interface MetaOAuthTimelineResult {
  connectionId: string
  items: MetaOAuthTimelineEvent[]
}

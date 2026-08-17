import type {
  ProviderOAuthCallbackResultDto,
  ProviderOAuthStartInputDto,
  ProviderOAuthStartResultDto,
} from "../integrations/provider-dtos"
import type {
  IntegrationConnectionView,
  IntegrationDiscoveredAccountView,
} from "../integrations/provider-models"

export type ZidOAuthStartInput = ProviderOAuthStartInputDto

export type ZidOAuthStartResult = ProviderOAuthStartResultDto

export type ZidOAuthCallbackResult = ProviderOAuthCallbackResultDto

export type ZidOAuthConnectionView = IntegrationConnectionView

export interface ZidStoreView extends IntegrationDiscoveredAccountView {
  organizationId: string | null
  organizationName: string | null
}

export interface ZidOAuthTimelineEvent {
  id: string
  action: string
  occurredAt: string
  actor: "system" | "user"
  message: string
}

export interface ZidOAuthTimelineResult {
  connectionId: string
  items: ZidOAuthTimelineEvent[]
}

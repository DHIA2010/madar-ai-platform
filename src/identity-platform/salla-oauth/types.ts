import type {
  ProviderOAuthCallbackResultDto,
  ProviderOAuthStartInputDto,
  ProviderOAuthStartResultDto,
} from "../integrations/provider-dtos"
import type {
  IntegrationConnectionView,
  IntegrationDiscoveredAccountView,
} from "../integrations/provider-models"

export type SallaOAuthStartInput = ProviderOAuthStartInputDto

export type SallaOAuthStartResult = ProviderOAuthStartResultDto

export type SallaOAuthCallbackResult = ProviderOAuthCallbackResultDto

export type SallaOAuthConnectionView = IntegrationConnectionView

export interface SallaStoreView extends IntegrationDiscoveredAccountView {
  organizationId: string | null
  organizationName: string | null
}

export interface SallaOAuthTimelineEvent {
  id: string
  action: string
  occurredAt: string
  actor: "system" | "user"
  message: string
}

export interface SallaOAuthTimelineResult {
  connectionId: string
  items: SallaOAuthTimelineEvent[]
}

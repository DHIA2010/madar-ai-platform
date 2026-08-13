import type {
  ProviderOAuthCallbackResultDto,
  ProviderOAuthStartInputDto,
  ProviderOAuthStartResultDto,
} from "../integrations/provider-dtos"
import type {
  IntegrationConnectionView,
  IntegrationDiscoveredAccountView,
} from "../integrations/provider-models"

export type ShopifyOAuthStartInput = ProviderOAuthStartInputDto

export type ShopifyOAuthStartResult = ProviderOAuthStartResultDto

export type ShopifyOAuthCallbackResult = ProviderOAuthCallbackResultDto

export type ShopifyOAuthConnectionView = IntegrationConnectionView

export interface ShopifyStoreView extends IntegrationDiscoveredAccountView {
  organizationId: string | null
  organizationName: string | null
}

export interface ShopifyOAuthTimelineEvent {
  id: string
  action: string
  occurredAt: string
  actor: "system" | "user"
  message: string
}

export interface ShopifyOAuthTimelineResult {
  connectionId: string
  items: ShopifyOAuthTimelineEvent[]
}

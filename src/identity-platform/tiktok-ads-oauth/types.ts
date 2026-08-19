import type {
  ProviderOAuthCallbackResultDto,
  ProviderOAuthStartInputDto,
  ProviderOAuthStartResultDto,
} from "../integrations/provider-dtos"
import type {
  IntegrationConnectionView,
  IntegrationDiscoveredAccountView,
} from "../integrations/provider-models"

export type TikTokAdsOAuthStartInput = ProviderOAuthStartInputDto

export type TikTokAdsOAuthStartResult = ProviderOAuthStartResultDto

export type TikTokAdsOAuthCallbackResult = ProviderOAuthCallbackResultDto

export type TikTokAdsOAuthConnectionView = IntegrationConnectionView

export interface TikTokAdsAdvertiserAccountView extends IntegrationDiscoveredAccountView {
  organizationId: string | null
  organizationName: string | null
}

export interface TikTokAdsOAuthTimelineEvent {
  id: string
  action: string
  occurredAt: string
  actor: "system" | "user"
  message: string
}

export interface TikTokAdsOAuthTimelineResult {
  connectionId: string
  items: TikTokAdsOAuthTimelineEvent[]
}

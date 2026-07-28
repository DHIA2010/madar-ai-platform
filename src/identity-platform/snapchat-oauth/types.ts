import type {
  ProviderOAuthCallbackResultDto,
  ProviderOAuthStartInputDto,
  ProviderOAuthStartResultDto,
} from "../integrations/provider-dtos"
import type {
  IntegrationConnectionView,
  IntegrationDiscoveredAccountView,
} from "../integrations/provider-models"

export interface SnapchatOAuthStartInput extends ProviderOAuthStartInputDto {}

export interface SnapchatOAuthStartResult extends ProviderOAuthStartResultDto {}

export interface SnapchatOAuthCallbackResult extends ProviderOAuthCallbackResultDto {}

export interface SnapchatOAuthConnectionView extends IntegrationConnectionView {}

export interface SnapchatAdsAccountView extends IntegrationDiscoveredAccountView {
  organizationId: string | null
  organizationName: string | null
}

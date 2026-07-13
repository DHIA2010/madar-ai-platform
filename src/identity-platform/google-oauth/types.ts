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

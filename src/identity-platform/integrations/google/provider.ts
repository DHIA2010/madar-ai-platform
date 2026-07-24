import type { IncomingMessage } from "node:http"

import type { AuthenticatedActor } from "../../application/dto/identity-dtos"
import type { GoogleOAuthController } from "../../google-oauth/controller"
import type { IntegrationProviderOAuthControllerResult, IntegrationProviderOAuthStartInput } from "../provider-contracts"

export class GoogleIdentityIntegrationProvider {
  readonly providerId = "google"
  readonly displayName = "Google Identity"
  readonly providerFamily = "google" as const
  readonly platform = "marketing" as const
  readonly products = [
    {
      key: "identity",
      displayName: "Identity",
      capabilities: [{ key: "oauth", displayName: "OAuth", enabled: true }],
    },
  ]
  readonly capabilities = [{ key: "oauth", displayName: "OAuth", enabled: true }]

  constructor(private readonly oauthController: GoogleOAuthController) {}

  oauthStart(actor: AuthenticatedActor, input: IntegrationProviderOAuthStartInput) {
    return this.oauthController.start(actor, input)
  }

  oauthCallback(request: IncomingMessage, query: URLSearchParams): Promise<IntegrationProviderOAuthControllerResult> {
    return this.oauthController.callback(request, query)
  }

  getActiveConnection(actor: AuthenticatedActor) {
    return this.oauthController.getActiveConnection(actor)
  }
}

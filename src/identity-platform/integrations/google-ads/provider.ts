import type { AuthenticatedActor } from "../../application/dto/identity-dtos"

import type { GoogleAdsRecordQuery, GoogleAdsSyncRequest } from "../../google-ads/types"
import type { GoogleAdsSyncService } from "../../google-ads/sync-service"
import type {
  IntegrationProviderAccountSelectionInput,
  IntegrationProviderAccountsQuery,
} from "../provider-contracts"

export class GoogleAdsIntegrationProvider {
  readonly providerId = "google-ads"
  readonly displayName = "Google Ads"
  readonly providerFamily = "google" as const
  readonly platform = "marketing" as const
  readonly products = [
    {
      key: "ads",
      displayName: "Ads",
      capabilities: [
        { key: "oauth", displayName: "OAuth", enabled: true },
        { key: "ads", displayName: "Ads", enabled: true },
      ],
    },
  ]
  readonly capabilities = [
    { key: "oauth", displayName: "OAuth", enabled: true },
    { key: "ads", displayName: "Ads", enabled: true },
  ]

  constructor(private readonly service: GoogleAdsSyncService) {}

  sync(actor: AuthenticatedActor, input: GoogleAdsSyncRequest) {
    return this.service.sync(actor, input)
  }

  listRecords(actor: AuthenticatedActor, query: GoogleAdsRecordQuery) {
    return this.service.listRecords(actor, query)
  }

  listAccounts(actor: AuthenticatedActor, query: { connectionId: string }) {
    return this.service.listAccessibleAccounts(actor, query)
  }

  selectAccount(actor: AuthenticatedActor, input: IntegrationProviderAccountSelectionInput) {
    return this.service.selectAccessibleAccount(actor, input)
  }

  getSelectedAccount(actor: AuthenticatedActor, query: IntegrationProviderAccountsQuery) {
    return this.service.getSelectedAccessibleAccount(actor, query)
  }
}
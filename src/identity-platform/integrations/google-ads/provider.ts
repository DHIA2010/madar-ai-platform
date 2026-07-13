import type { AuthenticatedActor } from "../../application/dto/identity-dtos"

import type { GoogleAdsRecordQuery, GoogleAdsSyncRequest } from "../../google-ads/types"
import type { GoogleAdsSyncService } from "../../google-ads/sync-service"

export class GoogleAdsIntegrationProvider {
  readonly providerId = "google-ads"
  readonly displayName = "Google Ads"

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
}

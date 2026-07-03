import type { AuthenticatedActor } from "../application/dto/identity-dtos"

import type { GoogleAdsSyncService } from "./sync-service"
import type { GoogleAdsRecordQuery, GoogleAdsSyncRequest } from "./types"

export class GoogleAdsController {
  constructor(private readonly service: GoogleAdsSyncService) {}

  async sync(actor: AuthenticatedActor, input: GoogleAdsSyncRequest) {
    return this.service.sync(actor, input)
  }

  async listRecords(actor: AuthenticatedActor, query: GoogleAdsRecordQuery) {
    return this.service.listRecords(actor, query)
  }
}

import type {
  AuthorizeConnectorRequestDto,
  Connection,
  SyncJob,
} from "@/application/contracts/integration.contracts"
import { ValidationError } from "@/infrastructure/data/errors"

import { GoogleAdsAuthentication } from "./google-ads.authentication"
import { GoogleAdsGateway } from "./google-ads.gateway"
import { GoogleAdsSync } from "./google-ads.sync"

export class GoogleAdsRepository {
  private readonly gateway: GoogleAdsGateway
  private readonly authentication: GoogleAdsAuthentication
  private readonly sync: GoogleAdsSync

  constructor(
    gateway: GoogleAdsGateway = new GoogleAdsGateway(),
    authentication?: GoogleAdsAuthentication,
    sync?: GoogleAdsSync
  ) {
    this.gateway = gateway
    this.authentication = authentication ?? new GoogleAdsAuthentication(gateway)
    this.sync = sync ?? new GoogleAdsSync(gateway)
  }

  async authorize(connection: Connection, input: AuthorizeConnectorRequestDto) {
    return this.authentication.authorize(connection, input)
  }

  async refresh(connection: Connection) {
    return this.authentication.refresh(connection)
  }

  async validateToken(connection: Connection): Promise<boolean> {
    return this.authentication.validateToken(connection)
  }

  async disconnect(): Promise<void> {
    return this.authentication.disconnect()
  }

  async runSync(connection: Connection, job: SyncJob) {
    return this.sync.run(connection.connectionId, job, connection.lastSyncedAt)
  }

  ensureOauthCredential(connection: Connection) {
    if (!connection.credentialId) {
      throw new ValidationError({
        message: "Google Ads requires OAuth credentials before authorization.",
      })
    }
  }
}

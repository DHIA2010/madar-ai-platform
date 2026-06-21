import type {
  AuthorizeConnectorRequestDto,
  Connection,
  SyncJob,
} from "@/application/contracts/integration.contracts"
import { ValidationError } from "@/infrastructure/data/errors"

import { MetaAdsAuthentication } from "./meta-ads.authentication"
import { MetaAdsGateway } from "./meta-ads.gateway"
import { MetaAdsSync } from "./meta-ads.sync"

export class MetaAdsRepository {
  private readonly gateway: MetaAdsGateway
  private readonly authentication: MetaAdsAuthentication
  private readonly sync: MetaAdsSync

  constructor(
    gateway: MetaAdsGateway = new MetaAdsGateway(),
    authentication?: MetaAdsAuthentication,
    sync?: MetaAdsSync
  ) {
    this.gateway = gateway
    this.authentication = authentication ?? new MetaAdsAuthentication(gateway)
    this.sync = sync ?? new MetaAdsSync(gateway)
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
        message: "Meta Ads requires OAuth credentials before authorization.",
      })
    }
  }
}

import type {
  AuthorizeConnectorRequestDto,
  Connection,
  SyncJob,
} from "@/application/contracts/integration.contracts"
import { ValidationError } from "@/infrastructure/data/errors"

import { SnapchatAdsAuthentication } from "./snapchat-ads.authentication"
import { SnapchatAdsGateway } from "./snapchat-ads.gateway"
import { SnapchatAdsSync } from "./snapchat-ads.sync"

export class SnapchatAdsRepository {
  private readonly gateway: SnapchatAdsGateway
  private readonly authentication: SnapchatAdsAuthentication
  private readonly sync: SnapchatAdsSync

  constructor(
    gateway: SnapchatAdsGateway = new SnapchatAdsGateway(),
    authentication?: SnapchatAdsAuthentication,
    sync?: SnapchatAdsSync
  ) {
    this.gateway = gateway
    this.authentication = authentication ?? new SnapchatAdsAuthentication(gateway)
    this.sync = sync ?? new SnapchatAdsSync(gateway)
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
        message: "Snapchat Ads requires OAuth credentials before authorization.",
      })
    }
  }
}

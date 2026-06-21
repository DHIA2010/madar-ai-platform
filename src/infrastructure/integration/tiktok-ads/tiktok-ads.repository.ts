import type {
  AuthorizeConnectorRequestDto,
  Connection,
  SyncJob,
} from "@/application/contracts/integration.contracts"
import { ValidationError } from "@/infrastructure/data/errors"

import { TikTokAdsAuthentication } from "./tiktok-ads.authentication"
import { TikTokAdsGateway } from "./tiktok-ads.gateway"
import { TikTokAdsSync } from "./tiktok-ads.sync"

export class TikTokAdsRepository {
  private readonly gateway: TikTokAdsGateway
  private readonly authentication: TikTokAdsAuthentication
  private readonly sync: TikTokAdsSync

  constructor(
    gateway: TikTokAdsGateway = new TikTokAdsGateway(),
    authentication?: TikTokAdsAuthentication,
    sync?: TikTokAdsSync
  ) {
    this.gateway = gateway
    this.authentication = authentication ?? new TikTokAdsAuthentication(gateway)
    this.sync = sync ?? new TikTokAdsSync(gateway)
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
        message: "TikTok Ads requires OAuth credentials before authorization.",
      })
    }
  }
}

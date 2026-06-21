import type {
  AuthorizeConnectorRequestDto,
  Connection,
  SyncJob,
} from "@/application/contracts/integration.contracts"
import { ValidationError } from "@/infrastructure/data/errors"

import { GA4Authentication } from "./ga4.authentication"
import { GA4Gateway } from "./ga4.gateway"
import { GA4Sync } from "./ga4.sync"

export class GA4Repository {
  private readonly gateway: GA4Gateway
  private readonly authentication: GA4Authentication
  private readonly sync: GA4Sync

  constructor(
    gateway: GA4Gateway = new GA4Gateway(),
    authentication?: GA4Authentication,
    sync?: GA4Sync
  ) {
    this.gateway = gateway
    this.authentication = authentication ?? new GA4Authentication(gateway)
    this.sync = sync ?? new GA4Sync(gateway)
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
        message: "GA4 requires OAuth credentials before authorization.",
      })
    }
  }
}

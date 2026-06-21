import type {
  AuthorizeConnectorRequestDto,
  Connection,
  SyncJob,
} from "@/application/contracts/integration.contracts"
import { ValidationError } from "@/infrastructure/data/errors"

import { ZidAuthentication } from "./zid.authentication"
import { ZidGateway } from "./zid.gateway"
import { ZidSync } from "./zid.sync"
import { ZidWebhookParser } from "./zid.webhook"

export class ZidRepository {
  private readonly gateway: ZidGateway
  private readonly authentication: ZidAuthentication
  private readonly sync: ZidSync
  private readonly webhookParser: ZidWebhookParser

  constructor(
    gateway: ZidGateway = new ZidGateway(),
    authentication?: ZidAuthentication,
    sync?: ZidSync,
    webhookParser?: ZidWebhookParser
  ) {
    this.gateway = gateway
    this.authentication = authentication ?? new ZidAuthentication(gateway)
    this.sync = sync ?? new ZidSync(gateway)
    this.webhookParser = webhookParser ?? new ZidWebhookParser()
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

  parseWebhook(payload: unknown) {
    return this.webhookParser.parse(payload)
  }

  ensureOauthCredential(connection: Connection) {
    if (!connection.credentialId) {
      throw new ValidationError({
        message: "Zid requires OAuth credentials before authorization.",
      })
    }
  }
}

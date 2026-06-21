import type {
  AuthorizeConnectorRequestDto,
  Connection,
  SyncJob,
} from "@/application/contracts/integration.contracts"
import { ValidationError } from "@/infrastructure/data/errors"

import { SallaAuthentication } from "./salla.authentication"
import { SallaGateway } from "./salla.gateway"
import { SallaSync } from "./salla.sync"
import { SallaWebhookParser } from "./salla.webhook"

export class SallaRepository {
  private readonly gateway: SallaGateway
  private readonly authentication: SallaAuthentication
  private readonly sync: SallaSync
  private readonly webhookParser: SallaWebhookParser

  constructor(
    gateway: SallaGateway = new SallaGateway(),
    authentication?: SallaAuthentication,
    sync?: SallaSync,
    webhookParser?: SallaWebhookParser
  ) {
    this.gateway = gateway
    this.authentication = authentication ?? new SallaAuthentication(gateway)
    this.sync = sync ?? new SallaSync(gateway)
    this.webhookParser = webhookParser ?? new SallaWebhookParser()
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
        message: "Salla requires OAuth credentials before authorization.",
      })
    }
  }
}

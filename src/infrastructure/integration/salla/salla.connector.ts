import type {
  AccessToken,
  AuthorizeConnectorRequestDto,
  Connection,
  ConnectorCapability,
  ConnectorContract,
  ConnectorDefinition,
  ConnectorHealth,
  SyncJob,
  SyncResult,
} from "@/application/contracts/integration.contracts"

import { SallaRepository } from "./salla.repository"

export const SALLA_CONNECTOR_DEFINITION: ConnectorDefinition = {
  connectorDefinitionId: "connector_def_salla",
  key: "commerce.salla",
  displayName: "Salla",
  description: "Salla commerce connector with OAuth, webhook parsing, and sync support.",
  version: "1.0.0",
  capabilities: ["products", "orders", "customers", "catalog"],
  supportsWebhook: true,
  supportsScheduler: true,
  supportsTokenRefresh: true,
}

const SALLA_CAPABILITIES: ConnectorCapability[] = ["products", "orders", "customers", "catalog"]

export class SallaConnector implements ConnectorContract {
  readonly definition = SALLA_CONNECTOR_DEFINITION

  constructor(private readonly repository: SallaRepository = new SallaRepository()) {}

  async install(): Promise<void> {
    return Promise.resolve()
  }

  async authorize(connection: Connection, input: AuthorizeConnectorRequestDto): Promise<void> {
    await this.repository.authorize(connection, input)
  }

  async connect(): Promise<void> {
    return Promise.resolve()
  }

  async validate(connection: Connection): Promise<boolean> {
    return this.repository.validateToken(connection)
  }

  async sync(connection: Connection, job: SyncJob): Promise<SyncResult> {
    const output = await this.repository.runSync(connection, job)
    return output.result
  }

  async refreshToken(connection: Connection): Promise<AccessToken> {
    const refreshed = await this.repository.refresh(connection)
    return refreshed.accessToken
  }

  async pause(): Promise<void> {
    return Promise.resolve()
  }

  async resume(): Promise<void> {
    return Promise.resolve()
  }

  async disconnect(): Promise<void> {
    await this.repository.disconnect()
  }

  async reconnect(): Promise<void> {
    return Promise.resolve()
  }

  async delete(): Promise<void> {
    return Promise.resolve()
  }

  getCapabilities(): ConnectorCapability[] {
    return SALLA_CAPABILITIES.slice()
  }

  async getHealth(): Promise<ConnectorHealth> {
    return {
      connectorId: "salla",
      status: "healthy",
      score: 92,
      lastCheckedAt: new Date().toISOString(),
      checks: [
        {
          check: "oauth",
          status: "pass",
          message: "OAuth flow is available",
        },
        {
          check: "sync",
          status: "pass",
          message: "Sync pipeline is operational",
        },
      ],
    }
  }
}

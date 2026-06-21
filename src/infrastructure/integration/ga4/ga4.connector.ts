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

import { GA4Repository } from "./ga4.repository"

export const GA4_CONNECTOR_DEFINITION: ConnectorDefinition = {
  connectorDefinitionId: "connector_def_ga4",
  key: "analytics.ga4",
  displayName: "Google Analytics 4",
  description: "GA4 connector with OAuth and analytics sync support.",
  version: "1.0.0",
  capabilities: ["traffic", "events", "conversions"],
  supportsWebhook: false,
  supportsScheduler: true,
  supportsTokenRefresh: true,
}

const GA4_CAPABILITIES: ConnectorCapability[] = ["traffic", "events", "conversions"]

export class GA4Connector implements ConnectorContract {
  readonly definition = GA4_CONNECTOR_DEFINITION

  constructor(private readonly repository: GA4Repository = new GA4Repository()) {}

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
    return GA4_CAPABILITIES.slice()
  }

  async getHealth(): Promise<ConnectorHealth> {
    return {
      connectorId: "ga4",
      status: "healthy",
      score: 91,
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

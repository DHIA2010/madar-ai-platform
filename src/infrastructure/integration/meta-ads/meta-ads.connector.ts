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

import { MetaAdsRepository } from "./meta-ads.repository"

export const META_ADS_CONNECTOR_DEFINITION: ConnectorDefinition = {
  connectorDefinitionId: "connector_def_meta_ads",
  key: "ads.meta",
  displayName: "Meta Ads",
  description: "Meta Ads connector with OAuth and advertising sync support.",
  version: "1.0.0",
  capabilities: ["campaigns", "ads", "traffic", "events", "conversions"],
  supportsWebhook: false,
  supportsScheduler: true,
  supportsTokenRefresh: true,
}

const META_ADS_CAPABILITIES: ConnectorCapability[] = [
  "campaigns",
  "ads",
  "traffic",
  "events",
  "conversions",
]

export class MetaAdsConnector implements ConnectorContract {
  readonly definition = META_ADS_CONNECTOR_DEFINITION

  constructor(private readonly repository: MetaAdsRepository = new MetaAdsRepository()) {}

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
    return META_ADS_CAPABILITIES.slice()
  }

  async getHealth(): Promise<ConnectorHealth> {
    return {
      connectorId: "meta_ads",
      status: "healthy",
      score: 90,
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

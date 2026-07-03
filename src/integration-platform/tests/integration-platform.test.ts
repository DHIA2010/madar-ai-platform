// @vitest-environment node

import { describe, expect, it } from "vitest"

import { createIntegrationPlatform } from "../bootstrap/create-integration-platform"
import { createInMemoryIntegrationRepositories } from "../infrastructure/storage/in-memory"
import { ConnectorRegistry } from "../application/registry/connector-registry"
import { IntegrationPlatformService } from "../service"

function actor() {
  return {
    userId: "system",
    sessionId: "session",
    organizationId: "org",
    workspaceId: "workspace",
    roles: ["owner" as const],
  }
}

describe("integration platform", () => {
  it("supports connector registration and oauth lifecycle in memory", async () => {
    const platform = createIntegrationPlatform()
    const service = platform.services.integrations

    const connector = await service.registerConnector(actor() as never, {
      connectorId: "google_ads",
      displayName: "Google Ads",
      capabilities: [{ key: "oauth.start", name: "OAuth Start", enabled: true }],
    })

    const connection = await service.createConnection(actor() as never, { connectorId: connector.connectorId, workspaceId: actor().workspaceId })
    const oauth = await service.startOAuth(actor() as never, connection.id)
    const completed = await service.completeOAuth(actor() as never, { state: oauth.session.state, code: "code-123", redirectUri: "https://madar.local/oauth/callback" })

    expect(completed.connection.status).toBe("connected")
  })

  it("has repository contracts for the core aggregates", async () => {
    const repositories = createInMemoryIntegrationRepositories()
    const registry = new ConnectorRegistry()
    const service = new IntegrationPlatformService({
      repositories,
      registry,
      oauth: {
        cipher: { encrypt: (value) => value, decrypt: (value) => value },
        adapter: {
          connectorId: "test",
          buildAuthorizationUrl: ({ state, redirectUri }) => `${redirectUri}?state=${state}`,
          async exchangeCode() {
            return { accessToken: "access", refreshToken: "refresh", expiresInSeconds: 3600, scopes: ["offline_access"] }
          },
          async refreshAccessToken() {
            return { accessToken: "access-2", refreshToken: "refresh", expiresInSeconds: 3600, scopes: ["offline_access"] }
          },
        },
      },
    })

    const connector = await service.registerConnector(actor() as never, { connectorId: "test", displayName: "Test Connector" })
    const capabilities = await service.getConnectorCapabilities(actor() as never, connector.connectorId)
    expect(capabilities).toHaveLength(0)
  })
})

// @vitest-environment node

import { describe, expect, it } from "vitest"

import {
  CapabilityRegistry,
  ConnectorRegistry,
  MetadataRegistry,
} from "../application"
import {
  ExecutionBus,
  ExecutionDispatcher,
  ExecutionEngineRegistry,
  ExecutionRuntime,
  LocalExecutionEngine,
  createLocalExecutionManifest,
} from "../execution"
import {
  GoogleAdsConnectorV2,
  InMemoryN8nWorkflowAdapter,
} from "../integration"
import { ConnectorManifestRegistry } from "../manifest"
import { PluginRegistry } from "../plugins"
import { AesSecretCipher } from "../infrastructure/crypto/aes-secret-cipher"
import { createInMemoryIntegrationRepositories } from "../infrastructure/storage/in-memory"

interface Harness {
  connector: GoogleAdsConnectorV2
  repositories: ReturnType<typeof createInMemoryIntegrationRepositories>
  connectorRegistry: ConnectorRegistry
  metadataRegistry: MetadataRegistry
  capabilityRegistry: CapabilityRegistry
  manifestRegistry: ConnectorManifestRegistry
  pluginRegistry: PluginRegistry
  executionEngines: ExecutionEngineRegistry
  executionRuntime: ExecutionRuntime
  executionBus: ExecutionBus
  n8nAdapter: InMemoryN8nWorkflowAdapter
}

function createHarness(input?: {
  repositories?: ReturnType<typeof createInMemoryIntegrationRepositories>
  connectorRegistry?: ConnectorRegistry
  manifestRegistry?: ConnectorManifestRegistry
  pluginRegistry?: PluginRegistry
  n8nAdapter?: InMemoryN8nWorkflowAdapter
}): Harness {
  const repositories = input?.repositories ?? createInMemoryIntegrationRepositories()
  const connectorRegistry = input?.connectorRegistry ?? new ConnectorRegistry()
  const metadataRegistry = connectorRegistry.getMetadataRegistry()
  const capabilityRegistry = new CapabilityRegistry(metadataRegistry)
  const manifestRegistry =
    input?.manifestRegistry ?? new ConnectorManifestRegistry({ platformVersion: "1.5.0" })
  const pluginRegistry =
    input?.pluginRegistry ??
    new PluginRegistry({ platformVersion: "1.5.0", manifestRegistry })
  const n8nAdapter = input?.n8nAdapter ?? new InMemoryN8nWorkflowAdapter()

  const executionEngines = new ExecutionEngineRegistry()
  executionEngines.register(new LocalExecutionEngine(), createLocalExecutionManifest())
  const executionDispatcher = new ExecutionDispatcher(executionEngines)
  const executionBus = new ExecutionBus({ dispatcher: executionDispatcher })
  const executionRuntime = new ExecutionRuntime({
    registry: executionEngines,
    dispatcher: executionDispatcher,
    bus: executionBus,
  })

  const connector = new GoogleAdsConnectorV2({
    repositories,
    connectorRegistry,
    metadataRegistry,
    capabilityRegistry,
    manifestRegistry,
    pluginRegistry,
    executionEngines,
    executionRuntime,
    executionBus,
    secretCipher: new AesSecretCipher("google-ads-v2-test-key"),
    n8nAdapter,
  })

  return {
    connector,
    repositories,
    connectorRegistry,
    metadataRegistry,
    capabilityRegistry,
    manifestRegistry,
    pluginRegistry,
    executionEngines,
    executionRuntime,
    executionBus,
    n8nAdapter,
  }
}

describe("phase 9 google ads v2 connector", () => {
  it("passes end-to-end lifecycle using platform runtime, bus, registries, manifest, and plugin contracts", async () => {
    const harness = createHarness()

    await harness.connector.install()

    const connection = await harness.connector.createConnection({
      organizationId: "org-1",
      workspaceId: "ws-1",
      projectId: "project-1",
    })

    const oauth = await harness.connector.startOAuth(connection.id)
    const connected = await harness.connector.completeOAuth({
      state: oauth.session.state,
      code: "oauth-code-1",
      redirectUri: "https://madar.local/oauth/callback",
    })

    expect(connected.connection.status).toBe("connected")

    const accounts = await harness.connector.discoverAccounts(connection.id)
    expect(accounts).toHaveLength(2)

    const capabilities = await harness.connector.discoverCapabilities()
    expect(capabilities.some((entry) => entry.capabilityKey === "sync")).toBe(true)

    const imported = await harness.connector.importAccounts(
      connection.id,
      accounts.map((account) => account.accountId)
    )
    expect(imported.status).toBe("completed")

    const syncResult = await harness.connector.sync(connection.id)
    const reSyncResult = await harness.connector.resync(connection.id)
    expect(syncResult.status).toBe("completed")
    expect(reSyncResult.status).toBe("completed")

    const health = await harness.connector.health(connection.id)
    expect(health.status).toBe("healthy")

    const observability = await harness.connector.observability(connection.id)
    expect(observability.executionEvents.some((event) => event.type === "ExecutionCompleted")).toBe(true)
    expect(observability.busEnvelopes.length > 0).toBe(true)

    const disconnected = await harness.connector.disconnect(connection.id)
    expect(disconnected.status).toBe("disconnected")

    const reconnected = await harness.connector.reconnect(connection.id, "oauth-code-2")
    expect(reconnected.connection.status).toBe("connected")

    const deleted = await harness.connector.deleteConnection(connection.id)
    expect(deleted.status).toBe("deleted")
  })

  it("survives browser refresh, backend restart, n8n restart, and supports multiple accounts", async () => {
    const initial = createHarness()
    await initial.connector.install()

    const connection = await initial.connector.createConnection({
      organizationId: "org-2",
      workspaceId: "ws-2",
    })

    const oauth = await initial.connector.startOAuth(connection.id)
    await initial.connector.completeOAuth({
      state: oauth.session.state,
      code: "oauth-code-restart",
      redirectUri: "https://madar.local/oauth/callback",
    })

    const accounts = await initial.connector.discoverAccounts(connection.id)
    await initial.connector.importAccounts(
      connection.id,
      accounts.map((account) => account.accountId)
    )
    await initial.connector.sync(connection.id)

    // Browser refresh: same backend/runtime, repeated connector actions keep working.
    const browserRefreshAccounts = await initial.connector.discoverAccounts(connection.id)
    expect(browserRefreshAccounts).toHaveLength(2)

    // Backend restart: rebuild connector/runtime stack against the same repositories and registries.
    const afterBackendRestart = createHarness({
      repositories: initial.repositories,
      connectorRegistry: initial.connectorRegistry,
      manifestRegistry: initial.manifestRegistry,
      pluginRegistry: initial.pluginRegistry,
      n8nAdapter: initial.n8nAdapter,
    })
    await afterBackendRestart.connector.install()
    const backendRestartResync = await afterBackendRestart.connector.resync(connection.id)
    expect(backendRestartResync.status).toBe("completed")

    // n8n restart: adapter is restarted and runtime execution continues.
    afterBackendRestart.n8nAdapter.restart()
    const n8nRestartSync = await afterBackendRestart.connector.sync(connection.id)
    expect(n8nRestartSync.status).toBe("completed")

    const storedConnection = await afterBackendRestart.repositories.connections.findById(connection.id)
    expect(Array.isArray(storedConnection?.metadata.selectedAccountIds)).toBe(true)
    expect((storedConnection?.metadata.selectedAccountIds as string[]).length).toBe(2)
    expect(storedConnection?.lastSyncedAt).toBeTruthy()
  })
})

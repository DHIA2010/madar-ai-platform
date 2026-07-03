import { randomUUID } from "node:crypto"

import { INTEGRATION_ERRORS } from "../../application/errors/IntegrationPlatformError"
import type { CapabilityRegistry, ConnectorRegistry, MetadataRegistry } from "../../application"
import type { SecretCipher } from "../../application/ports"
import {
  createConnection,
  createConnector,
  createConnectorHealth,
  type ConnectionState,
} from "../../domain/entities"
import type { IntegrationRepositories } from "../../domain/repositories"
import type {
  ExecutionBus,
  ExecutionEngineRegistry,
  ExecutionEvent,
  ExecutionRuntime,
  ExecutionRuntimeRequest,
} from "../../execution"
import { OAuthEngine } from "../../infrastructure/oauth/oauth-engine"
import type { ConnectorManifest } from "../../manifest"
import type { ConnectorManifestRegistry } from "../../manifest"
import type { PluginRegistry } from "../../plugins"
import { GoogleAdsV2ExecutionEngine, createGoogleAdsV2ExecutionManifest } from "./execution-engine"
import {
  GoogleAdsV2Api,
  GoogleAdsV2OAuthAdapter,
  type GoogleAdsAccountProfile,
} from "./oauth-adapter"
import { InMemoryN8nWorkflowAdapter, type N8nWorkflowAdapter } from "./n8n-adapter"

export interface GoogleAdsV2ConnectorDependencies {
  repositories: IntegrationRepositories
  connectorRegistry: ConnectorRegistry
  metadataRegistry: MetadataRegistry
  capabilityRegistry: CapabilityRegistry
  manifestRegistry: ConnectorManifestRegistry
  pluginRegistry: PluginRegistry
  executionEngines: ExecutionEngineRegistry
  executionRuntime: ExecutionRuntime
  executionBus: ExecutionBus
  secretCipher: SecretCipher
  oauthAdapter?: GoogleAdsV2OAuthAdapter
  googleAdsApi?: GoogleAdsV2Api
  n8nAdapter?: N8nWorkflowAdapter
  now?: () => string
}

export interface GoogleAdsV2ObservabilitySnapshot {
  executionEvents: ExecutionEvent[]
  busEnvelopes: Array<{ kind: string; executionId: string; correlationId: string; traceId: string }>
  runtimeMetrics: ReturnType<ExecutionRuntime["getMetrics"]>
}

const CONNECTOR_ID = "google_ads"

export class GoogleAdsConnectorV2 {
  private readonly oauthAdapter: GoogleAdsV2OAuthAdapter
  private readonly oauthEngine: OAuthEngine
  private readonly googleAdsApi: GoogleAdsV2Api
  private readonly n8nAdapter: N8nWorkflowAdapter
  private readonly busEnvelopes: Array<{
    kind: string
    executionId: string
    correlationId: string
    traceId: string
  }> = []

  constructor(private readonly deps: GoogleAdsV2ConnectorDependencies) {
    this.oauthAdapter = deps.oauthAdapter ?? new GoogleAdsV2OAuthAdapter()
    this.googleAdsApi = deps.googleAdsApi ?? new GoogleAdsV2Api()
    this.n8nAdapter = deps.n8nAdapter ?? new InMemoryN8nWorkflowAdapter()

    this.oauthEngine = new OAuthEngine({
      sessions: deps.repositories.oauthSessions,
      tokens: deps.repositories.oauthTokens,
      credentials: deps.repositories.credentials,
      cipher: deps.secretCipher,
      adapter: this.oauthAdapter,
      now: deps.now,
    })

    this.deps.executionBus.subscribe({
      onEnvelope: (envelope) => {
        this.busEnvelopes.push({
          kind: envelope.kind,
          executionId: envelope.executionId,
          correlationId: envelope.metadata.correlationId,
          traceId: envelope.metadata.traceId,
        })
      },
    })
  }

  private now() {
    return this.deps.now?.() ?? new Date().toISOString()
  }

  private manifest(): ConnectorManifest {
    return {
      manifestType: "connector-manifest",
      connectorId: CONNECTOR_ID,
      connectorVersion: "2.0.0",
      sdkVersion: "1.0.0",
      provider: { providerId: "google", displayName: "Google" },
      displayName: "Google Ads V2",
      authenticationType: "oauth2",
      requiredOAuthScopes: [
        "https://www.googleapis.com/auth/adwords",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      capabilities: [
        { capabilityKey: "account.discovery", displayName: "Account Discovery", enabled: true },
        {
          capabilityKey: "capability.discovery",
          displayName: "Capability Discovery",
          enabled: true,
        },
        { capabilityKey: "data.import", displayName: "Import", enabled: true },
        { capabilityKey: "sync", displayName: "Sync", enabled: true },
        { capabilityKey: "resync", displayName: "Re-sync", enabled: true },
      ],
      supportedObjects: [
        {
          objectId: "account",
          displayName: "Google Ads Account",
          fields: [
            {
              fieldId: "account_id",
              displayName: "Account ID",
              dataType: "string",
              required: true,
            },
            {
              fieldId: "customer_id",
              displayName: "Customer ID",
              dataType: "string",
              required: true,
            },
            { fieldId: "name", displayName: "Name", dataType: "string", required: true },
          ],
        },
      ],
      supportedOperations: [
        {
          operationId: "accounts.discover",
          displayName: "Discover Accounts",
          operationType: "read",
          objectId: "account",
          supportedCapabilityKeys: ["account.discovery"],
          supportedWorkflowTypes: ["sync"],
          supportedEvents: ["accounts.discovered"],
          supportedCommands: ["accounts.discover"],
        },
        {
          operationId: "accounts.import",
          displayName: "Import Accounts",
          operationType: "action",
          objectId: "account",
          supportedCapabilityKeys: ["data.import"],
          supportedWorkflowTypes: ["sync"],
          supportedEvents: ["accounts.imported"],
          supportedCommands: ["accounts.import"],
        },
        {
          operationId: "accounts.sync",
          displayName: "Sync Accounts",
          operationType: "action",
          objectId: "account",
          supportedCapabilityKeys: ["sync", "resync"],
          supportedWorkflowTypes: ["sync"],
          supportedEvents: ["accounts.synced"],
          supportedCommands: ["accounts.sync", "accounts.resync"],
        },
      ],
      workflowTemplates: [
        {
          templateId: "google-ads-incremental-sync",
          displayName: "Google Ads Incremental Sync",
          workflowType: "sync",
          operationIds: ["accounts.sync"],
          eventIds: ["accounts.synced"],
          commandIds: ["accounts.sync"],
        },
      ],
      supportedEvents: ["accounts.discovered", "accounts.imported", "accounts.synced"],
      supportedCommands: [
        "accounts.discover",
        "accounts.import",
        "accounts.sync",
        "accounts.resync",
      ],
      healthChecks: [
        {
          checkId: "oauth-token-health",
          displayName: "OAuth Token Health",
          intervalSeconds: 300,
          timeoutMs: 3000,
        },
        {
          checkId: "sync-runtime-health",
          displayName: "Sync Runtime Health",
          intervalSeconds: 120,
          timeoutMs: 2000,
        },
      ],
      rateLimits: [
        { limitId: "google-ads-api", scope: "connection", maxRequests: 1000, intervalSeconds: 60 },
      ],
      dependencies: [{ dependencyId: "n8n", type: "service", minVersion: "1.0.0" }],
      minimumPlatformVersion: "1.0.0",
      maximumPlatformVersion: "2.0.0",
      compatibilityRules: [
        { ruleId: "oauth2-required", description: "OAuth2 is mandatory.", required: true },
      ],
    }
  }

  async install() {
    const existingManifest = this.deps.manifestRegistry.find(CONNECTOR_ID)
    const manifest = existingManifest ?? this.deps.manifestRegistry.register(this.manifest())

    this.deps.metadataRegistry.register({
      connectorId: CONNECTOR_ID,
      displayName: manifest.displayName,
      description: "Google Ads V2 connector built on execution runtime.",
      provider: manifest.provider,
      authenticationType: manifest.authenticationType,
      version: manifest.connectorVersion,
      objects: manifest.supportedObjects.map((objectEntry) => ({
        objectKey: objectEntry.objectId,
        displayName: objectEntry.displayName,
        fields: objectEntry.fields.map((field) => ({
          fieldKey: field.fieldId,
          displayName: field.displayName,
          dataType: field.dataType,
          required: field.required,
        })),
        relationships: [],
        metrics: [],
        dimensions: [],
        operations: manifest.supportedOperations
          .filter((operation) => operation.objectId === objectEntry.objectId)
          .map((operation) => ({
            operationKey: operation.operationId,
            displayName: operation.displayName,
            operationType: operation.operationType,
            objectKey: operation.objectId,
            supportedWorkflowTypes: operation.supportedWorkflowTypes,
            supportedEvents: operation.supportedEvents,
            supportedCommands: operation.supportedCommands,
            supportedCapabilityKeys: operation.supportedCapabilityKeys,
          })),
      })),
      capabilities: manifest.capabilities.map((capability) => ({
        capabilityKey: capability.capabilityKey,
        displayName: capability.displayName,
        enabled: capability.enabled,
        description: capability.description,
      })),
      operations: manifest.supportedOperations.map((operation) => ({
        operationKey: operation.operationId,
        displayName: operation.displayName,
        operationType: operation.operationType,
        objectKey: operation.objectId,
        supportedWorkflowTypes: operation.supportedWorkflowTypes,
        supportedEvents: operation.supportedEvents,
        supportedCommands: operation.supportedCommands,
        supportedCapabilityKeys: operation.supportedCapabilityKeys,
      })),
      supportedWorkflowTypes: ["sync"],
      supportedEvents: manifest.supportedEvents,
      supportedCommands: manifest.supportedCommands,
      healthChecks: manifest.healthChecks.map((check) => ({
        healthCheckKey: check.checkId,
        displayName: check.displayName,
        intervalSeconds: check.intervalSeconds,
        timeoutMs: check.timeoutMs,
      })),
      rateLimits: manifest.rateLimits.map((limit) => ({
        limitKey: limit.limitId,
        scope: limit.scope,
        maxRequests: limit.maxRequests,
        intervalSeconds: limit.intervalSeconds,
      })),
      workflowTemplates: manifest.workflowTemplates.map((template) => ({
        templateKey: template.templateId,
        displayName: template.displayName,
        workflowType: template.workflowType,
        operationKeys: template.operationIds,
        eventKeys: template.eventIds,
        commandKeys: template.commandIds,
      })),
    })

    this.deps.connectorRegistry.registerMetadata(this.deps.metadataRegistry.find(CONNECTOR_ID)!)

    const existing = await this.deps.repositories.connectors.findByConnectorId(CONNECTOR_ID)
    if (!existing) {
      await this.deps.repositories.connectors.save(
        createConnector({
          id: randomUUID(),
          connectorId: CONNECTOR_ID,
          displayName: "Google Ads V2",
          description: "Google Ads connector running on the new integration platform.",
          version: "2.0.0",
          status: "active",
          capabilities: this.deps.capabilityRegistry
            .list(CONNECTOR_ID)
            .map((capability) => ({
              key: capability.capabilityKey,
              name: capability.displayName,
              enabled: capability.enabled,
            })),
          configuration: {},
        })
      )
    }

    if (!this.deps.executionEngines.find("google-ads-v2-engine")) {
      this.deps.executionEngines.register(
        new GoogleAdsV2ExecutionEngine("google-ads-v2-engine", this.n8nAdapter),
        createGoogleAdsV2ExecutionManifest()
      )
    }

    if (!this.deps.pluginRegistry.findByConnector(CONNECTOR_ID)) {
      this.deps.pluginRegistry.register({
        pluginId: "google-ads-v2-plugin",
        manifest,
        implementation: {
          async setup() {
            return
          },
        },
      })
    }

    return {
      connectorId: CONNECTOR_ID,
      pluginId: "google-ads-v2-plugin",
    }
  }

  async createConnection(input: {
    organizationId: string
    workspaceId: string
    projectId?: string | null
    metadata?: Record<string, unknown>
  }) {
    const connector = await this.deps.repositories.connectors.findByConnectorId(CONNECTOR_ID)
    if (!connector) {
      throw INTEGRATION_ERRORS.notFound("Connector")
    }

    const connection = createConnection({
      id: randomUUID(),
      connectorId: CONNECTOR_ID,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      projectId: input.projectId ?? null,
      capabilities: connector.capabilities.map((capability) => capability.key),
      metadata: {
        selectedAccountIds: [],
        importedAccountIds: [],
        executionIds: [],
        ...input.metadata,
      },
    })

    await this.deps.repositories.connections.save(connection)
    return connection
  }

  async startOAuth(connectionId: string, redirectUri = "https://madar.local/oauth/callback") {
    const connection = await this.requireConnection(connectionId)
    const connector = await this.deps.repositories.connectors.findByConnectorId(CONNECTOR_ID)
    if (!connector) {
      throw INTEGRATION_ERRORS.notFound("Connector")
    }

    const oauth = await this.oauthEngine.start({
      connectionId,
      connectorId: connector.id,
      redirectUri,
      scopes: this.manifest().requiredOAuthScopes,
      offlineAccess: true,
    })

    await this.deps.repositories.connections.save({
      ...connection,
      status: "oauth_pending",
      oauthSessionId: oauth.session.id,
      updatedAt: this.now(),
    })

    return oauth
  }

  async completeOAuth(input: { state: string; code: string; redirectUri: string }) {
    const oauth = await this.oauthEngine.complete(input)
    const connection = await this.requireConnection(oauth.session.connectionId)

    const next = {
      ...connection,
      status: "connected" as const,
      credentialId: oauth.credential.id,
      oauthSessionId: oauth.session.id,
      providerAccountId: oauth.token.providerAccountId,
      providerEmail: oauth.token.providerEmail,
      updatedAt: this.now(),
    }

    await this.deps.repositories.connections.save(next)
    return {
      connection: next,
      credential: oauth.credential,
      token: oauth.token,
    }
  }

  async discoverAccounts(connectionId: string): Promise<GoogleAdsAccountProfile[]> {
    const connection = await this.requireConnectedConnection(connectionId)
    const credential = await this.requireCredential(connection)
    const secret = JSON.parse(this.deps.secretCipher.decrypt(credential.secretCiphertext)) as {
      accessToken: string
    }
    return this.googleAdsApi.discoverAccounts({ accessToken: secret.accessToken })
  }

  async discoverCapabilities() {
    return this.deps.capabilityRegistry.list(CONNECTOR_ID)
  }

  async importAccounts(connectionId: string, accountIds: string[]) {
    const connection = await this.requireConnectedConnection(connectionId)
    const result = await this.executeAction(connection, "import", { accountIds })
    const metadata = {
      ...connection.metadata,
      importedAccountIds: accountIds,
      selectedAccountIds: accountIds,
      executionIds: [...this.executionIds(connection), result.executionId],
    }
    await this.deps.repositories.connections.save({
      ...connection,
      metadata,
      updatedAt: this.now(),
    })
    return result
  }

  async sync(connectionId: string) {
    const connection = await this.requireConnectedConnection(connectionId)
    const result = await this.executeAction(connection, "sync", {
      accountIds: this.selectedAccountIds(connection),
      mode: "incremental",
    })
    await this.afterSync(connection, result.executionId)
    return result
  }

  async resync(connectionId: string) {
    const connection = await this.requireConnectedConnection(connectionId)
    const result = await this.executeAction(connection, "resync", {
      accountIds: this.selectedAccountIds(connection),
      mode: "full",
    })
    await this.afterSync(connection, result.executionId)
    return result
  }

  async reconnect(
    connectionId: string,
    authorizationCode: string,
    redirectUri = "https://madar.local/oauth/callback"
  ) {
    const oauth = await this.startOAuth(connectionId, redirectUri)
    return this.completeOAuth({
      state: oauth.session.state,
      code: authorizationCode,
      redirectUri,
    })
  }

  async disconnect(connectionId: string) {
    const connection = await this.requireConnection(connectionId)
    if (connection.credentialId) {
      await this.oauthEngine.revoke(connection.credentialId)
    }

    const next = {
      ...connection,
      status: "disconnected" as const,
      updatedAt: this.now(),
    }
    await this.deps.repositories.connections.save(next)
    return next
  }

  async deleteConnection(connectionId: string) {
    const connection = await this.requireConnection(connectionId)
    const next: ConnectionState = {
      ...connection,
      status: "deleted",
      updatedAt: this.now(),
      deletedAt: this.now(),
    }
    await this.deps.repositories.connections.save(next)
    return next
  }

  async health(connectionId: string) {
    const connection = await this.requireConnection(connectionId)
    const latest = await this.deps.repositories.connectorHealth.findLatestByConnectorId(
      connection.connectorId
    )
    if (latest) {
      return latest
    }
    return createConnectorHealth({
      id: randomUUID(),
      connectorId: connection.connectorId,
      connectionId: connection.id,
      status: connection.status === "connected" ? "healthy" : "unknown",
      message:
        connection.status === "connected"
          ? "Connection is healthy."
          : "Connection is not connected.",
      retryCount: 0,
      lastSyncedAt: connection.lastSyncedAt,
      nextSyncAt: null,
      metadata: {},
    })
  }

  async observability(connectionId: string): Promise<GoogleAdsV2ObservabilitySnapshot> {
    const executionIds = new Set(this.executionIds(await this.requireConnection(connectionId)))
    return {
      executionEvents: this.deps.executionRuntime
        .listEvents()
        .filter((event) => executionIds.has(event.executionId)),
      busEnvelopes: this.busEnvelopes.filter((envelope) => executionIds.has(envelope.executionId)),
      runtimeMetrics: this.deps.executionRuntime.getMetrics(),
    }
  }

  private executionIds(connection: ConnectionState) {
    const values = connection.metadata.executionIds
    return Array.isArray(values)
      ? values.filter((value): value is string => typeof value === "string")
      : []
  }

  private selectedAccountIds(connection: ConnectionState) {
    const values = connection.metadata.selectedAccountIds
    return Array.isArray(values)
      ? values.filter((value): value is string => typeof value === "string")
      : []
  }

  private async afterSync(connection: ConnectionState, executionId: string) {
    const now = this.now()
    await this.deps.repositories.connections.save({
      ...connection,
      lastSyncedAt: now,
      metadata: {
        ...connection.metadata,
        executionIds: [...this.executionIds(connection), executionId],
      },
      updatedAt: now,
    })

    await this.deps.repositories.connectorHealth.save(
      createConnectorHealth({
        id: randomUUID(),
        connectorId: connection.connectorId,
        connectionId: connection.id,
        status: "healthy",
        message: "Google Ads sync completed.",
        retryCount: 0,
        lastSyncedAt: now,
        nextSyncAt: null,
        metadata: {
          executionId,
        },
      })
    )
  }

  private async executeAction(
    connection: ConnectionState,
    action: "import" | "sync" | "resync",
    input: Record<string, unknown>
  ) {
    const executionId = randomUUID()
    const request: ExecutionRuntimeRequest = {
      executionId,
      engineId: "google-ads-v2-engine",
      connectorId: CONNECTOR_ID,
      context: {
        organization: { organizationId: connection.organizationId },
        workspace: { workspaceId: connection.workspaceId ?? "unknown-workspace" },
        project: { projectId: connection.projectId },
        connection: { connectionId: connection.id },
        workflow: { workflowId: `${CONNECTOR_ID}:${action}` },
        correlationId: `corr_${executionId}`,
        traceId: `trace_${executionId}`,
        secretsReference: connection.credentialId
          ? { provider: "integration-credential", ref: connection.credentialId }
          : null,
        metadata: {
          requestedBy: "google-ads-v2",
          source: "google-ads-v2-connector",
          attempt: 1,
          workflowVersion: "2.0.0",
          retryCount: 1,
          tags: [CONNECTOR_ID, action],
          timeoutMs: 30000,
        },
        featureFlags: {
          n8nAdapter: true,
          executionBus: true,
        },
      },
      input: {
        action,
        connectionId: connection.id,
        ...input,
      },
    }

    const result = await this.deps.executionRuntime.execute(request)
    if (result.status !== "completed") {
      throw INTEGRATION_ERRORS.invalidState(`Execution failed for action '${action}'.`)
    }
    return result
  }

  private async requireConnection(connectionId: string) {
    const connection = await this.deps.repositories.connections.findById(connectionId)
    if (!connection) {
      throw INTEGRATION_ERRORS.notFound("Connection")
    }
    return connection
  }

  private async requireConnectedConnection(connectionId: string) {
    const connection = await this.requireConnection(connectionId)
    if (connection.status !== "connected") {
      throw INTEGRATION_ERRORS.invalidState("Connection must be connected.")
    }
    return connection
  }

  private async requireCredential(connection: ConnectionState) {
    if (!connection.credentialId) {
      throw INTEGRATION_ERRORS.invalidState("Connection credential is missing.")
    }
    const credential = await this.deps.repositories.credentials.findById(connection.credentialId)
    if (!credential) {
      throw INTEGRATION_ERRORS.notFound("Credential")
    }
    return credential
  }
}

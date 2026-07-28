import { randomUUID } from "node:crypto"

import type { AuthenticatedActor } from "../identity-platform/application/dto/identity-dtos"

import { INTEGRATION_ERRORS } from "./application/errors/IntegrationPlatformError"
import type { EventPublisher, Logger, OAuthAdapter, SecretCipher } from "./application/ports"
import { ConnectorRegistry } from "./application/registry/connector-registry"
import { createConnection, createConnector, createCredential, createOAuthSession, createOAuthToken, createSyncJob, createWebhookRegistration, completeOAuthSession, revokeOAuthToken, revokeWebhookRegistration } from "./domain/entities"
import type { IntegrationRepositories } from "./domain/repositories"
import { OAuthEngine } from "./infrastructure/oauth/oauth-engine"
import { SyncEngine } from "./infrastructure/sync/sync-engine"
import { WebhookEngine } from "./infrastructure/webhook/webhook-engine"

interface IntegrationPlatformDependencies {
  repositories: IntegrationRepositories
  registry: ConnectorRegistry
  oauth: { cipher: SecretCipher; adapter: OAuthAdapter }
  eventPublisher?: EventPublisher
  logger?: Logger
  now?: () => string
}

export class IntegrationPlatformService {
  private readonly oauthEngine: OAuthEngine
  private readonly syncEngine: SyncEngine
  private readonly webhookEngine: WebhookEngine

  constructor(private readonly deps: IntegrationPlatformDependencies) {
    const now = deps.now ?? (() => new Date().toISOString())
    this.oauthEngine = new OAuthEngine({
      sessions: deps.repositories.oauthSessions,
      tokens: deps.repositories.oauthTokens,
      credentials: deps.repositories.credentials,
      cipher: deps.oauth.cipher,
      adapter: deps.oauth.adapter,
      now,
    })
    this.syncEngine = new SyncEngine(deps.repositories.syncJobs, now)
    this.webhookEngine = new WebhookEngine(deps.repositories.webhookRegistrations, deps.oauth.cipher, now)
  }

  private async publish(events: Array<{ eventId: string; eventType: string; eventVersion: number; aggregateType: string; aggregateId: string; occurredAt: string; metadata: Record<string, string>; payload: Record<string, unknown> }>) {
    if (events.length > 0) {
      await (this.deps.eventPublisher ?? { publish: async () => undefined }).publish(events)
    }
  }

  private requireAccess(actor: AuthenticatedActor) {
    if (!actor.roles.includes("owner") && !actor.roles.includes("admin")) {
      throw INTEGRATION_ERRORS.forbidden()
    }
  }

  async registerConnector(actor: AuthenticatedActor, input: { connectorId: string; displayName: string; description?: string; version?: string; capabilities?: Array<{ key: string; name: string; enabled: boolean; description?: string }> }) {
    this.requireAccess(actor)
    const connector = createConnector({
      id: randomUUID(),
      connectorId: input.connectorId,
      displayName: input.displayName,
      description: input.description ?? "",
      version: input.version ?? "1.0.0",
      status: "active",
      capabilities: input.capabilities ?? [],
      configuration: {},
    })
    await this.deps.repositories.connectors.save(connector)
    this.deps.registry.register({
      connectorId: connector.connectorId,
      displayName: connector.displayName,
      description: connector.description,
      version: connector.version,
      capabilities: connector.capabilities,
    })
    await this.publish([{
      eventId: randomUUID(),
      eventType: "ConnectorRegistered",
      eventVersion: 1,
      aggregateType: "connector",
      aggregateId: connector.id,
      occurredAt: new Date().toISOString(),
      metadata: { actorUserId: actor.userId },
      payload: { connectorId: connector.connectorId },
    }])
    return connector
  }

  async listConnectors(actor: AuthenticatedActor) {
    this.requireAccess(actor)
    return this.deps.repositories.connectors.list()
  }

  async getConnectorCapabilities(actor: AuthenticatedActor, connectorId: string) {
    this.requireAccess(actor)
    return this.deps.registry.getCapabilities(connectorId)
  }

  async getConnectorHealth(actor: AuthenticatedActor, connectorId: string) {
    this.requireAccess(actor)
    const health = await this.deps.repositories.connectorHealth.findLatestByConnectorId(connectorId)
    if (health) return health
    return {
      id: randomUUID(),
      connectorId,
      connectionId: null,
      status: "unknown" as const,
      message: "Health has not been evaluated yet.",
      retryCount: 0,
      lastSyncedAt: null,
      nextSyncAt: null,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    }
  }

  async createConnection(actor: AuthenticatedActor, input: { connectorId: string; workspaceId: string | null; projectId?: string | null; metadata?: Record<string, unknown> }) {
    this.requireAccess(actor)
    const connector = await this.deps.repositories.connectors.findByConnectorId(input.connectorId)
    if (!connector) throw INTEGRATION_ERRORS.notFound("Connector")
    const connection = createConnection({
      id: randomUUID(),
      connectorId: input.connectorId,
      organizationId: actor.organizationId,
      workspaceId: input.workspaceId,
      projectId: input.projectId ?? null,
      capabilities: connector.capabilities.map((capability) => capability.key),
      metadata: input.metadata ?? {},
    })
    await this.deps.repositories.connections.save(connection)
    return connection
  }

  async startOAuth(actor: AuthenticatedActor, connectionId: string) {
    this.requireAccess(actor)
    const connection = await this.deps.repositories.connections.findById(connectionId)
    if (!connection) throw INTEGRATION_ERRORS.notFound("Connection")
    const connector = await this.deps.repositories.connectors.findByConnectorId(connection.connectorId)
    if (!connector) throw INTEGRATION_ERRORS.notFound("Connector")
    const sessionResult = await this.oauthEngine.start({
      connectionId: connection.id,
      connectorId: connector.id,
      redirectUri: "https://madar.local/oauth/callback",
      scopes: ["offline_access"],
      offlineAccess: true,
    })
    return sessionResult
  }

  async completeOAuth(actor: AuthenticatedActor, input: { state: string; code: string; redirectUri: string }) {
    this.requireAccess(actor)
    const result = await this.oauthEngine.complete(input)
    const connection = await this.deps.repositories.connections.findById(result.session.connectionId)
    if (!connection) throw INTEGRATION_ERRORS.notFound("Connection")
    const nextConnection = { ...connection, status: "connected" as const, credentialId: result.credential.id, oauthSessionId: result.session.id, providerAccountId: result.session.state, providerEmail: result.session.state, updatedAt: new Date().toISOString() }
    await this.deps.repositories.connections.save(nextConnection)
    return { connection: nextConnection, credential: result.credential, session: result.session }
  }

  async disconnect(actor: AuthenticatedActor, connectionId: string) {
    this.requireAccess(actor)
    const connection = await this.deps.repositories.connections.findById(connectionId)
    if (!connection) throw INTEGRATION_ERRORS.notFound("Connection")
    const next = { ...connection, status: "disconnected" as const, updatedAt: new Date().toISOString() }
    await this.deps.repositories.connections.save(next)
    return next
  }

  async requestSync(actor: AuthenticatedActor, input: { connectionId: string; mode: "full" | "incremental" }) {
    this.requireAccess(actor)
    const connection = await this.deps.repositories.connections.findById(input.connectionId)
    if (!connection) throw INTEGRATION_ERRORS.notFound("Connection")
    const job = await this.syncEngine.start({ connectionId: connection.id, connectorId: connection.connectorId, mode: input.mode })
    return await this.syncEngine.complete(job.id)
  }

  async cancelSync(actor: AuthenticatedActor, syncJobId: string) {
    this.requireAccess(actor)
    return this.syncEngine.cancel(syncJobId, "Canceled by API")
  }

  async registerWebhook(actor: AuthenticatedActor, input: { connectionId: string; endpointUrl: string; secret: string; signatureHeader: string }) {
    this.requireAccess(actor)
    const connection = await this.deps.repositories.connections.findById(input.connectionId)
    if (!connection) throw INTEGRATION_ERRORS.notFound("Connection")
    return this.webhookEngine.register({
      connectorId: connection.connectorId,
      connectionId: connection.id,
      endpointUrl: input.endpointUrl,
      secret: input.secret,
      signatureHeader: input.signatureHeader,
    })
  }
}

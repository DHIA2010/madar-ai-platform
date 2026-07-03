import type {
  ConnectorConfigurationRepository,
  ConnectorHealthRepository,
  ConnectorRepository,
  ConnectionRepository,
  CredentialRepository,
  IntegrationRepositories,
  OAuthSessionRepository,
  OAuthTokenRepository,
  SyncJobRepository,
  WebhookRegistrationRepository,
} from "../../domain/repositories"
import type {
  ConnectorConfigurationState,
  ConnectorHealthState,
  ConnectorState,
  ConnectionState,
  CredentialState,
  OAuthSessionState,
  OAuthTokenState,
  SyncJobState,
  WebhookRegistrationState,
} from "../../domain/repositories"

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function upsertById<T extends { id: string }>(rows: T[], value: T) {
  const index = rows.findIndex((row) => row.id === value.id)
  const next = clone(value)
  if (index >= 0) rows[index] = next
  else rows.push(next)
}

class InMemoryConnectorRepository implements ConnectorRepository {
  constructor(private readonly rows: ConnectorState[]) {}
  async findById(id: string) { return clone(this.rows.find((row) => row.id === id) ?? null) }
  async findByConnectorId(connectorId: string) { return clone(this.rows.find((row) => row.connectorId === connectorId) ?? null) }
  async list() { return clone(this.rows) }
  async save(connector: ConnectorState) { upsertById(this.rows, connector) }
}

class InMemoryConnectionRepository implements ConnectionRepository {
  constructor(private readonly rows: ConnectionState[]) {}
  async findById(id: string) { return clone(this.rows.find((row) => row.id === id) ?? null) }
  async listByOrganizationId(organizationId: string) { return clone(this.rows.filter((row) => row.organizationId === organizationId)) }
  async listByWorkspaceId(workspaceId: string) { return clone(this.rows.filter((row) => row.workspaceId === workspaceId)) }
  async listByConnectorId(connectorId: string) { return clone(this.rows.filter((row) => row.connectorId === connectorId)) }
  async save(connection: ConnectionState) { upsertById(this.rows, connection) }
}

class InMemoryCredentialRepository implements CredentialRepository {
  constructor(private readonly rows: CredentialState[]) {}
  async findById(id: string) { return clone(this.rows.find((row) => row.id === id) ?? null) }
  async findLatestByConnectionId(connectionId: string) { return clone(this.rows.findLast((row) => row.connectionId === connectionId) ?? null) }
  async save(credential: CredentialState) { upsertById(this.rows, credential) }
}

class InMemoryOAuthSessionRepository implements OAuthSessionRepository {
  constructor(private readonly rows: OAuthSessionState[]) {}
  async findById(id: string) { return clone(this.rows.find((row) => row.id === id) ?? null) }
  async findByState(state: string) { return clone(this.rows.find((row) => row.state === state) ?? null) }
  async listByConnectionId(connectionId: string) { return clone(this.rows.filter((row) => row.connectionId === connectionId)) }
  async save(session: OAuthSessionState) { upsertById(this.rows, session) }
}

class InMemoryOAuthTokenRepository implements OAuthTokenRepository {
  constructor(private readonly rows: OAuthTokenState[]) {}
  async findById(id: string) { return clone(this.rows.find((row) => row.id === id) ?? null) }
  async findLatestByCredentialId(credentialId: string) { return clone(this.rows.findLast((row) => row.id.startsWith(credentialId)) ?? null) }
  async save(token: OAuthTokenState) { upsertById(this.rows, token) }
}

class InMemorySyncJobRepository implements SyncJobRepository {
  constructor(private readonly rows: SyncJobState[]) {}
  async findById(id: string) { return clone(this.rows.find((row) => row.id === id) ?? null) }
  async listByConnectionId(connectionId: string) { return clone(this.rows.filter((row) => row.connectionId === connectionId)) }
  async save(job: SyncJobState) { upsertById(this.rows, job) }
}

class InMemoryWebhookRegistrationRepository implements WebhookRegistrationRepository {
  constructor(private readonly rows: WebhookRegistrationState[]) {}
  async findById(id: string) { return clone(this.rows.find((row) => row.id === id) ?? null) }
  async listByConnectionId(connectionId: string) { return clone(this.rows.filter((row) => row.connectionId === connectionId)) }
  async save(registration: WebhookRegistrationState) { upsertById(this.rows, registration) }
}

class InMemoryConnectorHealthRepository implements ConnectorHealthRepository {
  constructor(private readonly rows: ConnectorHealthState[]) {}
  async findById(id: string) { return clone(this.rows.find((row) => row.id === id) ?? null) }
  async findLatestByConnectorId(connectorId: string) { return clone(this.rows.findLast((row) => row.connectorId === connectorId) ?? null) }
  async save(health: ConnectorHealthState) { upsertById(this.rows, health) }
}

class InMemoryConnectorConfigurationRepository implements ConnectorConfigurationRepository {
  constructor(private readonly rows: ConnectorConfigurationState[]) {}
  async findById(id: string) { return clone(this.rows.find((row) => row.id === id) ?? null) }
  async listByConnectorId(connectorId: string) { return clone(this.rows.filter((row) => row.connectorId === connectorId)) }
  async save(configuration: ConnectorConfigurationState) { upsertById(this.rows, configuration) }
}

export function createInMemoryIntegrationRepositories(seed?: Partial<Record<keyof IntegrationRepositories, unknown[]>>): IntegrationRepositories {
  return {
    connectors: new InMemoryConnectorRepository((seed?.connectors ?? []) as ConnectorState[]),
    connections: new InMemoryConnectionRepository((seed?.connections ?? []) as ConnectionState[]),
    credentials: new InMemoryCredentialRepository((seed?.credentials ?? []) as CredentialState[]),
    oauthSessions: new InMemoryOAuthSessionRepository((seed?.oauthSessions ?? []) as OAuthSessionState[]),
    oauthTokens: new InMemoryOAuthTokenRepository((seed?.oauthTokens ?? []) as OAuthTokenState[]),
    syncJobs: new InMemorySyncJobRepository((seed?.syncJobs ?? []) as SyncJobState[]),
    webhookRegistrations: new InMemoryWebhookRegistrationRepository((seed?.webhookRegistrations ?? []) as WebhookRegistrationState[]),
    connectorHealth: new InMemoryConnectorHealthRepository((seed?.connectorHealth ?? []) as ConnectorHealthState[]),
    connectorConfigurations: new InMemoryConnectorConfigurationRepository((seed?.connectorConfigurations ?? []) as ConnectorConfigurationState[]),
  }
}

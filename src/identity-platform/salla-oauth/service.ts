import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"

import type { SallaOAuthDomainEvent } from "./events"
import { SallaOAuthRepository } from "./repository"
import type {
  SallaOAuthCallbackResult,
  SallaOAuthStartInput,
  SallaOAuthStartResult,
  SallaOAuthTimelineEvent,
  SallaOAuthTimelineResult,
} from "./types"
import {
  EnvironmentFirstSallaOAuthCredentialsProvider,
  type SallaOAuthCredentialsProvider,
} from "./salla-credentials"

interface SallaOAuthServiceConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  successRedirectUri: string
  tokenEncryptionKey: string
  authorizationUrl: string
  tokenUrl: string
  apiBaseUrl: string
  scopes: string[]
}

interface SallaTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
}

interface SallaStoreInfo {
  id: string | number
  name?: string
  domain?: string
  currency?: string
  timezone?: string
}

// offline_access is required to receive a refresh_token at all; resource scopes
// (settings.read, orders.read, products.read, customers.read, ...) should be added via
// SALLA_OAUTH_SCOPES once MADAR actually needs that data, matching the "start minimal"
// approach used for Meta's ads_read-only default.
const DEFAULT_SCOPES = ["offline_access"]
const SALLA_AUTHORIZATION_URL = "https://accounts.salla.sa/oauth2/auth"
const SALLA_TOKEN_URL = "https://accounts.salla.sa/oauth2/token"
const SALLA_API_BASE_URL = "https://api.salla.dev/admin/v2"

function buildDefaultConfig(): SallaOAuthServiceConfig {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "http://localhost:3000"

  const configuredScopes = (process.env.SALLA_OAUTH_SCOPES ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)

  return {
    clientId: process.env.SALLA_CLIENT_ID ?? "",
    clientSecret: process.env.SALLA_CLIENT_SECRET ?? "",
    redirectUri:
      process.env.SALLA_REDIRECT_URI ??
      "http://localhost:4000/v1/integrations/salla/oauth/callback",
    successRedirectUri:
      process.env.SALLA_SUCCESS_REDIRECT_URI ?? `${appUrl.replace(/\/$/, "")}/integrations/new`,
    tokenEncryptionKey:
      process.env.IDENTITY_PLATFORM_SALLA_OAUTH_TOKEN_ENCRYPTION_KEY ??
      process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET ??
      "",
    authorizationUrl: process.env.SALLA_AUTHORIZATION_URL ?? SALLA_AUTHORIZATION_URL,
    tokenUrl: process.env.SALLA_TOKEN_URL ?? SALLA_TOKEN_URL,
    apiBaseUrl: process.env.SALLA_API_BASE_URL ?? SALLA_API_BASE_URL,
    scopes: configuredScopes.length > 0 ? configuredScopes : DEFAULT_SCOPES,
  }
}

function normalizeEncryptionKey(input: string) {
  const trimmed = input.trim()
  if (trimmed.length === 0) {
    throw new Error("SALLA_OAUTH_CONFIGURATION_ERROR")
  }

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex")
  }

  try {
    const decoded = Buffer.from(trimmed, "base64")
    if (decoded.length === 32) {
      return decoded
    }
  } catch {
    // Ignore and fallback.
  }

  if (trimmed.length === 32) {
    return Buffer.from(trimmed, "utf8")
  }

  throw new Error("SALLA_OAUTH_CONFIGURATION_ERROR")
}

function isLocalhostHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
}

function validateConfiguredUrl(raw: string, opts: { allowHttpLocalhostOnly: boolean }) {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error("SALLA_OAUTH_CONFIGURATION_ERROR")
  }

  if (parsed.username || parsed.password) {
    throw new Error("SALLA_OAUTH_CONFIGURATION_ERROR")
  }

  if (parsed.protocol === "https:") {
    return parsed
  }

  if (
    parsed.protocol === "http:" &&
    opts.allowHttpLocalhostOnly &&
    isLocalhostHost(parsed.hostname)
  ) {
    return parsed
  }

  throw new Error("SALLA_OAUTH_CONFIGURATION_ERROR")
}

function parseScopes(value: string | undefined) {
  return (value ?? "")
    .split(" ")
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function toOnboardingRedirectUrl(rawUrl: string) {
  const redirectUrl = new URL(rawUrl)
  if (redirectUrl.pathname === "/integrations" || redirectUrl.pathname === "/integrations/") {
    redirectUrl.pathname = "/integrations/new"
  }
  return redirectUrl
}

function encryptSecret(plainText: string, rawKey: string) {
  const key = normalizeEncryptionKey(rawKey)
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`
}

function decryptSecret(value: string, rawKey: string) {
  const [version, ivBase64, tagBase64, encryptedBase64] = value.split(":")
  if (version !== "v1" || !ivBase64 || !tagBase64 || !encryptedBase64) {
    throw new Error("SALLA_OAUTH_DECRYPTION_ERROR")
  }

  const key = normalizeEncryptionKey(rawKey)
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivBase64, "base64"))
  decipher.setAuthTag(Buffer.from(tagBase64, "base64"))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, "base64")),
    decipher.final(),
  ])
  return decrypted.toString("utf8")
}

function assertActorCanManageIntegrations(actor: AuthenticatedActor) {
  if (!actor.roles.includes("owner") && !actor.roles.includes("admin")) {
    throw new Error("SALLA_OAUTH_FORBIDDEN")
  }
}

function toTimelineAction(eventType: string, payload: Record<string, unknown>) {
  switch (eventType) {
    case "salla.oauth.authorization.completed":
      return payload.reconnected === true ? "connection.reconnected" : "connection.connected"
    case "salla.oauth.connection.reconnect.started":
      return "connection.reconnected"
    case "salla.oauth.connection.paused":
      return "connection.paused"
    case "salla.oauth.connection.resumed":
      return "connection.resumed"
    case "salla.oauth.connection.disconnected":
      return "connection.disconnected"
    case "salla.oauth.connection.deleted":
      return "connection.deleted"
    case "salla.oauth.token.refreshed":
      return "token.refreshed"
    default:
      return eventType
  }
}

function toTimelineMessage(action: string, payload: Record<string, unknown>) {
  if (typeof payload.message === "string" && payload.message.trim().length > 0) {
    return payload.message
  }

  switch (action) {
    case "connection.connected":
      return "Connection established."
    case "connection.reconnected":
      return "Connection re-established."
    case "connection.paused":
      return "Connection paused."
    case "connection.resumed":
      return "Connection resumed."
    case "connection.disconnected":
      return "Connection disconnected."
    case "connection.deleted":
      return "Connection deleted."
    case "token.refreshed":
      return "Access token refreshed."
    default:
      return action
  }
}

function createStateToken() {
  return `sl_${randomBytes(16).toString("hex")}_${randomUUID().replace(/-/g, "")}`
}

function ensureConfigured(config: SallaOAuthServiceConfig) {
  if (
    !config.clientId ||
    !config.clientSecret ||
    !config.redirectUri ||
    !config.successRedirectUri
  ) {
    throw new Error("SALLA_OAUTH_CONFIGURATION_ERROR")
  }

  validateConfiguredUrl(config.redirectUri, { allowHttpLocalhostOnly: true })
  validateConfiguredUrl(config.successRedirectUri, { allowHttpLocalhostOnly: true })
  validateConfiguredUrl(config.authorizationUrl, { allowHttpLocalhostOnly: false })
  validateConfiguredUrl(config.tokenUrl, { allowHttpLocalhostOnly: false })
  validateConfiguredUrl(config.apiBaseUrl, { allowHttpLocalhostOnly: false })

  if (config.scopes.length === 0) {
    throw new Error("SALLA_OAUTH_CONFIGURATION_ERROR")
  }

  normalizeEncryptionKey(config.tokenEncryptionKey)
}

async function exchangeAuthorizationCode(input: {
  code: string
  config: SallaOAuthServiceConfig
}): Promise<SallaTokenResponse> {
  const response = await fetch(input.config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: input.config.clientId,
      client_secret: input.config.clientSecret,
      redirect_uri: input.config.redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  })

  if (!response.ok) {
    throw new Error("SALLA_OAUTH_TOKEN_EXCHANGE_FAILED")
  }

  const body = (await response.json()) as SallaTokenResponse
  if (!body.access_token || typeof body.access_token !== "string") {
    throw new Error("SALLA_OAUTH_TOKEN_EXCHANGE_FAILED")
  }

  return body
}

async function refreshAccessToken(input: {
  refreshToken: string
  config: SallaOAuthServiceConfig
}): Promise<SallaTokenResponse> {
  const response = await fetch(input.config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: input.refreshToken,
      client_id: input.config.clientId,
      client_secret: input.config.clientSecret,
      grant_type: "refresh_token",
    }).toString(),
  })

  if (!response.ok) {
    throw new Error("SALLA_OAUTH_TOKEN_REFRESH_FAILED")
  }

  const body = (await response.json()) as SallaTokenResponse
  if (!body.access_token || typeof body.access_token !== "string") {
    throw new Error("SALLA_OAUTH_TOKEN_REFRESH_FAILED")
  }

  return body
}

// Salla's OAuth authorizes exactly one merchant store per connection (unlike Google/
// Snapchat/Meta, where one login can expose many ad accounts to pick from) -- so
// "discovery" here is a single GET, not a list-then-page walk. The exact response
// envelope is this module's one unverified assumption (no live Salla test store was
// available to confirm against, unlike the Meta connector which was checked against the
// real API) -- parsed defensively across the shapes Salla's Admin API docs describe.
async function fetchStoreInfo(config: SallaOAuthServiceConfig, accessToken: string) {
  const url = `${config.apiBaseUrl.replace(/\/$/, "")}/store/info`
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error("SALLA_OAUTH_ACCOUNT_DISCOVERY_FAILED")
  }

  const body = (await response.json()) as { data?: SallaStoreInfo } | SallaStoreInfo
  const store = "data" in body && body.data ? body.data : (body as SallaStoreInfo)

  if (!store || store.id === undefined || store.id === null) {
    throw new Error("SALLA_OAUTH_ACCOUNT_DISCOVERY_EMPTY")
  }

  return store
}

export class SallaOAuthService {
  private readonly config: SallaOAuthServiceConfig
  private readonly credentialsProvider: SallaOAuthCredentialsProvider

  constructor(
    private readonly repository: SallaOAuthRepository,
    config?: Partial<SallaOAuthServiceConfig>,
    credentialsProvider: SallaOAuthCredentialsProvider = new EnvironmentFirstSallaOAuthCredentialsProvider()
  ) {
    this.config = { ...buildDefaultConfig(), ...(config ?? {}) }
    this.credentialsProvider = credentialsProvider
  }

  private async loadResolvedConfig() {
    const credentials = await this.credentialsProvider.load()
    // An explicit SALLA_REDIRECT_URI always wins, even when client credentials come
    // from AWS Secrets Manager -- this lets local/dev environments redirect back to
    // themselves instead of the production callback baked into the shared secret.
    const explicitRedirectUri = process.env.SALLA_REDIRECT_URI?.trim()
    const resolved = {
      ...this.config,
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      redirectUri: explicitRedirectUri || credentials.redirectUri || this.config.redirectUri,
    }
    ensureConfigured(resolved)
    return resolved
  }

  async startAuthorization(
    actor: AuthenticatedActor,
    input: SallaOAuthStartInput = {}
  ): Promise<SallaOAuthStartResult> {
    assertActorCanManageIntegrations(actor)
    const config = await this.loadResolvedConfig()

    const resolvedProject = await this.repository.resolveProject({
      organizationId: actor.organizationId,
      workspaceId: input.workspaceId ?? actor.workspaceId ?? null,
      projectId: input.projectId ?? null,
    })

    const existingConnection = await this.repository.findConnectionByProject(
      actor.organizationId,
      resolvedProject.projectId
    )
    const connectionId = existingConnection?.id ?? randomUUID()
    const state = createStateToken()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString()

    await this.repository.upsertConnection({
      id: connectionId,
      organizationId: actor.organizationId,
      workspaceId: resolvedProject.workspaceId,
      projectId: resolvedProject.projectId,
      dataSourceId: null,
      providerAccountId: null,
      providerAccountName: null,
      providerAccountEmail: null,
      encryptedRefreshToken: existingConnection ? null : null,
      encryptedAccessToken: existingConnection ? null : null,
      scopes: config.scopes,
      tokenExpiresAt: null,
      status: "pending",
      connectionReference: input.connectionName ?? null,
      lastConnectedAt: null,
      lastDisconnectedAt: null,
      actorUserId: actor.userId,
      nowIso: now.toISOString(),
    })

    await this.repository.savePendingState({
      id: randomUUID(),
      state,
      organizationId: actor.organizationId,
      workspaceId: resolvedProject.workspaceId,
      projectId: resolvedProject.projectId,
      userId: actor.userId,
      connectionId,
      requestedScopes: config.scopes,
      redirectUri: config.redirectUri,
      expiresAt,
    })

    const authorizationUrl = new URL(config.authorizationUrl)
    authorizationUrl.searchParams.set("client_id", config.clientId)
    authorizationUrl.searchParams.set("redirect_uri", config.redirectUri)
    authorizationUrl.searchParams.set("response_type", "code")
    authorizationUrl.searchParams.set("scope", config.scopes.join(" "))
    authorizationUrl.searchParams.set("state", state)

    const startedAt = now.toISOString()
    await this.recordLifecycle(
      {
        eventType: "salla.oauth.authorization.started",
        aggregateId: connectionId,
        actorUserId: actor.userId,
        organizationId: actor.organizationId,
        workspaceId: resolvedProject.workspaceId,
        projectId: resolvedProject.projectId,
        occurredAt: startedAt,
        payload: {
          scopes: config.scopes,
          authorizationEndpoint: config.authorizationUrl,
        },
      },
      "integration.salla_oauth.started"
    )

    return {
      authorizationUrl: authorizationUrl.toString(),
      connectionId,
      state,
      projectId: resolvedProject.projectId,
      workspaceId: resolvedProject.workspaceId,
    }
  }

  async completeAuthorization(input: {
    state: string
    code: string
  }): Promise<SallaOAuthCallbackResult> {
    const config = await this.loadResolvedConfig()

    const state = await this.repository.findPendingStateByValue(input.state)
    if (!state) {
      throw new Error("SALLA_OAUTH_STATE_INVALID")
    }

    if (String(state.status) !== "pending") {
      throw new Error("SALLA_OAUTH_STATE_INVALID")
    }

    const expiresAt = new Date(String(state.expires_at)).getTime()
    if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
      throw new Error("SALLA_OAUTH_STATE_EXPIRED")
    }

    const token = await exchangeAuthorizationCode({
      code: input.code,
      config,
    })

    const connectionId = String(state.connection_id)
    const actorUserId = String(state.user_id)
    const organizationId = String(state.organization_id)
    const workspaceId = (state.workspace_id as string | null) ?? null
    const projectId = String(state.project_id)
    const now = new Date().toISOString()

    const scopes = parseScopes(token.scope)
    const effectiveScopes = scopes.length > 0 ? scopes : config.scopes

    if (!token.refresh_token || token.refresh_token.trim().length === 0) {
      throw new Error("SALLA_OAUTH_REFRESH_TOKEN_MISSING")
    }
    const refreshToken = token.refresh_token

    const store = await fetchStoreInfo(config, token.access_token)
    const discoveredAccounts = [
      {
        customerId: String(store.id),
        displayName: store.name ?? null,
        currencyCode: store.currency ?? null,
        timeZone: store.timezone ?? null,
        organizationId: null,
        organizationName: null,
        status: "active" as const,
      },
    ]

    const primaryAccount = discoveredAccounts[0]

    await this.repository.withTransaction(async () => {
      const consumed = await this.repository.consumeStateOnce(String(state.id), now)
      if (!consumed) {
        throw new Error("SALLA_OAUTH_STATE_ALREADY_CONSUMED")
      }

      await this.repository.upsertConnection({
        id: connectionId,
        organizationId,
        workspaceId,
        projectId,
        dataSourceId: null,
        providerAccountId: primaryAccount?.customerId ?? null,
        providerAccountName: primaryAccount?.displayName ?? "Salla Store",
        providerAccountEmail: null,
        encryptedRefreshToken: encryptSecret(refreshToken, config.tokenEncryptionKey),
        encryptedAccessToken: encryptSecret(token.access_token, config.tokenEncryptionKey),
        scopes: effectiveScopes,
        tokenExpiresAt: token.expires_in
          ? new Date(Date.now() + token.expires_in * 1000).toISOString()
          : null,
        status: "connected",
        connectionReference: primaryAccount?.displayName ?? null,
        lastConnectedAt: now,
        lastDisconnectedAt: null,
        actorUserId,
        nowIso: now,
      })

      await this.repository.replaceAccessibleCustomerAccounts({
        connectionId,
        actorUserId,
        selectedCustomerId: primaryAccount.customerId,
        accounts: discoveredAccounts,
      })

      await this.recordLifecycle(
        {
          eventType: "salla.oauth.authorization.completed",
          aggregateId: connectionId,
          actorUserId,
          organizationId,
          workspaceId,
          projectId,
          occurredAt: now,
          payload: {
            accountId: primaryAccount.customerId,
            accountName: primaryAccount.displayName,
            discoveredAccountCount: discoveredAccounts.length,
            tokenEndpoint: config.tokenUrl,
            discoveryEndpoint: `${config.apiBaseUrl.replace(/\/$/, "")}/store/info`,
            scopes: effectiveScopes,
          },
        },
        "integration.salla_oauth.connected"
      )
    })

    return {
      connectionId,
      projectId,
      workspaceId,
      organizationId,
      accountName: primaryAccount.displayName ?? "Salla Store",
      accountEmail: null,
      connectedAt: now,
      status: "connected",
    }
  }

  async getActiveConnection(actor: AuthenticatedActor) {
    await this.loadResolvedConfig()

    const resolvedProject = await this.repository.resolveProject({
      organizationId: actor.organizationId,
      workspaceId: actor.workspaceId ?? null,
      projectId: null,
    })

    const connection = await this.repository.findConnectionByProject(
      actor.organizationId,
      resolvedProject.projectId
    )

    if (!connection) {
      return { connection: null }
    }

    const customerAccounts =
      connection.status === "connected"
        ? await this.repository.listAccessibleCustomerAccounts(connection.id)
        : []

    return {
      connection: {
        id: connection.id,
        status: connection.status,
        providerAccountId: connection.providerAccountId,
        providerAccountName: connection.providerAccountName,
        providerAccountEmail: connection.providerAccountEmail,
        connectedAt: connection.lastConnectedAt,
        customerAccounts: customerAccounts.map((acc) => ({
          customerId: acc.customerId,
          displayName: acc.displayName,
          isSelected: acc.isSelected,
        })),
      },
    }
  }

  async resolveAccessToken(connectionId: string) {
    const config = await this.loadResolvedConfig()

    const tokenMaterial = await this.repository.getRawTokenMaterial(connectionId)
    if (
      !tokenMaterial ||
      !tokenMaterial.encryptedAccessToken ||
      !tokenMaterial.encryptedRefreshToken
    ) {
      throw new Error("SALLA_OAUTH_CONNECTION_NOT_READY")
    }

    if (tokenMaterial.tokenExpiresAt) {
      const expiresAt = new Date(tokenMaterial.tokenExpiresAt).getTime()
      if (!Number.isNaN(expiresAt) && expiresAt > Date.now() + 30_000) {
        return decryptSecret(tokenMaterial.encryptedAccessToken, config.tokenEncryptionKey)
      }
    }

    const refreshToken = decryptSecret(
      tokenMaterial.encryptedRefreshToken,
      config.tokenEncryptionKey
    )
    const refreshed = await refreshAccessToken({
      refreshToken,
      config,
    })

    const nextRefreshToken =
      refreshed.refresh_token && refreshed.refresh_token.trim().length > 0
        ? refreshed.refresh_token
        : refreshToken

    const refreshedScopes = parseScopes(refreshed.scope)
    await this.repository.updateTokenMaterial({
      connectionId,
      encryptedRefreshToken: encryptSecret(nextRefreshToken, config.tokenEncryptionKey),
      encryptedAccessToken: encryptSecret(refreshed.access_token, config.tokenEncryptionKey),
      tokenExpiresAt: refreshed.expires_in
        ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
        : null,
      scopes: refreshedScopes.length > 0 ? refreshedScopes : config.scopes,
    })

    return refreshed.access_token
  }

  private async findOwnedConnectionOrThrow(actor: AuthenticatedActor, connectionId: string) {
    const connection = await this.repository.findConnectionById(connectionId)
    if (!connection || connection.organizationId !== actor.organizationId) {
      throw new Error("SALLA_OAUTH_CONNECTION_NOT_FOUND")
    }

    if (actor.workspaceId && connection.workspaceId !== actor.workspaceId) {
      throw new Error("SALLA_OAUTH_CONNECTION_NOT_FOUND")
    }

    return connection
  }

  async pauseConnection(actor: AuthenticatedActor, connectionId: string) {
    assertActorCanManageIntegrations(actor)

    const connection = await this.findOwnedConnectionOrThrow(actor, connectionId)
    const now = new Date().toISOString()
    const nextStatus = "paused" as const

    await this.repository.withTransaction(async () => {
      await this.repository.setConnectionLifecycleStatus({
        connectionId: connection.id,
        status: nextStatus,
        actorUserId: actor.userId,
        occurredAt: now,
      })

      await this.recordLifecycle(
        {
          eventType: "salla.oauth.connection.paused",
          aggregateId: connection.id,
          actorUserId: actor.userId,
          organizationId: actor.organizationId,
          workspaceId: connection.workspaceId,
          projectId: connection.projectId,
          occurredAt: now,
          payload: {
            previousStatus: connection.status,
            nextStatus,
          },
        },
        "integration.salla_oauth.paused"
      )
    })

    return {
      connectionId: connection.id,
      status: nextStatus,
      updatedAt: now,
    }
  }

  async resumeConnection(actor: AuthenticatedActor, connectionId: string) {
    assertActorCanManageIntegrations(actor)

    const connection = await this.findOwnedConnectionOrThrow(actor, connectionId)
    const now = new Date().toISOString()
    const nextStatus = "connected" as const

    await this.repository.withTransaction(async () => {
      await this.repository.setConnectionLifecycleStatus({
        connectionId: connection.id,
        status: nextStatus,
        actorUserId: actor.userId,
        occurredAt: now,
      })

      await this.recordLifecycle(
        {
          eventType: "salla.oauth.connection.resumed",
          aggregateId: connection.id,
          actorUserId: actor.userId,
          organizationId: actor.organizationId,
          workspaceId: connection.workspaceId,
          projectId: connection.projectId,
          occurredAt: now,
          payload: {
            previousStatus: connection.status,
            nextStatus,
          },
        },
        "integration.salla_oauth.resumed"
      )
    })

    return {
      connectionId: connection.id,
      status: nextStatus,
      updatedAt: now,
    }
  }

  async pauseConnectionsForWorkspace(actor: AuthenticatedActor, workspaceId: string) {
    const connectionIds = await this.repository.listConnectionIdsByWorkspace(
      workspaceId,
      "connected"
    )
    const results = []
    for (const connectionId of connectionIds) {
      results.push(await this.pauseConnection(actor, connectionId))
    }
    return results
  }

  async resumeConnectionsForWorkspace(actor: AuthenticatedActor, workspaceId: string) {
    const connectionIds = await this.repository.listConnectionIdsByWorkspace(workspaceId, "paused")
    const results = []
    for (const connectionId of connectionIds) {
      results.push(await this.resumeConnection(actor, connectionId))
    }
    return results
  }

  async disconnectConnection(
    actor: AuthenticatedActor,
    input: { connectionId: string; reason?: string }
  ) {
    assertActorCanManageIntegrations(actor)

    const connection = await this.findOwnedConnectionOrThrow(actor, input.connectionId)
    const now = new Date().toISOString()
    const nextStatus = "disconnected" as const

    await this.repository.withTransaction(async () => {
      await this.repository.setConnectionLifecycleStatus({
        connectionId: connection.id,
        status: nextStatus,
        actorUserId: actor.userId,
        occurredAt: now,
      })

      await this.recordLifecycle(
        {
          eventType: "salla.oauth.connection.disconnected",
          aggregateId: connection.id,
          actorUserId: actor.userId,
          organizationId: actor.organizationId,
          workspaceId: connection.workspaceId,
          projectId: connection.projectId,
          occurredAt: now,
          payload: {
            previousStatus: connection.status,
            nextStatus,
            reason: input.reason ?? "Disconnected from connections center",
          },
        },
        "integration.salla_oauth.disconnected"
      )
    })

    return {
      connectionId: connection.id,
      status: nextStatus,
      updatedAt: now,
    }
  }

  async startReconnect(actor: AuthenticatedActor, connectionId: string) {
    assertActorCanManageIntegrations(actor)

    const connection = await this.findOwnedConnectionOrThrow(actor, connectionId)
    const now = new Date().toISOString()

    await this.recordLifecycle(
      {
        eventType: "salla.oauth.connection.reconnect.started",
        aggregateId: connection.id,
        actorUserId: actor.userId,
        organizationId: actor.organizationId,
        workspaceId: connection.workspaceId,
        projectId: connection.projectId,
        occurredAt: now,
        payload: {
          previousStatus: connection.status,
        },
      },
      "integration.salla_oauth.reconnect.started"
    )

    return this.startAuthorization(actor, {
      workspaceId: connection.workspaceId,
      projectId: connection.projectId,
      connectionName: connection.connectionReference,
    })
  }

  async getRecentEvents(
    actor: AuthenticatedActor,
    input: { connectionId: string; limit: number }
  ): Promise<SallaOAuthTimelineResult> {
    assertActorCanManageIntegrations(actor)

    const connection = await this.findOwnedConnectionOrThrow(actor, input.connectionId)
    const events = await this.repository.listRecentOutboxEvents(connection.id, input.limit)

    const items: SallaOAuthTimelineEvent[] = events.map((event) => {
      const payload = event.payload ?? {}
      const action = toTimelineAction(event.eventType, payload)
      const actorUserId = String((event.metadata ?? {}).actorUserId ?? "")
      return {
        id: event.id,
        action,
        occurredAt: event.occurredAt,
        actor: actorUserId.length > 0 ? "user" : "system",
        message: toTimelineMessage(action, payload),
      }
    })

    return {
      connectionId: connection.id,
      items,
    }
  }

  buildSuccessRedirect(result: SallaOAuthCallbackResult) {
    const redirectUrl = toOnboardingRedirectUrl(this.config.successRedirectUri)
    redirectUrl.searchParams.set("salla_oauth", "connected")
    redirectUrl.searchParams.set("salla_connection_id", result.connectionId)
    redirectUrl.searchParams.set("salla_project_id", result.projectId)
    redirectUrl.searchParams.set("salla_status", result.status)
    redirectUrl.searchParams.set("salla_account_name", result.accountName)
    redirectUrl.searchParams.set("salla_connected_at", result.connectedAt)
    return redirectUrl.toString()
  }

  buildErrorRedirect(reason: string) {
    const redirectUrl = new URL(this.config.successRedirectUri)
    redirectUrl.searchParams.set("salla_oauth", "error")
    redirectUrl.searchParams.set("reason", reason)
    return redirectUrl.toString()
  }

  async decryptRefreshTokenForTesting(cipherText: string) {
    return decryptSecret(cipherText, this.config.tokenEncryptionKey)
  }

  getOAuthEndpointsForTesting() {
    return {
      authorizationUrl: this.config.authorizationUrl,
      tokenUrl: this.config.tokenUrl,
      apiBaseUrl: this.config.apiBaseUrl,
    }
  }

  private async recordLifecycle(event: SallaOAuthDomainEvent, auditAction: string) {
    await this.repository.saveEvent(event.aggregateId, event.eventType, event.payload)
    await this.repository.appendAuditLog({
      actorUserId: event.actorUserId,
      organizationId: event.organizationId,
      workspaceId: event.workspaceId,
      action: auditAction,
      entityId: event.aggregateId,
      metadata: event.payload,
      createdAt: event.occurredAt,
    })

    await this.repository.appendOutboxEvent({
      eventType: event.eventType,
      aggregateId: event.aggregateId,
      occurredAt: event.occurredAt,
      metadata: {
        actorUserId: event.actorUserId,
        organizationId: event.organizationId,
        workspaceId: event.workspaceId,
        projectId: event.projectId,
      },
      payload: event.payload,
    })
  }
}

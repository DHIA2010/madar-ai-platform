import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { MetaGraphApiClient } from "../meta-ads/client"

import type { MetaOAuthDomainEvent } from "./events"
import { MetaOAuthRepository } from "./repository"
import type {
  MetaOAuthCallbackResult,
  MetaOAuthStartInput,
  MetaOAuthStartResult,
  MetaOAuthTimelineEvent,
  MetaOAuthTimelineResult,
} from "./types"
import {
  EnvironmentFirstMetaOAuthCredentialsProvider,
  type MetaOAuthCredentialsProvider,
} from "./meta-oauth-credentials"

interface MetaOAuthServiceConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  successRedirectUri: string
  tokenEncryptionKey: string
  authorizationUrl: string
  tokenUrl: string
  graphApiBaseUrl: string
  scopes: string[]
}

interface MetaTokenResponse {
  access_token: string
  token_type?: string
  expires_in?: number
}

interface MetaAdAccountApiRow {
  id: string
  name?: string
  account_status?: number
}

// ads_read is the floor for any read-only reporting connection. ads_management is only
// needed once MADAR writes campaigns; business_management is only needed for /me/businesses
// -style Business Manager asset calls. Kept minimal on purpose -- broader scopes are exactly
// what triggers a harder App Review.
const DEFAULT_SCOPES = ["ads_read"]
const META_GRAPH_API_VERSION = "v21.0"
const META_AUTHORIZATION_URL = `https://www.facebook.com/${META_GRAPH_API_VERSION}/dialog/oauth`
const META_TOKEN_URL = `https://graph.facebook.com/${META_GRAPH_API_VERSION}/oauth/access_token`
const META_GRAPH_API_BASE_URL = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`

// Meta's long-lived user tokens last ~60 days. Refreshing well before that (not at the last
// moment) keeps a slow cron/backoff from ever landing after expiry.
const TOKEN_RENEWAL_WINDOW_MS = 5 * 24 * 60 * 60 * 1000

function buildDefaultConfig(): MetaOAuthServiceConfig {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "http://localhost:3000"

  const configuredScopes = (process.env.META_OAUTH_SCOPES ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)

  return {
    clientId: process.env.META_OAUTH_CLIENT_ID ?? "",
    clientSecret: process.env.META_OAUTH_CLIENT_SECRET ?? "",
    redirectUri:
      process.env.META_OAUTH_REDIRECT_URI ??
      "http://localhost:4000/v1/integrations/meta-ads/oauth/callback",
    successRedirectUri:
      process.env.META_OAUTH_SUCCESS_REDIRECT_URI ??
      `${appUrl.replace(/\/$/, "")}/integrations/new`,
    tokenEncryptionKey:
      process.env.IDENTITY_PLATFORM_META_OAUTH_TOKEN_ENCRYPTION_KEY ??
      process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET ??
      "",
    authorizationUrl: process.env.META_OAUTH_AUTHORIZATION_URL ?? META_AUTHORIZATION_URL,
    tokenUrl: process.env.META_OAUTH_TOKEN_URL ?? META_TOKEN_URL,
    graphApiBaseUrl:
      process.env.IDENTITY_PLATFORM_META_GRAPH_API_BASE_URL ?? META_GRAPH_API_BASE_URL,
    scopes: configuredScopes.length > 0 ? configuredScopes : DEFAULT_SCOPES,
  }
}

function normalizeEncryptionKey(input: string) {
  const trimmed = input.trim()
  if (trimmed.length === 0) {
    throw new Error("META_OAUTH_CONFIGURATION_ERROR")
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

  throw new Error("META_OAUTH_CONFIGURATION_ERROR")
}

function isLocalhostHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
}

function validateConfiguredUrl(raw: string, opts: { allowHttpLocalhostOnly: boolean }) {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error("META_OAUTH_CONFIGURATION_ERROR")
  }

  if (parsed.username || parsed.password) {
    throw new Error("META_OAUTH_CONFIGURATION_ERROR")
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

  throw new Error("META_OAUTH_CONFIGURATION_ERROR")
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
    throw new Error("META_OAUTH_DECRYPTION_ERROR")
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
    throw new Error("META_OAUTH_FORBIDDEN")
  }
}

function toTimelineAction(eventType: string, payload: Record<string, unknown>) {
  switch (eventType) {
    case "meta.oauth.authorization.completed":
      return payload.reconnected === true ? "connection.reconnected" : "connection.connected"
    case "meta.oauth.connection.reconnect.started":
      return "connection.reconnected"
    case "meta.oauth.connection.paused":
      return "connection.paused"
    case "meta.oauth.connection.resumed":
      return "connection.resumed"
    case "meta.oauth.connection.disconnected":
      return "connection.disconnected"
    case "meta.oauth.connection.deleted":
      return "connection.deleted"
    case "meta.oauth.token.renewed":
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
      return "Access token renewed."
    default:
      return action
  }
}

function createStateToken() {
  return `mt_${randomBytes(16).toString("hex")}_${randomUUID().replace(/-/g, "")}`
}

function ensureConfigured(config: MetaOAuthServiceConfig) {
  if (
    !config.clientId ||
    !config.clientSecret ||
    !config.redirectUri ||
    !config.successRedirectUri
  ) {
    throw new Error("META_OAUTH_CONFIGURATION_ERROR")
  }

  validateConfiguredUrl(config.redirectUri, { allowHttpLocalhostOnly: true })
  validateConfiguredUrl(config.successRedirectUri, { allowHttpLocalhostOnly: true })
  validateConfiguredUrl(config.authorizationUrl, { allowHttpLocalhostOnly: false })
  validateConfiguredUrl(config.tokenUrl, { allowHttpLocalhostOnly: false })
  validateConfiguredUrl(config.graphApiBaseUrl, { allowHttpLocalhostOnly: false })

  if (config.scopes.length === 0) {
    throw new Error("META_OAUTH_CONFIGURATION_ERROR")
  }

  normalizeEncryptionKey(config.tokenEncryptionKey)
}

// Meta's token endpoint is GET with query params, not a POST form body like Google/Snapchat.
async function exchangeAuthorizationCode(input: {
  code: string
  config: MetaOAuthServiceConfig
}): Promise<MetaTokenResponse> {
  const url = new URL(input.config.tokenUrl)
  url.searchParams.set("client_id", input.config.clientId)
  url.searchParams.set("redirect_uri", input.config.redirectUri)
  url.searchParams.set("client_secret", input.config.clientSecret)
  url.searchParams.set("code", input.code)

  const response = await fetch(url.toString())
  if (!response.ok) {
    throw new Error("META_OAUTH_TOKEN_EXCHANGE_FAILED")
  }

  const body = (await response.json()) as MetaTokenResponse
  if (!body.access_token || typeof body.access_token !== "string") {
    throw new Error("META_OAUTH_TOKEN_EXCHANGE_FAILED")
  }

  return body
}

// Meta has no refresh_token grant. A long-lived (~60 day) token is obtained -- and later
// renewed -- by exchanging a still-valid token (short- or long-lived) for a fresh long-lived
// one via this same endpoint with grant_type=fb_exchange_token. There is no separate refresh
// secret to store.
async function exchangeForLongLivedToken(input: {
  shortLivedToken: string
  config: MetaOAuthServiceConfig
}): Promise<MetaTokenResponse> {
  const url = new URL(input.config.tokenUrl)
  url.searchParams.set("grant_type", "fb_exchange_token")
  url.searchParams.set("client_id", input.config.clientId)
  url.searchParams.set("client_secret", input.config.clientSecret)
  url.searchParams.set("fb_exchange_token", input.shortLivedToken)

  const response = await fetch(url.toString())
  if (!response.ok) {
    throw new Error("META_OAUTH_LONG_LIVED_EXCHANGE_FAILED")
  }

  const body = (await response.json()) as MetaTokenResponse
  if (!body.access_token || typeof body.access_token !== "string") {
    throw new Error("META_OAUTH_LONG_LIVED_EXCHANGE_FAILED")
  }

  return body
}

async function fetchAdAccounts(config: MetaOAuthServiceConfig, accessToken: string) {
  const client = new MetaGraphApiClient(accessToken, {
    apiBaseUrl: config.graphApiBaseUrl,
    maxRetries: 2,
    minRequestIntervalMs: 100,
  })

  const result = await client.getAllPages<MetaAdAccountApiRow>("/me/adaccounts", {
    fields: "id,name,account_status",
  })

  if (!result.ok) {
    throw new Error("META_OAUTH_ACCOUNT_DISCOVERY_FAILED")
  }

  return result.data
}

export class MetaOAuthService {
  private readonly config: MetaOAuthServiceConfig
  private readonly credentialsProvider: MetaOAuthCredentialsProvider

  constructor(
    private readonly repository: MetaOAuthRepository,
    config?: Partial<MetaOAuthServiceConfig>,
    credentialsProvider: MetaOAuthCredentialsProvider = new EnvironmentFirstMetaOAuthCredentialsProvider()
  ) {
    this.config = { ...buildDefaultConfig(), ...(config ?? {}) }
    this.credentialsProvider = credentialsProvider
  }

  private async loadResolvedConfig() {
    const credentials = await this.credentialsProvider.load()
    // An explicit META_OAUTH_REDIRECT_URI always wins, even when client credentials come
    // from AWS Secrets Manager -- this lets local/dev environments redirect back to
    // themselves instead of the production callback baked into the shared secret.
    const explicitRedirectUri = process.env.META_OAUTH_REDIRECT_URI?.trim()
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
    input: MetaOAuthStartInput = {}
  ): Promise<MetaOAuthStartResult> {
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
    authorizationUrl.searchParams.set("scope", config.scopes.join(","))
    authorizationUrl.searchParams.set("state", state)

    const startedAt = now.toISOString()
    await this.recordLifecycle(
      {
        eventType: "meta.oauth.authorization.started",
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
      "integration.meta_oauth.started"
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
  }): Promise<MetaOAuthCallbackResult> {
    const config = await this.loadResolvedConfig()

    const state = await this.repository.findPendingStateByValue(input.state)
    if (!state) {
      throw new Error("META_OAUTH_STATE_INVALID")
    }

    if (String(state.status) !== "pending") {
      throw new Error("META_OAUTH_STATE_INVALID")
    }

    const expiresAt = new Date(String(state.expires_at)).getTime()
    if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
      throw new Error("META_OAUTH_STATE_EXPIRED")
    }

    const shortLivedToken = await exchangeAuthorizationCode({
      code: input.code,
      config,
    })

    // Immediately upgrade to a long-lived (~60 day) token -- customers should never end up
    // with the short-lived (~1-2 hour) default a raw authorization-code exchange yields.
    const longLivedToken = await exchangeForLongLivedToken({
      shortLivedToken: shortLivedToken.access_token,
      config,
    })

    const connectionId = String(state.connection_id)
    const actorUserId = String(state.user_id)
    const organizationId = String(state.organization_id)
    const workspaceId = (state.workspace_id as string | null) ?? null
    const projectId = String(state.project_id)
    const now = new Date().toISOString()

    const adAccounts = await fetchAdAccounts(config, longLivedToken.access_token)
    const discoveredAccounts = adAccounts.map((account) => ({
      customerId: account.id,
      displayName: account.name ?? null,
      currencyCode: null,
      timeZone: null,
      organizationId: null,
      organizationName: null,
      status: (account.account_status === 1 ? "active" : "inactive") as "active" | "inactive",
    }))

    if (discoveredAccounts.length === 0) {
      throw new Error("META_OAUTH_ACCOUNT_DISCOVERY_EMPTY")
    }

    const primaryAccount = discoveredAccounts[0]

    await this.repository.withTransaction(async () => {
      const consumed = await this.repository.consumeStateOnce(String(state.id), now)
      if (!consumed) {
        throw new Error("META_OAUTH_STATE_ALREADY_CONSUMED")
      }

      await this.repository.upsertConnection({
        id: connectionId,
        organizationId,
        workspaceId,
        projectId,
        dataSourceId: null,
        providerAccountId: primaryAccount?.customerId ?? null,
        providerAccountName: primaryAccount?.displayName ?? "Meta Ads Account",
        providerAccountEmail: null,
        encryptedRefreshToken: null,
        encryptedAccessToken: encryptSecret(longLivedToken.access_token, config.tokenEncryptionKey),
        scopes: config.scopes,
        tokenExpiresAt: longLivedToken.expires_in
          ? new Date(Date.now() + longLivedToken.expires_in * 1000).toISOString()
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
          eventType: "meta.oauth.authorization.completed",
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
            discoveryEndpoint: `${config.graphApiBaseUrl.replace(/\/$/, "")}/me/adaccounts`,
            scopes: config.scopes,
          },
        },
        "integration.meta_oauth.connected"
      )
    })

    return {
      connectionId,
      projectId,
      workspaceId,
      organizationId,
      accountName: primaryAccount.displayName ?? "Meta Ads Account",
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
    if (!tokenMaterial || !tokenMaterial.encryptedAccessToken) {
      throw new Error("META_OAUTH_CONNECTION_NOT_READY")
    }

    const currentAccessToken = decryptSecret(
      tokenMaterial.encryptedAccessToken,
      config.tokenEncryptionKey
    )

    if (tokenMaterial.tokenExpiresAt) {
      const expiresAt = new Date(tokenMaterial.tokenExpiresAt).getTime()
      if (!Number.isNaN(expiresAt) && expiresAt > Date.now() + TOKEN_RENEWAL_WINDOW_MS) {
        return currentAccessToken
      }
    } else {
      // No known expiry -- nothing to renew against, so trust the stored token as-is.
      return currentAccessToken
    }

    // Renew by re-exchanging the still-valid current token, exactly like the initial
    // short->long exchange -- Meta has no distinct refresh_token to use instead.
    const renewed = await exchangeForLongLivedToken({
      shortLivedToken: currentAccessToken,
      config,
    })

    await this.repository.updateTokenMaterial({
      connectionId,
      encryptedAccessToken: encryptSecret(renewed.access_token, config.tokenEncryptionKey),
      encryptedRefreshToken: null,
      tokenExpiresAt: renewed.expires_in
        ? new Date(Date.now() + renewed.expires_in * 1000).toISOString()
        : null,
      scopes: config.scopes,
    })

    // No audit/lifecycle event here, matching SnapchatOAuthService.resolveAccessToken --
    // token renewal is system-triggered background maintenance, not an actor-attributable
    // action, and appendAuditLog's actor_user_id column is a uuid FK with no "system" sentinel.
    return renewed.access_token
  }

  private async findOwnedConnectionOrThrow(actor: AuthenticatedActor, connectionId: string) {
    const connection = await this.repository.findConnectionById(connectionId)
    if (!connection || connection.organizationId !== actor.organizationId) {
      throw new Error("META_OAUTH_CONNECTION_NOT_FOUND")
    }

    if (actor.workspaceId && connection.workspaceId !== actor.workspaceId) {
      throw new Error("META_OAUTH_CONNECTION_NOT_FOUND")
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
          eventType: "meta.oauth.connection.paused",
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
        "integration.meta_oauth.paused"
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
          eventType: "meta.oauth.connection.resumed",
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
        "integration.meta_oauth.resumed"
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
          eventType: "meta.oauth.connection.disconnected",
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
        "integration.meta_oauth.disconnected"
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
        eventType: "meta.oauth.connection.reconnect.started",
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
      "integration.meta_oauth.reconnect.started"
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
  ): Promise<MetaOAuthTimelineResult> {
    assertActorCanManageIntegrations(actor)

    const connection = await this.findOwnedConnectionOrThrow(actor, input.connectionId)
    const events = await this.repository.listRecentOutboxEvents(connection.id, input.limit)

    const items: MetaOAuthTimelineEvent[] = events.map((event) => {
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

  buildSuccessRedirect(result: MetaOAuthCallbackResult) {
    const redirectUrl = toOnboardingRedirectUrl(this.config.successRedirectUri)
    redirectUrl.searchParams.set("meta_oauth", "connected")
    redirectUrl.searchParams.set("meta_connection_id", result.connectionId)
    redirectUrl.searchParams.set("meta_project_id", result.projectId)
    redirectUrl.searchParams.set("meta_status", result.status)
    redirectUrl.searchParams.set("meta_account_name", result.accountName)
    redirectUrl.searchParams.set("meta_connected_at", result.connectedAt)
    return redirectUrl.toString()
  }

  buildErrorRedirect(reason: string) {
    const redirectUrl = new URL(this.config.successRedirectUri)
    redirectUrl.searchParams.set("meta_oauth", "error")
    redirectUrl.searchParams.set("reason", reason)
    return redirectUrl.toString()
  }

  async decryptAccessTokenForTesting(cipherText: string) {
    return decryptSecret(cipherText, this.config.tokenEncryptionKey)
  }

  getOAuthEndpointsForTesting() {
    return {
      authorizationUrl: this.config.authorizationUrl,
      tokenUrl: this.config.tokenUrl,
      apiBaseUrl: this.config.graphApiBaseUrl,
    }
  }

  private async recordLifecycle(event: MetaOAuthDomainEvent, auditAction: string) {
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

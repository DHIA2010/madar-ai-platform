import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"

import type { GoogleOAuthDomainEvent } from "./events"
import {
  AwsSecretsGoogleIdentityCredentialsProvider,
  type GoogleIdentityCredentials,
  type GoogleIdentityCredentialsProvider,
} from "./google-identity-credentials"
import { GoogleOAuthRepository } from "./repository"
import type {
  GoogleOAuthCallbackResult,
  GoogleOAuthTimelineEvent,
  GoogleOAuthTimelineResult,
  GoogleOAuthStartInput,
  GoogleOAuthStartResult,
} from "./types"

interface GoogleOAuthServiceConfig {
  successRedirectUri: string
  tokenEncryptionKey: string
  googleAdsApiBaseUrl: string
  scopes: string[]
}

interface GoogleTokenResponse {
  access_token: string
  expires_in?: number
  refresh_token?: string
  scope?: string
  token_type?: string
}

interface GoogleUserInfoResponse {
  id?: string
  email?: string
  name?: string
}

const GOOGLE_AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
const REQUIRED_GOOGLE_SCOPES = ["https://www.googleapis.com/auth/adwords"]
const PRODUCTION_APP_URL = "https://www.madar.my"

function buildDefaultConfig(): GoogleOAuthServiceConfig {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? PRODUCTION_APP_URL
  const defaultScopes = [
    "https://www.googleapis.com/auth/adwords",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "openid",
  ]

  const configuredScopes = (process.env.IDENTITY_PLATFORM_GOOGLE_OAUTH_SCOPES ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)

  return {
    successRedirectUri:
      process.env.IDENTITY_PLATFORM_GOOGLE_OAUTH_SUCCESS_REDIRECT_URI ??
      `${appUrl.replace(/\/$/, "")}/integrations/new`,
    tokenEncryptionKey:
      process.env.IDENTITY_PLATFORM_GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY ??
      process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET ??
      "",
    googleAdsApiBaseUrl:
      process.env.IDENTITY_PLATFORM_GOOGLE_ADS_API_BASE_URL ??
      "https://googleads.googleapis.com/v22",
    scopes: configuredScopes.length > 0 ? configuredScopes : defaultScopes,
  }
}

function normalizeEncryptionKey(input: string) {
  const trimmed = input.trim()
  if (trimmed.length === 0) {
    throw new Error("GOOGLE_OAUTH_CONFIGURATION_ERROR")
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

  throw new Error("GOOGLE_OAUTH_CONFIGURATION_ERROR")
}

function isLocalhostHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
}

function validateConfiguredUrl(raw: string, opts: { allowHttpLocalhostOnly: boolean }) {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error("GOOGLE_OAUTH_CONFIGURATION_ERROR")
  }

  if (parsed.username || parsed.password) {
    throw new Error("GOOGLE_OAUTH_CONFIGURATION_ERROR")
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

  throw new Error("GOOGLE_OAUTH_CONFIGURATION_ERROR")
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

function toTimelineAction(eventType: string, payload: Record<string, unknown>) {
  switch (eventType) {
    case "google.oauth.authorization.completed":
      return payload.reconnected === true ? "connection.reconnected" : "connection.connected"
    case "google.oauth.connection.reconnected":
      return "connection.reconnected"
    case "google.oauth.connection.paused":
      return "connection.paused"
    case "google.oauth.connection.resumed":
      return "connection.resumed"
    case "google.oauth.connection.disconnected":
      return "connection.disconnected"
    case "google.oauth.connection.deleted":
      return "connection.deleted"
    case "google.ads.sync.retry":
      return "sync.retry"
    case "google.ads.sync.started":
      return "sync.started"
    case "google.ads.sync.completed":
      return "sync.completed"
    case "google.ads.sync.failed":
      return "sync.failed"
    case "google.oauth.token.refreshed":
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
    case "sync.retry":
      return "Sync retry requested."
    case "sync.started":
      return "Sync started."
    case "sync.completed":
      return "Sync completed successfully."
    case "sync.failed":
      return "Sync failed."
    case "token.refreshed":
      return "Access token refreshed."
    default:
      return action
  }
}

function ensureRequiredScopesGranted(grantedScopes: string[], requiredScopes: string[]) {
  const granted = new Set(grantedScopes)
  const missing = requiredScopes.filter((scope) => !granted.has(scope))
  if (missing.length > 0) {
    throw new Error("GOOGLE_OAUTH_SCOPE_VALIDATION_FAILED")
  }
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
    throw new Error("GOOGLE_OAUTH_DECRYPTION_ERROR")
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
    throw new Error("GOOGLE_OAUTH_FORBIDDEN")
  }
}

function createStateToken() {
  return `go_${randomBytes(16).toString("hex")}_${randomUUID().replace(/-/g, "")}`
}

function ensureConfigured(
  config: GoogleOAuthServiceConfig,
  credentials: GoogleIdentityCredentials
) {
  if (
    !credentials.clientId ||
    !credentials.clientSecret ||
    !credentials.redirectUri ||
    !config.successRedirectUri
  ) {
    throw new Error("GOOGLE_OAUTH_CONFIGURATION_ERROR")
  }

  validateConfiguredUrl(credentials.redirectUri, { allowHttpLocalhostOnly: true })
  validateConfiguredUrl(config.successRedirectUri, { allowHttpLocalhostOnly: true })

  if (!credentials.developerToken) {
    throw new Error("GOOGLE_OAUTH_CONFIGURATION_ERROR")
  }

  if (config.scopes.length === 0) {
    throw new Error("GOOGLE_OAUTH_CONFIGURATION_ERROR")
  }

  normalizeEncryptionKey(config.tokenEncryptionKey)
}

async function exchangeAuthorizationCode(input: {
  code: string
  credentials: GoogleIdentityCredentials
}): Promise<GoogleTokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: input.credentials.clientId,
      client_secret: input.credentials.clientSecret,
      redirect_uri: input.credentials.redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  })

  if (!response.ok) {
    throw new Error("GOOGLE_OAUTH_TOKEN_EXCHANGE_FAILED")
  }

  const rawBody = await response.text()

  let body: GoogleTokenResponse
  try {
    body = JSON.parse(rawBody) as GoogleTokenResponse
  } catch {
    throw new Error("GOOGLE_OAUTH_TOKEN_EXCHANGE_FAILED")
  }

  if (!body.access_token || typeof body.access_token !== "string") {
    throw new Error("GOOGLE_OAUTH_TOKEN_EXCHANGE_FAILED")
  }

  return body
}

async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfoResponse> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  })

  if (!response.ok) {
    return {}
  }

  return (await response.json()) as GoogleUserInfoResponse
}

async function fetchAccessibleGoogleAdsCustomerIds(input: {
  accessToken: string
  apiBaseUrl: string
  developerToken: string
}) {
  const developerToken = input.developerToken.trim()
  if (developerToken.length === 0) {
    throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN_MISSING")
  }

  const requestUrl = `${input.apiBaseUrl.replace(/\/$/, "")}/customers:listAccessibleCustomers`
  const response = await fetch(requestUrl, {
    method: "GET",
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      "developer-token": developerToken,
      accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error("GOOGLE_ADS_CUSTOMER_DISCOVERY_FAILED")
  }

  const body = (await response.json()) as { resourceNames?: string[] }
  const resourceNames = Array.isArray(body.resourceNames) ? body.resourceNames : []
  const customerIds = resourceNames
    .map((resourceName) => {
      const match = /^customers\/([0-9-]+)$/.exec(resourceName)
      return match?.[1]?.replace(/-/g, "") ?? ""
    })
    .filter((entry) => entry.length > 0)

  if (customerIds.length === 0) {
    throw new Error("GOOGLE_ADS_CUSTOMER_DISCOVERY_EMPTY")
  }

  return customerIds
}

export class GoogleOAuthService {
  private readonly config: GoogleOAuthServiceConfig
  private readonly credentialsProvider: GoogleIdentityCredentialsProvider

  constructor(
    private readonly repository: GoogleOAuthRepository,
    config?: Partial<GoogleOAuthServiceConfig>,
    credentialsProvider: GoogleIdentityCredentialsProvider = new AwsSecretsGoogleIdentityCredentialsProvider()
  ) {
    this.config = { ...buildDefaultConfig(), ...(config ?? {}) }
    this.credentialsProvider = credentialsProvider
  }

  private async loadResolvedConfig() {
    const credentials = await this.credentialsProvider.load()
    ensureConfigured(this.config, credentials)
    return { config: this.config, credentials }
  }

  async startAuthorization(
    actor: AuthenticatedActor,
    input: GoogleOAuthStartInput = {}
  ): Promise<GoogleOAuthStartResult> {
    assertActorCanManageIntegrations(actor)
    const { config, credentials } = await this.loadResolvedConfig()

    const scopedConnectionId = input.connectionId ?? null
    const existingConnection = scopedConnectionId
      ? await this.repository.findConnectionById(scopedConnectionId)
      : null

    if (
      scopedConnectionId &&
      (!existingConnection || existingConnection.organizationId !== actor.organizationId)
    ) {
      throw new Error("GOOGLE_OAUTH_CONNECTION_NOT_FOUND")
    }

    const resolvedProject = existingConnection
      ? {
          projectId: existingConnection.projectId,
          workspaceId: existingConnection.workspaceId,
        }
      : await this.repository.resolveProject({
          organizationId: actor.organizationId,
          workspaceId: input.workspaceId ?? actor.workspaceId ?? null,
          projectId: input.projectId ?? null,
        })

    const projectConnection = existingConnection
      ? existingConnection
      : await this.repository.findConnectionByProject(
          actor.organizationId,
          resolvedProject.projectId
        )

    const selectedConnection = existingConnection ?? projectConnection
    const existingTokens = existingConnection
      ? await this.repository.findConnectionTokensById(existingConnection.id)
      : projectConnection
        ? await this.repository.findConnectionTokensById(projectConnection.id)
        : null
    const connectionId = selectedConnection?.id ?? randomUUID()
    const existingOwnership = selectedConnection
      ? await this.repository.findConnectionOwnershipById(selectedConnection.id)
      : null
    const oauthAccountId = existingOwnership?.oauthAccountId ?? randomUUID()
    const state = createStateToken()
    const now = new Date()
    const nowIso = now.toISOString()
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString()

    await this.repository.withTransaction(async () => {
      await this.repository.upsertOAuthAccount({
        id: oauthAccountId,
        providerFamily: "google",
        organizationId: actor.organizationId,
        workspaceId: resolvedProject.workspaceId,
        providerSubjectId: null,
        providerEmail: null,
        providerDisplayName: input.connectionName ?? null,
        grantedScopes: this.config.scopes,
        status: "pending",
        lastAuthenticatedAt: null,
        actorUserId: actor.userId,
        nowIso,
      })

      await this.repository.upsertConnection({
        id: connectionId,
        oauthAccountId,
        organizationId: actor.organizationId,
        workspaceId: resolvedProject.workspaceId,
        projectId: resolvedProject.projectId,
        dataSourceId: null,
        providerAccountId: null,
        providerAccountName: null,
        providerAccountEmail: null,
        encryptedRefreshToken: existingTokens?.encryptedRefreshToken ?? null,
        encryptedAccessToken: existingTokens?.encryptedAccessToken ?? null,
        scopes: this.config.scopes,
        tokenExpiresAt: null,
        status: "pending",
        connectionReference: input.connectionName ?? null,
        lastConnectedAt: null,
        lastDisconnectedAt: null,
        actorUserId: actor.userId,
        nowIso,
      })

      await this.repository.upsertIntegrationConnection({
        id: connectionId,
        providerId: "google-ads",
        providerFamily: "google",
        platform: "marketing",
        organizationId: actor.organizationId,
        workspaceId: resolvedProject.workspaceId,
        projectId: resolvedProject.projectId,
        oauthAccountId,
        dataSourceId: null,
        connectionReference: input.connectionName ?? null,
        status: "pending",
        lastConnectedAt: null,
        lastDisconnectedAt: null,
        actorUserId: actor.userId,
        nowIso,
      })

      const stateRecord = {
        id: randomUUID(),
        state,
        organizationId: actor.organizationId,
        workspaceId: resolvedProject.workspaceId,
        projectId: resolvedProject.projectId,
        userId: actor.userId,
        connectionId,
        oauthAccountId,
        requestedScopes: config.scopes,
        redirectUri: credentials.redirectUri,
        expiresAt,
      }

      await this.repository.savePendingState(stateRecord)
      await this.repository.saveUnifiedPendingState(stateRecord)
    })

    const authorizationUrl = new URL(GOOGLE_AUTHORIZATION_URL)
    authorizationUrl.searchParams.set("client_id", credentials.clientId)
    authorizationUrl.searchParams.set("redirect_uri", credentials.redirectUri)
    authorizationUrl.searchParams.set("response_type", "code")
    authorizationUrl.searchParams.set("scope", config.scopes.join(" "))
    authorizationUrl.searchParams.set("access_type", "offline")
    authorizationUrl.searchParams.set("prompt", "consent")
    authorizationUrl.searchParams.set("state", state)

    const startedAt = nowIso
    await this.recordLifecycle(
      {
        eventType: "google.oauth.authorization.started",
        aggregateId: connectionId,
        actorUserId: actor.userId,
        organizationId: actor.organizationId,
        workspaceId: resolvedProject.workspaceId,
        projectId: resolvedProject.projectId,
        occurredAt: startedAt,
        payload: {
          scopes: config.scopes,
        },
      },
      "integration.google_oauth.started"
    )

    return {
      authorizationUrl: authorizationUrl.toString(),
      connectionId,
      state,
      projectId: resolvedProject.projectId,
      workspaceId: resolvedProject.workspaceId,
    }
  }

  async pauseConnection(actor: AuthenticatedActor, connectionId: string) {
    assertActorCanManageIntegrations(actor)

    const connection = await this.repository.findConnectionById(connectionId)
    if (!connection || connection.organizationId !== actor.organizationId) {
      throw new Error("GOOGLE_OAUTH_CONNECTION_NOT_FOUND")
    }

    const ownership = await this.repository.findConnectionOwnershipById(connection.id)
    const now = new Date().toISOString()
    const nextStatus = "paused" as const

    await this.repository.withTransaction(async () => {
      await this.repository.setConnectionLifecycleStatus({
        connectionId: connection.id,
        status: nextStatus,
        actorUserId: actor.userId,
        occurredAt: now,
      })

      const reconciliation = await this.repository.reconcileGoogleAdsSyncRuntimeState({
        connectionId: connection.id,
        actorUserId: actor.userId,
        occurredAt: now,
        reason: "connection_paused",
      })

      await this.recordLifecycle(
        {
          eventType: "google.oauth.connection.paused",
          aggregateId: connection.id,
          actorUserId: actor.userId,
          organizationId: actor.organizationId,
          workspaceId: connection.workspaceId,
          projectId: connection.projectId,
          occurredAt: now,
          payload: {
            previousStatus: connection.status,
            nextStatus,
            oauthAccountId: ownership?.oauthAccountId ?? null,
            releasedLocks: reconciliation.releasedLocks,
            failedRuns: reconciliation.failedRuns,
          },
        },
        "integration.google_oauth.paused"
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

    const connection = await this.repository.findConnectionById(connectionId)
    if (!connection || connection.organizationId !== actor.organizationId) {
      throw new Error("GOOGLE_OAUTH_CONNECTION_NOT_FOUND")
    }

    const ownership = await this.repository.findConnectionOwnershipById(connection.id)
    const now = new Date().toISOString()
    const nextStatus = "connected" as const

    await this.repository.withTransaction(async () => {
      await this.repository.setConnectionLifecycleStatus({
        connectionId: connection.id,
        status: nextStatus,
        actorUserId: actor.userId,
        occurredAt: now,
      })

      const reconciliation = await this.repository.reconcileGoogleAdsSyncRuntimeState({
        connectionId: connection.id,
        actorUserId: actor.userId,
        occurredAt: now,
        reason: "connection_resumed",
      })

      await this.recordLifecycle(
        {
          eventType: "google.oauth.connection.resumed",
          aggregateId: connection.id,
          actorUserId: actor.userId,
          organizationId: actor.organizationId,
          workspaceId: connection.workspaceId,
          projectId: connection.projectId,
          occurredAt: now,
          payload: {
            previousStatus: connection.status,
            nextStatus,
            oauthAccountId: ownership?.oauthAccountId ?? null,
            releasedLocks: reconciliation.releasedLocks,
            failedRuns: reconciliation.failedRuns,
          },
        },
        "integration.google_oauth.resumed"
      )
    })

    return {
      connectionId: connection.id,
      status: nextStatus,
      updatedAt: now,
    }
  }

  // Cascades used when a workspace is archived/restored -- every connected
  // connection in scope is paused (or every paused one in scope is resumed),
  // reusing the same per-connection lifecycle logic so sync locks and
  // in-flight runs are handled consistently either way.
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

    const connection = await this.repository.findConnectionById(input.connectionId)
    if (!connection || connection.organizationId !== actor.organizationId) {
      throw new Error("GOOGLE_OAUTH_CONNECTION_NOT_FOUND")
    }

    const ownership = await this.repository.findConnectionOwnershipById(connection.id)
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
          eventType: "google.oauth.connection.disconnected",
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
            oauthAccountId: ownership?.oauthAccountId ?? null,
          },
        },
        "integration.google_oauth.disconnected"
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

    const connection = await this.repository.findConnectionById(connectionId)
    if (!connection || connection.organizationId !== actor.organizationId) {
      throw new Error("GOOGLE_OAUTH_CONNECTION_NOT_FOUND")
    }

    const now = new Date().toISOString()
    await this.recordLifecycle(
      {
        eventType: "google.oauth.connection.reconnect.started",
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
      "integration.google_oauth.reconnect.started"
    )

    return this.startAuthorization(actor, {
      connectionId: connection.id,
      workspaceId: connection.workspaceId,
      projectId: connection.projectId,
      connectionName: connection.connectionReference,
    })
  }

  async completeAuthorization(input: {
    state: string
    code: string
  }): Promise<GoogleOAuthCallbackResult> {
    const { config, credentials } = await this.loadResolvedConfig()

    const state = await this.repository.findPendingStateByValue(input.state)
    if (!state) {
      throw new Error("GOOGLE_OAUTH_STATE_INVALID")
    }

    if (String(state.status) !== "pending") {
      throw new Error("GOOGLE_OAUTH_STATE_INVALID")
    }

    const expiresAt = new Date(String(state.expires_at)).getTime()
    if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
      throw new Error("GOOGLE_OAUTH_STATE_EXPIRED")
    }

    const token = await exchangeAuthorizationCode({
      code: input.code,
      credentials,
    })

    const profile = await fetchGoogleUserInfo(token.access_token)
    let accessibleCustomerIds: string[] = []
    let customerDiscoveryError: string | null = null

    try {
      accessibleCustomerIds = await fetchAccessibleGoogleAdsCustomerIds({
        accessToken: token.access_token,
        apiBaseUrl: config.googleAdsApiBaseUrl,
        developerToken: credentials.developerToken,
      })
    } catch (error) {
      customerDiscoveryError =
        error instanceof Error ? error.message : "GOOGLE_ADS_CUSTOMER_DISCOVERY_FAILED"
    }

    const connectionId = String(state.connection_id ?? "")
    if (!connectionId) {
      throw new Error("GOOGLE_OAUTH_STATE_INVALID")
    }

    const existingConnection = await this.repository.findConnectionById(connectionId)
    if (!existingConnection) {
      throw new Error("GOOGLE_OAUTH_STATE_INVALID")
    }

    const existingOwnership = await this.repository.findConnectionOwnershipById(connectionId)
    const oauthAccountId = existingOwnership?.oauthAccountId ?? randomUUID()
    const actorUserId = String(state.user_id)
    const organizationId = String(state.organization_id)
    const workspaceId = (state.workspace_id as string | null) ?? null
    const projectId = String(state.project_id)
    const now = new Date().toISOString()

    const scopedValues = parseScopes(token.scope)
    const scopes = scopedValues && scopedValues.length > 0 ? scopedValues : this.config.scopes
    ensureRequiredScopesGranted(scopes, REQUIRED_GOOGLE_SCOPES)

    if (!token.refresh_token || token.refresh_token.trim().length === 0) {
      throw new Error("GOOGLE_OAUTH_REFRESH_TOKEN_MISSING")
    }
    const refreshToken = token.refresh_token

    await this.repository.withTransaction(async () => {
      const consumed = await this.repository.consumeStateOnce(String(state.id), now)
      if (!consumed) {
        throw new Error("GOOGLE_OAUTH_STATE_ALREADY_CONSUMED")
      }

      await this.repository.consumeUnifiedStateByValue(String(state.state), now)

      const encryptedRefreshToken = encryptSecret(refreshToken, config.tokenEncryptionKey)
      const encryptedAccessToken = encryptSecret(token.access_token, config.tokenEncryptionKey)

      await this.repository.upsertOAuthAccount({
        id: oauthAccountId,
        providerFamily: "google",
        organizationId,
        workspaceId,
        providerSubjectId: profile.id ?? null,
        providerEmail: profile.email ?? null,
        providerDisplayName: profile.name ?? profile.email ?? "Google Ads Account",
        grantedScopes: scopes,
        status: "active",
        lastAuthenticatedAt: now,
        actorUserId,
        nowIso: now,
      })

      await this.repository.upsertOAuthToken({
        oauthAccountId,
        encryptedRefreshToken,
        encryptedAccessToken,
        tokenType: token.token_type ?? "Bearer",
        tokenExpiresAt: token.expires_in
          ? new Date(Date.now() + token.expires_in * 1000).toISOString()
          : null,
        refreshTokenIssuedAt: now,
        nowIso: now,
      })

      await this.repository.upsertConnection({
        id: connectionId,
        oauthAccountId,
        organizationId,
        workspaceId,
        projectId,
        dataSourceId: null,
        providerAccountId: profile.id ?? null,
        providerAccountName: profile.name ?? profile.email ?? "Google Ads Account",
        providerAccountEmail: profile.email ?? null,
        encryptedRefreshToken,
        encryptedAccessToken,
        scopes,
        tokenExpiresAt: token.expires_in
          ? new Date(Date.now() + token.expires_in * 1000).toISOString()
          : null,
        status: "connected",
        connectionReference: profile.email ?? null,
        lastConnectedAt: now,
        lastDisconnectedAt: null,
        actorUserId,
        nowIso: now,
      })

      await this.repository.upsertIntegrationConnection({
        id: connectionId,
        providerId: "google-ads",
        providerFamily: "google",
        platform: "marketing",
        organizationId,
        workspaceId,
        projectId,
        oauthAccountId,
        dataSourceId: null,
        connectionReference: profile.email ?? null,
        status: "connected",
        lastConnectedAt: now,
        lastDisconnectedAt: null,
        actorUserId,
        nowIso: now,
      })

      if (accessibleCustomerIds.length > 0) {
        await this.repository.replaceAccessibleCustomerAccounts({
          connectionId,
          actorUserId,
          selectedCustomerId: accessibleCustomerIds[0] ?? null,
          accounts: accessibleCustomerIds.map((customerId) => ({
            customerId,
            displayName: `Google Ads ${customerId}`,
            currencyCode: null,
            timeZone: null,
          })),
        })
      }

      const reconnected = existingConnection.status === "disconnected"
      await this.recordLifecycle(
        {
          eventType: reconnected
            ? "google.oauth.connection.reconnected"
            : "google.oauth.authorization.completed",
          aggregateId: connectionId,
          actorUserId,
          organizationId,
          workspaceId,
          projectId,
          occurredAt: now,
          payload: {
            accountName: profile.name ?? null,
            accountEmail: profile.email ?? null,
            accessibleCustomerCount: accessibleCustomerIds.length,
            customerDiscoveryStatus: customerDiscoveryError ? "failed" : "completed",
            customerDiscoveryError,
            scopes,
            reconnected,
          },
        },
        reconnected ? "integration.google_oauth.reconnected" : "integration.google_oauth.connected"
      )
    })

    return {
      connectionId,
      projectId,
      workspaceId,
      organizationId,
      accountName: profile.name ?? profile.email ?? "Google Ads Account",
      accountEmail: profile.email ?? null,
      connectedAt: now,
      status: "connected",
    }
  }

  async getActiveConnection(actor: AuthenticatedActor) {
    const { credentials } = await this.loadResolvedConfig()

    let resolvedProject: Awaited<ReturnType<typeof this.repository.resolveProject>>
    try {
      resolvedProject = await this.repository.resolveProject({
        organizationId: actor.organizationId,
        workspaceId: actor.workspaceId ?? null,
        projectId: null,
      })
    } catch (error) {
      if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") {
        return { connection: null }
      }
      throw error
    }

    const runtimeConnection = await this.repository.findRuntimeConnectionByProject(
      actor.organizationId,
      resolvedProject.projectId
    )

    const connection = await this.repository.findConnectionByProject(
      actor.organizationId,
      resolvedProject.projectId
    )

    if (!runtimeConnection || !connection) {
      return { connection: null }
    }

    const customerAccounts =
      runtimeConnection.status === "connected"
        ? await this.repository.listAccessibleCustomerAccounts(runtimeConnection.id)
        : []

    return {
      connection: {
        id: runtimeConnection.id,
        status: runtimeConnection.status as typeof connection.status,
        providerAccountId: connection.providerAccountId,
        providerAccountName: connection.providerAccountName,
        providerAccountEmail: connection.providerAccountEmail,
        connectedAt: runtimeConnection.lastConnectedAt,
        lastSyncedAt: runtimeConnection.lastSyncedAt,
        developerTokenConfigured: credentials.developerToken.trim().length > 0,
        customerAccounts: customerAccounts.map((acc) => ({
          customerId: acc.customerId,
          displayName: acc.displayName,
          isSelected: acc.isSelected,
        })),
      },
    }
  }

  async getRecentEvents(
    actor: AuthenticatedActor,
    input: { connectionId: string; limit: number }
  ): Promise<GoogleOAuthTimelineResult> {
    assertActorCanManageIntegrations(actor)

    const connection = await this.repository.findConnectionById(input.connectionId)
    if (!connection || connection.organizationId !== actor.organizationId) {
      throw new Error("GOOGLE_OAUTH_CONNECTION_NOT_FOUND")
    }

    const events = await this.repository.listRecentOutboxEvents(connection.id, input.limit)
    const items: GoogleOAuthTimelineEvent[] = events.map((event) => {
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

  buildSuccessRedirect(result: GoogleOAuthCallbackResult) {
    const redirectUrl = toOnboardingRedirectUrl(this.config.successRedirectUri)
    redirectUrl.searchParams.set("google_oauth", "connected")
    redirectUrl.searchParams.set("google_connection_id", result.connectionId)
    redirectUrl.searchParams.set("google_project_id", result.projectId)
    redirectUrl.searchParams.set("google_status", result.status)
    redirectUrl.searchParams.set("google_account_name", result.accountName)
    if (result.accountEmail) {
      redirectUrl.searchParams.set("google_account_email", result.accountEmail)
    }
    redirectUrl.searchParams.set("google_connected_at", result.connectedAt)
    return redirectUrl.toString()
  }

  buildErrorRedirect(reason: string) {
    const redirectUrl = new URL(this.config.successRedirectUri)
    redirectUrl.searchParams.set("google_oauth", "error")
    redirectUrl.searchParams.set("reason", reason)
    return redirectUrl.toString()
  }

  async decryptRefreshTokenForTesting(cipherText: string) {
    return decryptSecret(cipherText, this.config.tokenEncryptionKey)
  }

  private async recordLifecycle(event: GoogleOAuthDomainEvent, auditAction: string) {
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

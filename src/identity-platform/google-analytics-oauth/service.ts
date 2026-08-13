import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"

import type { GoogleAnalyticsOAuthDomainEvent } from "./events"
import { GoogleAnalyticsOAuthRepository } from "./repository"
import type {
  GoogleAnalyticsOAuthCallbackResult,
  GoogleAnalyticsOAuthStartInput,
  GoogleAnalyticsOAuthStartResult,
  GoogleAnalyticsOAuthTimelineEvent,
  GoogleAnalyticsOAuthTimelineResult,
} from "./types"
import {
  EnvironmentFirstGoogleAnalyticsOAuthCredentialsProvider,
  type GoogleAnalyticsOAuthCredentialsProvider,
} from "./google-analytics-credentials"

interface GoogleAnalyticsOAuthServiceConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  successRedirectUri: string
  tokenEncryptionKey: string
  authorizationUrl: string
  tokenUrl: string
  adminApiBaseUrl: string
  scopes: string[]
}

interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
}

interface GA4PropertySummary {
  property: string // "properties/{propertyId}"
  displayName?: string
  propertyType?: string
  parent?: string
}

interface GA4AccountSummary {
  name: string // "accountSummaries/{accountId}"
  account: string // "accounts/{accountId}"
  displayName?: string
  propertySummaries?: GA4PropertySummary[]
}

interface GA4AccountSummariesResponse {
  accountSummaries?: GA4AccountSummary[]
  nextPageToken?: string
}

// Read-only scope covering GA4's Data API (reporting) and Admin API (property/account
// metadata) -- MADAR only ever reads Analytics data, so there is no reason to request a
// write scope. Matches this codebase's "start minimal" convention (Meta's ads_read-only
// default, Salla's offline_access-only default).
const DEFAULT_SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"]

// Real, standard Google endpoints -- the same OAuth endpoints already used by the Google
// Ads OAuth module (identity-platform/google-oauth/service.ts), pointed at a separate
// OAuth Client/scope so Analytics credentials never overlap with Ads credentials.
const GOOGLE_AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
// Google Analytics Admin API -- must be enabled on the Google Cloud project separately
// from the OAuth Client itself, or accountSummaries calls fail with a 403.
const GA4_ADMIN_API_BASE_URL = "https://analyticsadmin.googleapis.com/v1beta"

// Google access tokens are short-lived (typically 3600s), unlike Meta's ~60-day long-lived
// tokens -- a 5 minute renewal buffer is enough headroom without refreshing on every call.
const TOKEN_RENEWAL_WINDOW_MS = 5 * 60 * 1000

function buildDefaultConfig(): GoogleAnalyticsOAuthServiceConfig {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "http://localhost:3000"

  const configuredScopes = (process.env.GOOGLE_ANALYTICS_OAUTH_SCOPES ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)

  return {
    clientId: process.env.GOOGLE_ANALYTICS_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_ANALYTICS_CLIENT_SECRET ?? "",
    redirectUri:
      process.env.GOOGLE_ANALYTICS_REDIRECT_URI ??
      "http://localhost:4000/v1/integrations/google-analytics/oauth/callback",
    successRedirectUri:
      process.env.GOOGLE_ANALYTICS_SUCCESS_REDIRECT_URI ??
      `${appUrl.replace(/\/$/, "")}/integrations/new`,
    tokenEncryptionKey:
      process.env.IDENTITY_PLATFORM_GOOGLE_ANALYTICS_OAUTH_TOKEN_ENCRYPTION_KEY ??
      process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET ??
      "",
    authorizationUrl: process.env.GOOGLE_ANALYTICS_AUTHORIZATION_URL ?? GOOGLE_AUTHORIZATION_URL,
    tokenUrl: process.env.GOOGLE_ANALYTICS_TOKEN_URL ?? GOOGLE_TOKEN_URL,
    adminApiBaseUrl: process.env.GOOGLE_ANALYTICS_ADMIN_API_BASE_URL ?? GA4_ADMIN_API_BASE_URL,
    scopes: configuredScopes.length > 0 ? configuredScopes : DEFAULT_SCOPES,
  }
}

function normalizeEncryptionKey(input: string) {
  const trimmed = input.trim()
  if (trimmed.length === 0) {
    throw new Error("GOOGLE_ANALYTICS_OAUTH_CONFIGURATION_ERROR")
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

  throw new Error("GOOGLE_ANALYTICS_OAUTH_CONFIGURATION_ERROR")
}

function isLocalhostHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
}

function validateConfiguredUrl(raw: string, opts: { allowHttpLocalhostOnly: boolean }) {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error("GOOGLE_ANALYTICS_OAUTH_CONFIGURATION_ERROR")
  }

  if (parsed.username || parsed.password) {
    throw new Error("GOOGLE_ANALYTICS_OAUTH_CONFIGURATION_ERROR")
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

  throw new Error("GOOGLE_ANALYTICS_OAUTH_CONFIGURATION_ERROR")
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

// AES-256-GCM, the same encrypted-token format/utility pattern already used by every other
// OAuth service in this codebase (google-oauth, snapchat-oauth, meta-oauth, salla-oauth,
// shopify-oauth) -- deliberately not extracted into a shared module, matching how those
// modules each keep their own copy rather than introducing a parallel mechanism.
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
    throw new Error("GOOGLE_ANALYTICS_OAUTH_DECRYPTION_ERROR")
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
    throw new Error("GOOGLE_ANALYTICS_OAUTH_FORBIDDEN")
  }
}

function toTimelineAction(eventType: string, payload: Record<string, unknown>) {
  switch (eventType) {
    case "google_analytics.oauth.authorization.completed":
      return payload.reconnected === true ? "connection.reconnected" : "connection.connected"
    case "google_analytics.oauth.connection.reconnect.started":
      return "connection.reconnected"
    case "google_analytics.oauth.connection.paused":
      return "connection.paused"
    case "google_analytics.oauth.connection.resumed":
      return "connection.resumed"
    case "google_analytics.oauth.connection.disconnected":
      return "connection.disconnected"
    case "google_analytics.oauth.connection.deleted":
      return "connection.deleted"
    case "google_analytics.oauth.token.refreshed":
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
  return `gan_${randomBytes(16).toString("hex")}_${randomUUID().replace(/-/g, "")}`
}

function ensureConfigured(config: GoogleAnalyticsOAuthServiceConfig) {
  if (
    !config.clientId ||
    !config.clientSecret ||
    !config.redirectUri ||
    !config.successRedirectUri
  ) {
    throw new Error("GOOGLE_ANALYTICS_OAUTH_CONFIGURATION_ERROR")
  }

  validateConfiguredUrl(config.redirectUri, { allowHttpLocalhostOnly: true })
  validateConfiguredUrl(config.successRedirectUri, { allowHttpLocalhostOnly: true })
  validateConfiguredUrl(config.authorizationUrl, { allowHttpLocalhostOnly: false })
  validateConfiguredUrl(config.tokenUrl, { allowHttpLocalhostOnly: false })
  validateConfiguredUrl(config.adminApiBaseUrl, { allowHttpLocalhostOnly: false })

  if (config.scopes.length === 0) {
    throw new Error("GOOGLE_ANALYTICS_OAUTH_CONFIGURATION_ERROR")
  }

  normalizeEncryptionKey(config.tokenEncryptionKey)
}

async function exchangeAuthorizationCode(input: {
  code: string
  config: GoogleAnalyticsOAuthServiceConfig
}): Promise<GoogleTokenResponse> {
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
    throw new Error("GOOGLE_ANALYTICS_OAUTH_TOKEN_EXCHANGE_FAILED")
  }

  const body = (await response.json()) as GoogleTokenResponse
  if (!body.access_token || typeof body.access_token !== "string") {
    throw new Error("GOOGLE_ANALYTICS_OAUTH_TOKEN_EXCHANGE_FAILED")
  }

  return body
}

async function refreshAccessToken(input: {
  refreshToken: string
  config: GoogleAnalyticsOAuthServiceConfig
}): Promise<GoogleTokenResponse> {
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
    throw new Error("GOOGLE_ANALYTICS_OAUTH_TOKEN_REFRESH_FAILED")
  }

  const body = (await response.json()) as GoogleTokenResponse
  if (!body.access_token || typeof body.access_token !== "string") {
    throw new Error("GOOGLE_ANALYTICS_OAUTH_TOKEN_REFRESH_FAILED")
  }

  return body
}

function extractNumericId(resourceName: string) {
  const parts = resourceName.split("/")
  return parts[parts.length - 1] ?? resourceName
}

// One Google account can have several GA4 accounts, each with several properties --
// accountSummaries is the one Admin API call that lists all of them (and their properties)
// in a single walk, so discovery here paginates through it rather than assuming a single
// property the way Salla/Shopify's one-store-per-connection discovery does.
async function fetchAccountSummaries(
  config: GoogleAnalyticsOAuthServiceConfig,
  accessToken: string
): Promise<GA4AccountSummary[]> {
  const summaries: GA4AccountSummary[] = []
  let pageToken: string | undefined

  do {
    const url = new URL(`${config.adminApiBaseUrl.replace(/\/$/, "")}/accountSummaries`)
    url.searchParams.set("pageSize", "200")
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken)
    }

    const response = await fetch(url.toString(), {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
      },
    })

    if (!response.ok) {
      throw new Error("GOOGLE_ANALYTICS_OAUTH_ACCOUNT_DISCOVERY_FAILED")
    }

    const body = (await response.json()) as GA4AccountSummariesResponse
    summaries.push(...(body.accountSummaries ?? []))
    pageToken = body.nextPageToken
  } while (pageToken)

  return summaries
}

function flattenPropertiesFromAccountSummaries(summaries: GA4AccountSummary[]) {
  const properties: Array<{
    customerId: string
    displayName: string | null
    currencyCode: null
    timeZone: null
    organizationId: string
    organizationName: string | null
  }> = []

  for (const account of summaries) {
    const accountId = extractNumericId(account.account)
    for (const property of account.propertySummaries ?? []) {
      properties.push({
        customerId: extractNumericId(property.property),
        displayName: property.displayName ?? null,
        // Currency/timezone require a separate GET properties/{id} call per property --
        // not fetched here to keep discovery to the single accountSummaries walk.
        currencyCode: null,
        timeZone: null,
        organizationId: accountId,
        organizationName: account.displayName ?? null,
      })
    }
  }

  return properties
}

export class GoogleAnalyticsOAuthService {
  private readonly config: GoogleAnalyticsOAuthServiceConfig
  private readonly credentialsProvider: GoogleAnalyticsOAuthCredentialsProvider

  constructor(
    private readonly repository: GoogleAnalyticsOAuthRepository,
    config?: Partial<GoogleAnalyticsOAuthServiceConfig>,
    credentialsProvider: GoogleAnalyticsOAuthCredentialsProvider = new EnvironmentFirstGoogleAnalyticsOAuthCredentialsProvider()
  ) {
    this.config = { ...buildDefaultConfig(), ...(config ?? {}) }
    this.credentialsProvider = credentialsProvider
  }

  private async loadResolvedConfig() {
    const credentials = await this.credentialsProvider.load()
    // An explicit GOOGLE_ANALYTICS_REDIRECT_URI always wins, even when client credentials
    // come from AWS Secrets Manager -- this lets local/dev environments redirect back to
    // themselves instead of the production callback baked into the shared secret.
    const explicitRedirectUri = process.env.GOOGLE_ANALYTICS_REDIRECT_URI?.trim()
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
    input: GoogleAnalyticsOAuthStartInput = {}
  ): Promise<GoogleAnalyticsOAuthStartResult> {
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

    // The state token is bound server-side to this exact user, org, workspace, project,
    // and connection -- completeAuthorization() re-derives all of those from the persisted
    // row rather than trusting anything from the callback request itself.
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
    authorizationUrl.searchParams.set("access_type", "offline")
    authorizationUrl.searchParams.set("prompt", "consent")
    authorizationUrl.searchParams.set("state", state)

    const startedAt = now.toISOString()
    await this.recordLifecycle(
      {
        eventType: "google_analytics.oauth.authorization.started",
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
      "integration.google_analytics_oauth.started"
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
  }): Promise<GoogleAnalyticsOAuthCallbackResult> {
    const config = await this.loadResolvedConfig()

    // Reject missing state/code up front -- both are required to look anything up.
    if (!input.state || !input.code) {
      throw new Error("GOOGLE_ANALYTICS_OAUTH_STATE_INVALID")
    }

    const state = await this.repository.findPendingStateByValue(input.state)
    if (!state) {
      // Also covers "reused": consumeStateOnce() below only flips status once, so a state
      // that already has status !== 'pending' from a prior completed callback lands here.
      throw new Error("GOOGLE_ANALYTICS_OAUTH_STATE_INVALID")
    }

    if (String(state.status) !== "pending") {
      throw new Error("GOOGLE_ANALYTICS_OAUTH_STATE_INVALID")
    }

    const expiresAt = new Date(String(state.expires_at)).getTime()
    if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
      throw new Error("GOOGLE_ANALYTICS_OAUTH_STATE_EXPIRED")
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
      // Google only returns a refresh_token on first consent, or when prompt=consent is
      // set (which startAuthorization always does) -- if it's still missing here, the
      // exchange itself succeeded but the connection is unusable for background refresh.
      throw new Error("GOOGLE_ANALYTICS_OAUTH_REFRESH_TOKEN_MISSING")
    }
    const refreshToken = token.refresh_token

    const accountSummaries = await fetchAccountSummaries(config, token.access_token)
    const discoveredProperties = flattenPropertiesFromAccountSummaries(accountSummaries)

    if (discoveredProperties.length === 0) {
      throw new Error("GOOGLE_ANALYTICS_OAUTH_ACCOUNT_DISCOVERY_EMPTY")
    }

    const primaryProperty = discoveredProperties[0]

    await this.repository.withTransaction(async () => {
      const consumed = await this.repository.consumeStateOnce(String(state.id), now)
      if (!consumed) {
        throw new Error("GOOGLE_ANALYTICS_OAUTH_STATE_ALREADY_CONSUMED")
      }

      await this.repository.upsertConnection({
        id: connectionId,
        organizationId,
        workspaceId,
        projectId,
        dataSourceId: null,
        providerAccountId: primaryProperty.customerId,
        providerAccountName: primaryProperty.displayName ?? "Google Analytics Property",
        providerAccountEmail: null,
        encryptedRefreshToken: encryptSecret(refreshToken, config.tokenEncryptionKey),
        encryptedAccessToken: encryptSecret(token.access_token, config.tokenEncryptionKey),
        scopes: effectiveScopes,
        tokenExpiresAt: token.expires_in
          ? new Date(Date.now() + token.expires_in * 1000).toISOString()
          : null,
        status: "connected",
        connectionReference: primaryProperty.displayName,
        lastConnectedAt: now,
        lastDisconnectedAt: null,
        actorUserId,
        nowIso: now,
      })

      await this.repository.replaceAccessibleCustomerAccounts({
        connectionId,
        actorUserId,
        selectedCustomerId: primaryProperty.customerId,
        accounts: discoveredProperties,
      })

      await this.recordLifecycle(
        {
          eventType: "google_analytics.oauth.authorization.completed",
          aggregateId: connectionId,
          actorUserId,
          organizationId,
          workspaceId,
          projectId,
          occurredAt: now,
          payload: {
            accountId: primaryProperty.customerId,
            accountName: primaryProperty.displayName,
            discoveredAccountCount: discoveredProperties.length,
            tokenEndpoint: config.tokenUrl,
            discoveryEndpoint: `${config.adminApiBaseUrl.replace(/\/$/, "")}/accountSummaries`,
            scopes: effectiveScopes,
          },
        },
        "integration.google_analytics_oauth.connected"
      )
    })

    return {
      connectionId,
      projectId,
      workspaceId,
      organizationId,
      accountName: primaryProperty.displayName ?? "Google Analytics Property",
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
      throw new Error("GOOGLE_ANALYTICS_OAUTH_CONNECTION_NOT_READY")
    }

    if (tokenMaterial.tokenExpiresAt) {
      const expiresAt = new Date(tokenMaterial.tokenExpiresAt).getTime()
      if (!Number.isNaN(expiresAt) && expiresAt > Date.now() + TOKEN_RENEWAL_WINDOW_MS) {
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

    // Google does not reliably return a new refresh_token on refresh -- keep the existing
    // one unless a new one is actually issued.
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

    // No audit/lifecycle event here, matching every other OAuth service's
    // resolveAccessToken() -- token renewal is system-triggered background maintenance,
    // not an actor-attributable action, and appendAuditLog's actor_user_id column is a
    // uuid FK with no "system" sentinel.
    return refreshed.access_token
  }

  private async findOwnedConnectionOrThrow(actor: AuthenticatedActor, connectionId: string) {
    const connection = await this.repository.findConnectionById(connectionId)
    if (!connection || connection.organizationId !== actor.organizationId) {
      throw new Error("GOOGLE_ANALYTICS_OAUTH_CONNECTION_NOT_FOUND")
    }

    if (actor.workspaceId && connection.workspaceId !== actor.workspaceId) {
      throw new Error("GOOGLE_ANALYTICS_OAUTH_CONNECTION_NOT_FOUND")
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
          eventType: "google_analytics.oauth.connection.paused",
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
        "integration.google_analytics_oauth.paused"
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
          eventType: "google_analytics.oauth.connection.resumed",
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
        "integration.google_analytics_oauth.resumed"
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
          eventType: "google_analytics.oauth.connection.disconnected",
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
        "integration.google_analytics_oauth.disconnected"
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
        eventType: "google_analytics.oauth.connection.reconnect.started",
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
      "integration.google_analytics_oauth.reconnect.started"
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
  ): Promise<GoogleAnalyticsOAuthTimelineResult> {
    assertActorCanManageIntegrations(actor)

    const connection = await this.findOwnedConnectionOrThrow(actor, input.connectionId)
    const events = await this.repository.listRecentOutboxEvents(connection.id, input.limit)

    const items: GoogleAnalyticsOAuthTimelineEvent[] = events.map((event) => {
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

  buildSuccessRedirect(result: GoogleAnalyticsOAuthCallbackResult) {
    const redirectUrl = toOnboardingRedirectUrl(this.config.successRedirectUri)
    redirectUrl.searchParams.set("google_analytics_oauth", "connected")
    redirectUrl.searchParams.set("google_analytics_connection_id", result.connectionId)
    redirectUrl.searchParams.set("google_analytics_project_id", result.projectId)
    redirectUrl.searchParams.set("google_analytics_status", result.status)
    redirectUrl.searchParams.set("google_analytics_account_name", result.accountName)
    redirectUrl.searchParams.set("google_analytics_connected_at", result.connectedAt)
    return redirectUrl.toString()
  }

  buildErrorRedirect(reason: string) {
    const redirectUrl = new URL(this.config.successRedirectUri)
    redirectUrl.searchParams.set("google_analytics_oauth", "error")
    redirectUrl.searchParams.set("reason", reason)
    return redirectUrl.toString()
  }

  async decryptRefreshTokenForTesting(cipherText: string) {
    return decryptSecret(cipherText, this.config.tokenEncryptionKey)
  }

  async decryptAccessTokenForTesting(cipherText: string) {
    return decryptSecret(cipherText, this.config.tokenEncryptionKey)
  }

  getOAuthEndpointsForTesting() {
    return {
      authorizationUrl: this.config.authorizationUrl,
      tokenUrl: this.config.tokenUrl,
      adminApiBaseUrl: this.config.adminApiBaseUrl,
    }
  }

  private async recordLifecycle(event: GoogleAnalyticsOAuthDomainEvent, auditAction: string) {
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

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"

import type { ZidOAuthDomainEvent } from "./events"
import { ZidOAuthRepository } from "./repository"
import type {
  ZidOAuthCallbackResult,
  ZidOAuthStartInput,
  ZidOAuthStartResult,
  ZidOAuthTimelineEvent,
  ZidOAuthTimelineResult,
} from "./types"
import {
  EnvironmentFirstZidOAuthCredentialsProvider,
  type ZidOAuthCredentialsProvider,
} from "./zid-credentials"

interface ZidOAuthServiceConfig {
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

interface ZidTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
}

// Confirmed against Zid's official docs (docs.zid.sa/get-manager-profile): the manager
// profile response nests store details under `user.store`, keyed by the store's numeric id
// (used everywhere else in Zid's API as Store-Id) plus currency/timezone for stats/date-range
// handling, matching what Salla's /store/info and Snapchat's account discovery both need.
interface ZidManagerProfileResponse {
  user?: {
    store?: {
      id?: number | string
      uuid?: string
      title?: string
      currency?: { code?: string } | string
      timezone?: string
    }
  }
}

// offline access to refresh tokens is granted by default by Zid (confirmed: the token
// response documents a 1-year refresh token without any special scope requirement, unlike
// Salla which requires "offline_access" explicitly) -- so unlike Salla's DEFAULT_SCOPES,
// Zid has no required default scope. ZID_OAUTH_SCOPES lets a specific deployment opt into
// whichever scopes its Zid Partner Dashboard app was configured with, if that ever needs to
// be passed explicitly rather than being implied by the app's own dashboard configuration.
const DEFAULT_SCOPES: string[] = []
const ZID_AUTHORIZATION_URL = "https://oauth.zid.sa/oauth/authorize"
const ZID_TOKEN_URL = "https://oauth.zid.sa/oauth/token"
const ZID_API_BASE_URL = "https://api.zid.sa/v1"

function buildDefaultConfig(): ZidOAuthServiceConfig {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "http://localhost:3000"

  const configuredScopes = (process.env.ZID_OAUTH_SCOPES ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)

  return {
    clientId: process.env.ZID_CLIENT_ID ?? "",
    clientSecret: process.env.ZID_CLIENT_SECRET ?? "",
    redirectUri:
      process.env.ZID_REDIRECT_URI ?? "http://localhost:4000/v1/integrations/zid/oauth/callback",
    successRedirectUri:
      process.env.ZID_SUCCESS_REDIRECT_URI ?? `${appUrl.replace(/\/$/, "")}/integrations/new`,
    tokenEncryptionKey:
      process.env.IDENTITY_PLATFORM_ZID_OAUTH_TOKEN_ENCRYPTION_KEY ??
      process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET ??
      "",
    authorizationUrl: process.env.ZID_AUTHORIZATION_URL ?? ZID_AUTHORIZATION_URL,
    tokenUrl: process.env.ZID_TOKEN_URL ?? ZID_TOKEN_URL,
    apiBaseUrl: process.env.ZID_API_BASE_URL ?? ZID_API_BASE_URL,
    scopes: configuredScopes.length > 0 ? configuredScopes : DEFAULT_SCOPES,
  }
}

function normalizeEncryptionKey(input: string) {
  const trimmed = input.trim()
  if (trimmed.length === 0) {
    throw new Error("ZID_OAUTH_CONFIGURATION_ERROR")
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

  throw new Error("ZID_OAUTH_CONFIGURATION_ERROR")
}

function isLocalhostHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
}

function validateConfiguredUrl(raw: string, opts: { allowHttpLocalhostOnly: boolean }) {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error("ZID_OAUTH_CONFIGURATION_ERROR")
  }

  if (parsed.username || parsed.password) {
    throw new Error("ZID_OAUTH_CONFIGURATION_ERROR")
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

  throw new Error("ZID_OAUTH_CONFIGURATION_ERROR")
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
    throw new Error("ZID_OAUTH_DECRYPTION_ERROR")
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
    throw new Error("ZID_OAUTH_FORBIDDEN")
  }
}

function toTimelineAction(eventType: string, payload: Record<string, unknown>) {
  switch (eventType) {
    case "zid.oauth.authorization.completed":
      return payload.reconnected === true ? "connection.reconnected" : "connection.connected"
    case "zid.oauth.connection.reconnect.started":
      return "connection.reconnected"
    case "zid.oauth.connection.paused":
      return "connection.paused"
    case "zid.oauth.connection.resumed":
      return "connection.resumed"
    case "zid.oauth.connection.disconnected":
      return "connection.disconnected"
    case "zid.oauth.connection.deleted":
      return "connection.deleted"
    case "zid.oauth.token.refreshed":
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
  return `zd_${randomBytes(16).toString("hex")}_${randomUUID().replace(/-/g, "")}`
}

// Distinct prefix from createStateToken() so claim tokens are visually distinguishable from
// OAuth state values in logs -- otherwise same shape/entropy.
function createClaimToken() {
  return `zdi_${randomBytes(16).toString("hex")}_${randomUUID().replace(/-/g, "")}`
}

// Hashed at rest, unlike zid_oauth_states/invitation tokens -- this token is a bearer
// credential for up to 7 days for a row that already holds live encrypted Zid access/refresh
// tokens (real API access to a merchant's store), a materially higher-stakes secret than a
// 10-minute OAuth state or an org-invite. Same normalization style as password-reset tokens.
function hashClaimToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

function ensureConfigured(config: ZidOAuthServiceConfig) {
  if (
    !config.clientId ||
    !config.clientSecret ||
    !config.redirectUri ||
    !config.successRedirectUri
  ) {
    throw new Error("ZID_OAUTH_CONFIGURATION_ERROR")
  }

  validateConfiguredUrl(config.redirectUri, { allowHttpLocalhostOnly: true })
  validateConfiguredUrl(config.successRedirectUri, { allowHttpLocalhostOnly: true })
  validateConfiguredUrl(config.authorizationUrl, { allowHttpLocalhostOnly: false })
  validateConfiguredUrl(config.tokenUrl, { allowHttpLocalhostOnly: false })
  validateConfiguredUrl(config.apiBaseUrl, { allowHttpLocalhostOnly: false })

  normalizeEncryptionKey(config.tokenEncryptionKey)
}

// Confirmed against Zid's official docs (docs.zid.sa/authorization): unlike most OAuth
// providers, the payload is sent in the POST body as application/x-www-form-urlencoded,
// which this already does the same way Salla's does -- no special-casing needed there.
async function exchangeAuthorizationCode(input: {
  code: string
  config: ZidOAuthServiceConfig
}): Promise<ZidTokenResponse> {
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
    const bodyText = await response.text().catch(() => "")
    console.error("zid_oauth.token_exchange_failed", {
      status: response.status,
      statusText: response.statusText,
      body: bodyText.slice(0, 1000),
    })
    throw new Error("ZID_OAUTH_TOKEN_EXCHANGE_FAILED")
  }

  const body = (await response.json()) as ZidTokenResponse
  if (!body.access_token || typeof body.access_token !== "string") {
    throw new Error("ZID_OAUTH_TOKEN_EXCHANGE_FAILED")
  }

  return body
}

async function refreshAccessToken(input: {
  refreshToken: string
  config: ZidOAuthServiceConfig
}): Promise<ZidTokenResponse> {
  const response = await fetch(input.config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: input.refreshToken,
      client_id: input.config.clientId,
      client_secret: input.config.clientSecret,
      redirect_uri: input.config.redirectUri,
      grant_type: "refresh_token",
    }).toString(),
  })

  if (!response.ok) {
    throw new Error("ZID_OAUTH_TOKEN_REFRESH_FAILED")
  }

  const body = (await response.json()) as ZidTokenResponse
  if (!body.access_token || typeof body.access_token !== "string") {
    throw new Error("ZID_OAUTH_TOKEN_REFRESH_FAILED")
  }

  return body
}

// Zid's OAuth authorizes exactly one merchant store per connection (same as Salla) -- so
// discovery here is a single GET, not a list-then-page walk. Both Authorization and
// X-Manager-Token headers carry the same access_token (confirmed against Zid's docs: "used
// interchangeably").
async function fetchStoreInfo(config: ZidOAuthServiceConfig, accessToken: string) {
  const url = `${config.apiBaseUrl.replace(/\/$/, "")}/managers/account/profile`
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      "x-manager-token": accessToken,
      accept: "application/json",
    },
  })

  if (!response.ok) {
    // The oauth callback controller swallows this into a generic redirect reason with no
    // detail -- log the actual status/body here, since this is the only place that ever sees it.
    const bodyText = await response.text().catch(() => "")
    console.error("zid_oauth.account_discovery_failed", {
      url,
      status: response.status,
      statusText: response.statusText,
      body: bodyText.slice(0, 1000),
    })
    throw new Error("ZID_OAUTH_ACCOUNT_DISCOVERY_FAILED")
  }

  const body = (await response.json()) as ZidManagerProfileResponse
  const store = body.user?.store

  if (!store || store.id === undefined || store.id === null) {
    throw new Error("ZID_OAUTH_ACCOUNT_DISCOVERY_EMPTY")
  }

  return {
    id: store.id,
    name: store.title,
    currency: typeof store.currency === "string" ? store.currency : store.currency?.code,
    timezone: store.timezone,
  }
}

export class ZidOAuthService {
  private readonly config: ZidOAuthServiceConfig
  private readonly credentialsProvider: ZidOAuthCredentialsProvider

  constructor(
    private readonly repository: ZidOAuthRepository,
    config?: Partial<ZidOAuthServiceConfig>,
    credentialsProvider: ZidOAuthCredentialsProvider = new EnvironmentFirstZidOAuthCredentialsProvider()
  ) {
    this.config = { ...buildDefaultConfig(), ...(config ?? {}) }
    this.credentialsProvider = credentialsProvider
  }

  private async loadResolvedConfig() {
    const credentials = await this.credentialsProvider.load()
    // An explicit ZID_REDIRECT_URI always wins, even when client credentials come from AWS
    // Secrets Manager -- this lets local/dev environments redirect back to themselves
    // instead of the production callback baked into the shared secret.
    const explicitRedirectUri = process.env.ZID_REDIRECT_URI?.trim()
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
    input: ZidOAuthStartInput = {}
  ): Promise<ZidOAuthStartResult> {
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
    if (config.scopes.length > 0) {
      authorizationUrl.searchParams.set("scope", config.scopes.join(" "))
    }
    authorizationUrl.searchParams.set("state", state)

    const startedAt = now.toISOString()
    await this.recordLifecycle(
      {
        eventType: "zid.oauth.authorization.started",
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
      "integration.zid_oauth.started"
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
  }): Promise<ZidOAuthCallbackResult> {
    const config = await this.loadResolvedConfig()

    const state = await this.repository.findPendingStateByValue(input.state)
    if (!state) {
      throw new Error("ZID_OAUTH_STATE_INVALID")
    }

    if (String(state.status) !== "pending") {
      throw new Error("ZID_OAUTH_STATE_INVALID")
    }

    const expiresAt = new Date(String(state.expires_at)).getTime()
    if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
      throw new Error("ZID_OAUTH_STATE_EXPIRED")
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
      throw new Error("ZID_OAUTH_REFRESH_TOKEN_MISSING")
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
        throw new Error("ZID_OAUTH_STATE_ALREADY_CONSUMED")
      }

      await this.repository.upsertConnection({
        id: connectionId,
        organizationId,
        workspaceId,
        projectId,
        dataSourceId: null,
        providerAccountId: primaryAccount?.customerId ?? null,
        providerAccountName: primaryAccount?.displayName ?? "Zid Store",
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
          eventType: "zid.oauth.authorization.completed",
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
            discoveryEndpoint: `${config.apiBaseUrl.replace(/\/$/, "")}/managers/account/profile`,
            scopes: effectiveScopes,
          },
        },
        "integration.zid_oauth.connected"
      )
    })

    return {
      connectionId,
      projectId,
      workspaceId,
      organizationId,
      accountName: primaryAccount.displayName ?? "Zid Store",
      accountEmail: null,
      connectedAt: now,
      status: "connected",
    }
  }

  // Marketplace-initiated install: Zid redirected a merchant here directly from its own App
  // Market (no `state`, since MADAR never called startAuthorization -- the merchant may not
  // even have a MADAR account yet). Exchanges the code and stores the result unclaimed; there
  // is no organization to attach a real connection to until the merchant logs in/registers and
  // claims it via claimInstall.
  async completeMarketplaceInstall(input: {
    code: string
  }): Promise<{ claimToken: string; storeName: string }> {
    const config = await this.loadResolvedConfig()

    const token = await exchangeAuthorizationCode({ code: input.code, config })

    if (!token.refresh_token || token.refresh_token.trim().length === 0) {
      throw new Error("ZID_OAUTH_REFRESH_TOKEN_MISSING")
    }

    const store = await fetchStoreInfo(config, token.access_token)
    const scopes = parseScopes(token.scope)
    const effectiveScopes = scopes.length > 0 ? scopes : config.scopes
    const storeName = store.name ?? "Zid Store"

    const claimToken = createClaimToken()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    await this.repository.saveMarketplaceInstall({
      id: randomUUID(),
      claimTokenHash: hashClaimToken(claimToken),
      zidStoreExternalId: String(store.id),
      zidStoreName: storeName,
      zidStoreCurrency: store.currency ?? null,
      zidStoreTimezone: store.timezone ?? null,
      encryptedAccessToken: encryptSecret(token.access_token, config.tokenEncryptionKey),
      encryptedRefreshToken: encryptSecret(token.refresh_token, config.tokenEncryptionKey),
      scopes: effectiveScopes,
      tokenExpiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000).toISOString()
        : null,
      expiresAt,
    })

    return { claimToken, storeName }
  }

  // Public-safe read (no secrets) -- used by the claim page before any MADAR session exists,
  // to show "connect store {name}" ahead of the login/register step.
  async getPendingInstallSummary(claimToken: string) {
    const row = await this.repository.findPendingInstallByTokenHash(hashClaimToken(claimToken))
    if (!row) {
      throw new Error("ZID_MARKETPLACE_INSTALL_NOT_FOUND")
    }

    const status = String(row.status)
    if (status === "unclaimed") {
      const expiresAt = new Date(String(row.expires_at)).getTime()
      if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
        throw new Error("ZID_MARKETPLACE_INSTALL_EXPIRED")
      }
    }

    return {
      storeName: (row.zid_store_name as string | null) ?? "Zid Store",
      currency: (row.zid_store_currency as string | null) ?? null,
      status,
    }
  }

  // Claims an unclaimed marketplace install into the now-authenticated actor's organization --
  // reuses the already-exchanged tokens from completeMarketplaceInstall, no new token exchange.
  async claimInstall(
    actor: AuthenticatedActor,
    claimToken: string
  ): Promise<ZidOAuthCallbackResult> {
    assertActorCanManageIntegrations(actor)

    const row = await this.repository.findPendingInstallByTokenHash(hashClaimToken(claimToken))
    if (!row) {
      throw new Error("ZID_MARKETPLACE_INSTALL_NOT_FOUND")
    }
    if (String(row.status) !== "unclaimed") {
      throw new Error("ZID_MARKETPLACE_INSTALL_ALREADY_CLAIMED")
    }
    const expiresAt = new Date(String(row.expires_at)).getTime()
    if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
      throw new Error("ZID_MARKETPLACE_INSTALL_EXPIRED")
    }

    const resolvedProject = await this.repository.resolveOrCreateDefaultProject(
      actor.organizationId,
      actor.workspaceId ?? null,
      actor.userId
    )

    const existingConnection = await this.repository.findConnectionByProject(
      actor.organizationId,
      resolvedProject.projectId
    )
    const connectionId = existingConnection?.id ?? randomUUID()
    const now = new Date().toISOString()
    const storeName = (row.zid_store_name as string | null) ?? "Zid Store"
    const storeExternalId = String(row.zid_store_external_id)
    const scopesRaw = row.scopes
    const scopes = Array.isArray(scopesRaw) ? (scopesRaw as string[]) : []

    await this.repository.withTransaction(async () => {
      // Connection row must exist before the install row's claimed_connection_id FK can point
      // to it -- if the CAS below fails (lost a race to a concurrent claim), the whole
      // transaction rolls back, including this upsert, so creating it first is still safe.
      await this.repository.upsertConnection({
        id: connectionId,
        organizationId: actor.organizationId,
        workspaceId: resolvedProject.workspaceId,
        projectId: resolvedProject.projectId,
        dataSourceId: null,
        providerAccountId: storeExternalId,
        providerAccountName: storeName,
        providerAccountEmail: null,
        encryptedRefreshToken: row.encrypted_refresh_token as string,
        encryptedAccessToken: row.encrypted_access_token as string,
        scopes,
        tokenExpiresAt: row.token_expires_at
          ? new Date(row.token_expires_at as string | number | Date).toISOString()
          : null,
        status: "connected",
        connectionReference: storeName,
        lastConnectedAt: now,
        lastDisconnectedAt: null,
        actorUserId: actor.userId,
        nowIso: now,
      })

      await this.repository.replaceAccessibleCustomerAccounts({
        connectionId,
        actorUserId: actor.userId,
        selectedCustomerId: storeExternalId,
        accounts: [
          {
            customerId: storeExternalId,
            displayName: storeName,
            currencyCode: (row.zid_store_currency as string | null) ?? null,
            timeZone: (row.zid_store_timezone as string | null) ?? null,
            organizationId: null,
            organizationName: null,
            status: "active",
          },
        ],
      })

      // Single-use CAS -- if this returns false, another request already claimed (or the
      // token expired) between our earlier read and here, so the whole transaction (including
      // the connection upsert above) must roll back rather than silently double-processing.
      const claimed = await this.repository.claimInstallRow({
        installId: String(row.id),
        claimedByUserId: actor.userId,
        claimedOrganizationId: actor.organizationId,
        claimedWorkspaceId: resolvedProject.workspaceId,
        claimedProjectId: resolvedProject.projectId,
        claimedConnectionId: connectionId,
        now,
      })
      if (!claimed) {
        throw new Error("ZID_MARKETPLACE_INSTALL_ALREADY_CLAIMED")
      }

      await this.recordLifecycle(
        {
          eventType: "zid.oauth.authorization.completed",
          aggregateId: connectionId,
          actorUserId: actor.userId,
          organizationId: actor.organizationId,
          workspaceId: resolvedProject.workspaceId,
          projectId: resolvedProject.projectId,
          occurredAt: now,
          payload: {
            accountId: storeExternalId,
            accountName: storeName,
            source: "marketplace_install",
          },
        },
        "integration.zid_oauth.connected"
      )
    })

    return {
      connectionId,
      projectId: resolvedProject.projectId,
      workspaceId: resolvedProject.workspaceId,
      organizationId: actor.organizationId,
      accountName: storeName,
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
      throw new Error("ZID_OAUTH_CONNECTION_NOT_READY")
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
      throw new Error("ZID_OAUTH_CONNECTION_NOT_FOUND")
    }

    if (actor.workspaceId && connection.workspaceId !== actor.workspaceId) {
      throw new Error("ZID_OAUTH_CONNECTION_NOT_FOUND")
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
          eventType: "zid.oauth.connection.paused",
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
        "integration.zid_oauth.paused"
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
          eventType: "zid.oauth.connection.resumed",
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
        "integration.zid_oauth.resumed"
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
          eventType: "zid.oauth.connection.disconnected",
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
        "integration.zid_oauth.disconnected"
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
        eventType: "zid.oauth.connection.reconnect.started",
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
      "integration.zid_oauth.reconnect.started"
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
  ): Promise<ZidOAuthTimelineResult> {
    assertActorCanManageIntegrations(actor)

    const connection = await this.findOwnedConnectionOrThrow(actor, input.connectionId)
    const events = await this.repository.listRecentOutboxEvents(connection.id, input.limit)

    const items: ZidOAuthTimelineEvent[] = events.map((event) => {
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

  buildSuccessRedirect(result: ZidOAuthCallbackResult) {
    const redirectUrl = toOnboardingRedirectUrl(this.config.successRedirectUri)
    redirectUrl.searchParams.set("zid_oauth", "connected")
    redirectUrl.searchParams.set("zid_connection_id", result.connectionId)
    redirectUrl.searchParams.set("zid_project_id", result.projectId)
    redirectUrl.searchParams.set("zid_status", result.status)
    redirectUrl.searchParams.set("zid_account_name", result.accountName)
    redirectUrl.searchParams.set("zid_connected_at", result.connectedAt)
    return redirectUrl.toString()
  }

  buildErrorRedirect(reason: string) {
    const redirectUrl = new URL(this.config.successRedirectUri)
    redirectUrl.searchParams.set("zid_oauth", "error")
    redirectUrl.searchParams.set("reason", reason)
    return redirectUrl.toString()
  }

  // Same appUrl resolution buildDefaultConfig() uses for successRedirectUri's own default --
  // deliberately not derived from successRedirectUri itself, since an operator could point
  // ZID_SUCCESS_REDIRECT_URI somewhere off the app root.
  buildInstallClaimRedirect(claimToken: string) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "http://localhost:3000"
    const redirectUrl = new URL(
      `${appUrl.replace(/\/$/, "")}/integrations/zid/claim/${encodeURIComponent(claimToken)}`
    )
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

  private async recordLifecycle(event: ZidOAuthDomainEvent, auditAction: string) {
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

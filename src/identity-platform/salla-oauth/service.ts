import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto"

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
  // The Partners Portal "app-id" used to build the App Store install URL
  // (appStoreInstallBaseUrl/{appId}) -- distinct from clientId, which is the OAuth client
  // credential. Required only for startAuthorization; everything else (token exchange, refresh,
  // webhooks) is unaffected if it's unset.
  appId: string
  appStoreInstallBaseUrl: string
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
// Confirmed against Salla's official authorization docs (docs.salla.dev): the App Store
// "Install" entry point, s.salla.sa/apps/install/{app-id} -- takes no query parameters, unlike
// the direct accounts.salla.sa authorize URL above.
const SALLA_APP_STORE_INSTALL_BASE_URL = "https://s.salla.sa/apps/install"
// 7 days, matching the equivalent Zid marketplace-install claim token's TTL
// (zid-oauth/service.ts's createClaimToken usage) -- a pending install holds live, real API
// access to a merchant's store, so this is a materially higher-stakes secret than a 10-minute
// OAuth state, but still needs a hard expiry rather than living forever unclaimed.
const MARKETPLACE_INSTALL_CLAIM_TTL_MS = 7 * 24 * 60 * 60 * 1000
// 10 minutes -- matches the OAuth state TTL above; a connect-intent only needs to outlive the
// time it takes a merchant to click through Salla's own install confirmation screen.
const CONNECT_INTENT_TTL_MS = 10 * 60 * 1000

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
    appId: process.env.SALLA_APP_ID ?? "",
    appStoreInstallBaseUrl:
      process.env.SALLA_APP_STORE_INSTALL_BASE_URL ?? SALLA_APP_STORE_INSTALL_BASE_URL,
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

// Distinct prefix from createStateToken() so claim tokens are visually distinguishable from
// OAuth state values in logs -- otherwise same shape/entropy. Mirrors Zid's createClaimToken.
function createClaimToken() {
  return `sla_${randomBytes(16).toString("hex")}_${randomUUID().replace(/-/g, "")}`
}

// Hashed at rest, unlike salla_oauth_states -- this token is a bearer credential for up to 7
// days for a row that already holds live encrypted Salla access/refresh tokens (real API access
// to a merchant's store), a materially higher-stakes secret than a 10-minute OAuth state. Same
// normalization style as password-reset tokens / Zid's hashClaimToken.
function hashClaimToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
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
    // Same env-first/AWS-Secrets-Manager-fallback precedence as redirectUri above -- the app-id
    // can live in either place (see salla-credentials.ts), an explicit SALLA_APP_ID still wins.
    const explicitAppId = process.env.SALLA_APP_ID?.trim()
    const resolved = {
      ...this.config,
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      redirectUri: explicitRedirectUri || credentials.redirectUri || this.config.redirectUri,
      appId: explicitAppId || credentials.appId || this.config.appId,
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
    if (!config.appId) {
      throw new Error("SALLA_OAUTH_APP_ID_MISSING")
    }

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

    // App Store install URL, not a direct OAuth authorize URL -- Salla requires Easy Mode (no
    // browser redirect back with a code) for any app published on its App Store, and the install
    // URL itself takes no query parameters (confirmed against docs.salla.dev), so `state` below
    // is recorded for audit/lifecycle parity only and is never appended here or round-tripped.
    // The merchant's install instead completes via the app.store.authorize webhook, handled by
    // handleAppStoreInstall below, and surfaced back to this org via a connect-intent
    // (createConnectIntent/getConnectIntentStatus).
    const authorizationUrl = new URL(
      `${config.appStoreInstallBaseUrl.replace(/\/$/, "")}/${config.appId}`
    )

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

  // App Store-initiated install: Salla's Easy Mode (mandatory for App Store-published apps)
  // delivers the exchanged token via this webhook, never a browser redirect with a code, so
  // there is no organization to attach a real connection to yet -- stored unclaimed, the same
  // way Zid's completeMarketplaceInstall handles its own marketplace-initiated case. The exact
  // payload shape is Salla's one unverified assumption here (no live Partners Portal app exists
  // yet to confirm against), so every raw delivery is kept in raw_webhook_payload regardless of
  // whether parsing below succeeds, and a couple of plausible field paths are tried defensively
  // rather than assuming one shape and failing silently on delivery day.
  async handleAppStoreInstall(payload: {
    event: string
    merchant: number | string
    data: Record<string, unknown>
  }): Promise<void> {
    const config = await this.loadResolvedConfig()
    const data = payload.data ?? {}

    const accessToken =
      (data.access_token as string | undefined) ??
      (data.accessToken as string | undefined) ??
      undefined
    if (!accessToken || accessToken.trim().length === 0) {
      console.error("salla.app_store_authorize_missing_token", { merchant: payload.merchant })
      return
    }

    const refreshToken =
      (data.refresh_token as string | undefined) ??
      (data.refreshToken as string | undefined) ??
      undefined
    const expiresIn =
      (data.expires as number | undefined) ?? (data.expires_in as number | undefined) ?? undefined
    const scopeRaw = (data.scope as string | undefined) ?? undefined

    let store: { id: string | number; name?: string; domain?: string; currency?: string }
    try {
      store = await fetchStoreInfo(config, accessToken)
    } catch (error) {
      console.error("salla.app_store_authorize_store_info_failed", {
        merchant: payload.merchant,
        error,
      })
      return
    }

    const installId = randomUUID()
    const claimToken = createClaimToken()
    const expiresAt = new Date(Date.now() + MARKETPLACE_INSTALL_CLAIM_TTL_MS).toISOString()

    await this.repository.saveMarketplaceInstall({
      id: installId,
      claimTokenHash: hashClaimToken(claimToken),
      sallaStoreExternalId: String(store.id ?? payload.merchant),
      sallaStoreName: store.name ?? null,
      sallaStoreDomain: store.domain ?? null,
      sallaStoreCurrency: store.currency ?? null,
      encryptedAccessToken: encryptSecret(accessToken, config.tokenEncryptionKey),
      encryptedRefreshToken: refreshToken
        ? encryptSecret(refreshToken, config.tokenEncryptionKey)
        : encryptSecret(accessToken, config.tokenEncryptionKey),
      scopes: parseScopes(scopeRaw).length > 0 ? parseScopes(scopeRaw) : config.scopes,
      tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
      rawWebhookPayload: payload,
      expiresAt,
    })

    console.log("salla.app_store_authorize_pending_install_created", {
      installId,
      storeId: store.id,
    })
  }

  // Created the moment an already-logged-in merchant clicks Connect, just before the frontend
  // opens the App Store install URL in a new tab -- see getConnectIntentStatus for how this is
  // later used to safely surface a just-created pending install back to this same org/user only,
  // never a cross-tenant list (Salla's install URL has no query-param passthrough to correlate
  // any other way).
  async createConnectIntent(
    actor: AuthenticatedActor
  ): Promise<{ intentId: string; expiresAt: string }> {
    assertActorCanManageIntegrations(actor)

    const intentId = randomUUID()
    const expiresAt = new Date(Date.now() + CONNECT_INTENT_TTL_MS).toISOString()
    await this.repository.saveConnectIntent({
      id: intentId,
      organizationId: actor.organizationId,
      workspaceId: actor.workspaceId ?? null,
      userId: actor.userId,
      expiresAt,
    })

    return { intentId, expiresAt }
  }

  // Polled by the frontend's "waiting for installation" screen. Only ever reveals a candidate to
  // the org/user that owns this specific intent, time-boxed to the intent's TTL -- if more than
  // one unclaimed install appeared in that window (a rare concurrent-install collision across
  // different merchants), this deliberately does NOT guess which one is "theirs"; it just keeps
  // waiting, leaving the claim page as the safe fallback.
  async getConnectIntentStatus(
    actor: AuthenticatedActor,
    intentId: string
  ): Promise<
    | { waiting: true }
    | {
        waiting: false
        candidate: { claimToken: string; storeName: string; storeDomain: string | null }
      }
  > {
    const intent = await this.repository.findConnectIntentById(intentId)
    if (
      !intent ||
      String(intent.organization_id) !== actor.organizationId ||
      String(intent.user_id) !== actor.userId
    ) {
      throw new Error("SALLA_CONNECT_INTENT_NOT_FOUND")
    }

    const expiresAt = new Date(String(intent.expires_at)).getTime()
    if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
      return { waiting: true }
    }

    // Once a candidate is found, stick with it on subsequent polls rather than re-deriving --
    // keeps the surfaced candidate (and its claim token, cached on the intent row) stable even
    // if an unrelated install from another org coincidentally appears in the same window later.
    const resolvedInstallId = intent.resolved_install_id as string | null
    const resolvedClaimToken = intent.resolved_claim_token as string | null
    if (resolvedInstallId && resolvedClaimToken) {
      const row = await this.repository.findPendingInstallById(resolvedInstallId)
      if (row && String(row.status) === "unclaimed") {
        return {
          waiting: false,
          candidate: {
            claimToken: resolvedClaimToken,
            storeName: (row.salla_store_name as string | null) ?? "Salla Store",
            storeDomain: (row.salla_store_domain as string | null) ?? null,
          },
        }
      }
      return { waiting: true }
    }

    const candidates = await this.repository.findUnclaimedInstallsCreatedAfter(
      new Date(intent.created_at as string | number | Date).toISOString()
    )
    if (candidates.length !== 1) {
      return { waiting: true }
    }

    // Issues a fresh claim token for the install, replacing its claim_token_hash -- the webhook
    // handler's original token was never persisted in plaintext anywhere, so this is the first
    // (and only) plaintext token this install will ever have.
    const claimToken = createClaimToken()
    const row = await this.repository.issueClaimTokenForInstall(
      String(candidates[0].id),
      hashClaimToken(claimToken)
    )
    await this.repository.markConnectIntentResolved(intentId, String(row.id), claimToken)

    return {
      waiting: false,
      candidate: {
        claimToken,
        storeName: (row.salla_store_name as string | null) ?? "Salla Store",
        storeDomain: (row.salla_store_domain as string | null) ?? null,
      },
    }
  }

  // Public-safe read (no secrets) -- used by the claim page before the claim POST, to show
  // "connect store {name}" ahead of/alongside the login/register step. Mirrors Zid's
  // getPendingInstallSummary exactly.
  async getPendingInstallSummary(claimToken: string) {
    const row = await this.repository.findPendingInstallByTokenHash(hashClaimToken(claimToken))
    if (!row) {
      throw new Error("SALLA_MARKETPLACE_INSTALL_NOT_FOUND")
    }

    const status = String(row.status)
    if (status === "unclaimed") {
      const expiresAt = new Date(String(row.expires_at)).getTime()
      if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
        throw new Error("SALLA_MARKETPLACE_INSTALL_EXPIRED")
      }
    }

    return {
      storeName: (row.salla_store_name as string | null) ?? "Salla Store",
      currency: (row.salla_store_currency as string | null) ?? null,
      status,
    }
  }

  // Claims an unclaimed marketplace install into the now-authenticated actor's organization --
  // reuses the already-exchanged tokens from handleAppStoreInstall, no new token exchange.
  // Mirrors Zid's claimInstall exactly, including falling back to a freshly-created default
  // project (resolveOrCreateDefaultProject) for a merchant with no pre-existing project, since
  // this claim page is reachable both via the connect-intent flow (where a project already
  // exists) and cold, directly, by a merchant who installed via Salla's App Store independently.
  async claimMarketplaceInstall(
    actor: AuthenticatedActor,
    claimToken: string
  ): Promise<SallaOAuthCallbackResult> {
    assertActorCanManageIntegrations(actor)
    const config = await this.loadResolvedConfig()

    const row = await this.repository.findPendingInstallByTokenHash(hashClaimToken(claimToken))
    if (!row) {
      throw new Error("SALLA_MARKETPLACE_INSTALL_NOT_FOUND")
    }
    if (String(row.status) !== "unclaimed") {
      throw new Error("SALLA_MARKETPLACE_INSTALL_ALREADY_CLAIMED")
    }
    const expiresAt = new Date(String(row.expires_at)).getTime()
    if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
      throw new Error("SALLA_MARKETPLACE_INSTALL_EXPIRED")
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
    const storeName = (row.salla_store_name as string | null) ?? "Salla Store"
    const storeExternalId = String(row.salla_store_external_id)
    const scopesRaw = row.scopes
    const scopes = Array.isArray(scopesRaw) ? (scopesRaw as string[]) : []
    const discoveredAccounts = [
      {
        customerId: storeExternalId,
        displayName: storeName,
        currencyCode: (row.salla_store_currency as string | null) ?? null,
        timeZone: null,
        organizationId: null,
        organizationName: null,
        status: "active" as const,
      },
    ]

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
        accounts: discoveredAccounts,
      })

      // Single-use CAS -- if this returns false, another request already claimed (or the token
      // expired) between our earlier read and here, so the whole transaction (including the
      // connection upsert above) must roll back rather than silently double-processing.
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
        throw new Error("SALLA_MARKETPLACE_INSTALL_ALREADY_CLAIMED")
      }

      await this.recordLifecycle(
        {
          eventType: "salla.oauth.authorization.completed",
          aggregateId: connectionId,
          actorUserId: actor.userId,
          organizationId: actor.organizationId,
          workspaceId: resolvedProject.workspaceId,
          projectId: resolvedProject.projectId,
          occurredAt: now,
          payload: {
            accountId: storeExternalId,
            accountName: storeName,
            tokenEndpoint: config.tokenUrl,
            source: "app_store_install",
          },
        },
        "integration.salla_oauth.connected"
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

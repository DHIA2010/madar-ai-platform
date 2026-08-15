import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"

import type { ShopifyOAuthDomainEvent } from "./events"
import { ShopifyOAuthRepository } from "./repository"
import type {
  ShopifyOAuthCallbackResult,
  ShopifyOAuthStartInput,
  ShopifyOAuthStartResult,
  ShopifyOAuthTimelineEvent,
  ShopifyOAuthTimelineResult,
} from "./types"
import {
  EnvironmentFirstShopifyOAuthCredentialsProvider,
  type ShopifyOAuthCredentialsProvider,
} from "./shopify-credentials"

interface ShopifyOAuthServiceConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  successRedirectUri: string
  tokenEncryptionKey: string
  apiVersion: string
  scopes: string[]
}

interface ShopifyTokenResponse {
  access_token: string
  scope?: string
}

interface ShopifyShopInfo {
  id: string | number
  name?: string
  email?: string
  domain?: string
  myshopify_domain?: string
  currency?: string
  iana_timezone?: string
}

// products/orders/customers read access mirrors the recommended sync objects surfaced in
// the wizard; write scopes are deliberately not requested since MADAR only imports data.
const DEFAULT_SCOPES = ["read_products", "read_orders", "read_customers"]
const DEFAULT_API_VERSION = "2024-10"
const SHOP_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/

function buildDefaultConfig(): ShopifyOAuthServiceConfig {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "http://localhost:3000"

  const configuredScopes = (process.env.SHOPIFY_OAUTH_SCOPES ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)

  return {
    clientId: process.env.SHOPIFY_CLIENT_ID ?? "",
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET ?? "",
    redirectUri:
      process.env.SHOPIFY_REDIRECT_URI ??
      "http://localhost:4000/v1/integrations/shopify/oauth/callback",
    successRedirectUri:
      process.env.SHOPIFY_SUCCESS_REDIRECT_URI ?? `${appUrl.replace(/\/$/, "")}/integrations/new`,
    tokenEncryptionKey:
      process.env.IDENTITY_PLATFORM_SHOPIFY_OAUTH_TOKEN_ENCRYPTION_KEY ??
      process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET ??
      "",
    apiVersion: process.env.SHOPIFY_API_VERSION ?? DEFAULT_API_VERSION,
    scopes: configuredScopes.length > 0 ? configuredScopes : DEFAULT_SCOPES,
  }
}

function normalizeEncryptionKey(input: string) {
  const trimmed = input.trim()
  if (trimmed.length === 0) {
    throw new Error("SHOPIFY_OAUTH_CONFIGURATION_ERROR")
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

  throw new Error("SHOPIFY_OAUTH_CONFIGURATION_ERROR")
}

function isLocalhostHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
}

function validateConfiguredUrl(raw: string, opts: { allowHttpLocalhostOnly: boolean }) {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error("SHOPIFY_OAUTH_CONFIGURATION_ERROR")
  }

  if (parsed.username || parsed.password) {
    throw new Error("SHOPIFY_OAUTH_CONFIGURATION_ERROR")
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

  throw new Error("SHOPIFY_OAUTH_CONFIGURATION_ERROR")
}

function parseScopes(value: string | undefined) {
  return (value ?? "")
    .split(",")
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
    throw new Error("SHOPIFY_OAUTH_DECRYPTION_ERROR")
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
    throw new Error("SHOPIFY_OAUTH_FORBIDDEN")
  }
}

// Shopify shops can be entered as a bare handle ("madar-test"), a full domain
// ("madar-test.myshopify.com"), or a full URL copy-pasted from the browser's address bar
// (https://madar-test.myshopify.com/, possibly with a path/query after it) -- strip any
// scheme and path/query before normalizing to the bare myshopify.com domain, and reject
// anything that doesn't match Shopify's own shop-handle character set after that, since
// this value gets embedded directly into the authorize/token/API URLs.
function normalizeShopDomain(rawShopDomain: string | null | undefined): string {
  const trimmed = (rawShopDomain ?? "").trim().toLowerCase()
  if (trimmed.length === 0) {
    throw new Error("SHOPIFY_OAUTH_SHOP_DOMAIN_MISSING")
  }

  const withoutScheme = trimmed.replace(/^[a-z]+:\/\//, "")
  const withoutPath = withoutScheme.split(/[/?#]/)[0]

  const candidate = withoutPath.includes(".") ? withoutPath : `${withoutPath}.myshopify.com`
  if (!SHOP_DOMAIN_PATTERN.test(candidate)) {
    throw new Error("SHOPIFY_OAUTH_SHOP_DOMAIN_INVALID")
  }

  return candidate
}

export function buildShopUrls(shopDomain: string, apiVersion: string) {
  return {
    authorizationUrl: `https://${shopDomain}/admin/oauth/authorize`,
    tokenUrl: `https://${shopDomain}/admin/oauth/access_token`,
    apiBaseUrl: `https://${shopDomain}/admin/api/${apiVersion}`,
  }
}

function toTimelineAction(eventType: string, payload: Record<string, unknown>) {
  switch (eventType) {
    case "shopify.oauth.authorization.completed":
      return payload.reconnected === true ? "connection.reconnected" : "connection.connected"
    case "shopify.oauth.connection.reconnect.started":
      return "connection.reconnected"
    case "shopify.oauth.connection.paused":
      return "connection.paused"
    case "shopify.oauth.connection.resumed":
      return "connection.resumed"
    case "shopify.oauth.connection.disconnected":
      return "connection.disconnected"
    case "shopify.oauth.connection.deleted":
      return "connection.deleted"
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
    default:
      return action
  }
}

function createStateToken() {
  return `sp_${randomBytes(16).toString("hex")}_${randomUUID().replace(/-/g, "")}`
}

function ensureConfigured(config: ShopifyOAuthServiceConfig) {
  if (
    !config.clientId ||
    !config.clientSecret ||
    !config.redirectUri ||
    !config.successRedirectUri
  ) {
    throw new Error("SHOPIFY_OAUTH_CONFIGURATION_ERROR")
  }

  validateConfiguredUrl(config.redirectUri, { allowHttpLocalhostOnly: true })
  validateConfiguredUrl(config.successRedirectUri, { allowHttpLocalhostOnly: true })

  if (config.scopes.length === 0) {
    throw new Error("SHOPIFY_OAUTH_CONFIGURATION_ERROR")
  }

  normalizeEncryptionKey(config.tokenEncryptionKey)
}

// Shopify signs every OAuth callback (and webhook) with an HMAC over the query string,
// keyed with the app's client secret -- verifying it is the one thing standing between
// this endpoint and a forged "you're connected" callback, so it's not optional here the
// way it would be for providers where the state token alone is sufficient proof.
function verifyCallbackHmac(query: URLSearchParams, clientSecret: string) {
  const providedHmac = query.get("hmac")
  if (!providedHmac) {
    return false
  }

  const message = Array.from(query.entries())
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("&")

  const computed = createHmac("sha256", clientSecret).update(message).digest("hex")

  const providedBuffer = Buffer.from(providedHmac, "hex")
  const computedBuffer = Buffer.from(computed, "hex")
  if (providedBuffer.length !== computedBuffer.length) {
    return false
  }

  return timingSafeEqual(providedBuffer, computedBuffer)
}

async function exchangeAuthorizationCode(input: {
  code: string
  tokenUrl: string
  config: ShopifyOAuthServiceConfig
}): Promise<ShopifyTokenResponse> {
  const response = await fetch(input.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: input.config.clientId,
      client_secret: input.config.clientSecret,
      code: input.code,
    }),
  })

  if (!response.ok) {
    throw new Error("SHOPIFY_OAUTH_TOKEN_EXCHANGE_FAILED")
  }

  const body = (await response.json()) as ShopifyTokenResponse
  if (!body.access_token || typeof body.access_token !== "string") {
    throw new Error("SHOPIFY_OAUTH_TOKEN_EXCHANGE_FAILED")
  }

  return body
}

// Shopify's OAuth authorizes exactly one store per connection, so "discovery" here is a
// single GET, not a list-then-page walk -- the same simplification used for Salla.
// Authenticated Admin API calls use the X-Shopify-Access-Token header, not a Bearer token.
async function fetchShopInfo(apiBaseUrl: string, accessToken: string) {
  const url = `${apiBaseUrl.replace(/\/$/, "")}/shop.json`
  const response = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": accessToken,
      accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error("SHOPIFY_OAUTH_ACCOUNT_DISCOVERY_FAILED")
  }

  const body = (await response.json()) as { shop?: ShopifyShopInfo }
  if (!body.shop || body.shop.id === undefined || body.shop.id === null) {
    throw new Error("SHOPIFY_OAUTH_ACCOUNT_DISCOVERY_EMPTY")
  }

  return body.shop
}

export class ShopifyOAuthService {
  private readonly config: ShopifyOAuthServiceConfig
  private readonly credentialsProvider: ShopifyOAuthCredentialsProvider

  constructor(
    private readonly repository: ShopifyOAuthRepository,
    config?: Partial<ShopifyOAuthServiceConfig>,
    credentialsProvider: ShopifyOAuthCredentialsProvider = new EnvironmentFirstShopifyOAuthCredentialsProvider()
  ) {
    this.config = { ...buildDefaultConfig(), ...(config ?? {}) }
    this.credentialsProvider = credentialsProvider
  }

  private async loadResolvedConfig() {
    const credentials = await this.credentialsProvider.load()
    // An explicit SHOPIFY_REDIRECT_URI always wins, even when client credentials come
    // from AWS Secrets Manager -- this lets local/dev environments redirect back to
    // themselves instead of the production callback baked into the shared secret.
    const explicitRedirectUri = process.env.SHOPIFY_REDIRECT_URI?.trim()
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
    input: ShopifyOAuthStartInput = {}
  ): Promise<ShopifyOAuthStartResult> {
    assertActorCanManageIntegrations(actor)
    const config = await this.loadResolvedConfig()
    const shopDomain = normalizeShopDomain(input.shopDomain)
    const shopUrls = buildShopUrls(shopDomain, config.apiVersion)

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
      shopDomain,
      providerAccountId: null,
      providerAccountName: null,
      providerAccountEmail: null,
      encryptedRefreshToken: null,
      encryptedAccessToken: null,
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
      shopDomain,
      requestedScopes: config.scopes,
      redirectUri: config.redirectUri,
      expiresAt,
    })

    const authorizationUrl = new URL(shopUrls.authorizationUrl)
    authorizationUrl.searchParams.set("client_id", config.clientId)
    authorizationUrl.searchParams.set("redirect_uri", config.redirectUri)
    authorizationUrl.searchParams.set("scope", config.scopes.join(","))
    authorizationUrl.searchParams.set("state", state)

    const startedAt = now.toISOString()
    await this.recordLifecycle(
      {
        eventType: "shopify.oauth.authorization.started",
        aggregateId: connectionId,
        actorUserId: actor.userId,
        organizationId: actor.organizationId,
        workspaceId: resolvedProject.workspaceId,
        projectId: resolvedProject.projectId,
        occurredAt: startedAt,
        payload: {
          scopes: config.scopes,
          shopDomain,
          authorizationEndpoint: shopUrls.authorizationUrl,
        },
      },
      "integration.shopify_oauth.started"
    )

    return {
      authorizationUrl: authorizationUrl.toString(),
      connectionId,
      state,
      projectId: resolvedProject.projectId,
      workspaceId: resolvedProject.workspaceId,
    }
  }

  async completeAuthorization(query: URLSearchParams): Promise<ShopifyOAuthCallbackResult> {
    const config = await this.loadResolvedConfig()

    const stateValue = query.get("state")
    const code = query.get("code")
    if (!stateValue || !code) {
      throw new Error("SHOPIFY_OAUTH_STATE_INVALID")
    }

    const state = await this.repository.findPendingStateByValue(stateValue)
    if (!state) {
      throw new Error("SHOPIFY_OAUTH_STATE_INVALID")
    }

    if (String(state.status) !== "pending") {
      throw new Error("SHOPIFY_OAUTH_STATE_INVALID")
    }

    const expiresAt = new Date(String(state.expires_at)).getTime()
    if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
      throw new Error("SHOPIFY_OAUTH_STATE_EXPIRED")
    }

    const shopDomain = String(state.shop_domain)

    // The callback's own `shop` param must match the shop we redirected the user to --
    // this is what stops a valid, freshly-issued state token from being replayed against
    // a different store's callback.
    const callbackShop = (query.get("shop") ?? "").trim().toLowerCase()
    if (callbackShop !== shopDomain) {
      throw new Error("SHOPIFY_OAUTH_SHOP_MISMATCH")
    }

    if (!verifyCallbackHmac(query, config.clientSecret)) {
      throw new Error("SHOPIFY_OAUTH_HMAC_INVALID")
    }

    const shopUrls = buildShopUrls(shopDomain, config.apiVersion)
    const token = await exchangeAuthorizationCode({ code, tokenUrl: shopUrls.tokenUrl, config })

    const connectionId = String(state.connection_id)
    const actorUserId = String(state.user_id)
    const organizationId = String(state.organization_id)
    const workspaceId = (state.workspace_id as string | null) ?? null
    const projectId = String(state.project_id)
    const now = new Date().toISOString()

    const scopes = parseScopes(token.scope)
    const effectiveScopes = scopes.length > 0 ? scopes : config.scopes

    const shop = await fetchShopInfo(shopUrls.apiBaseUrl, token.access_token)
    const discoveredAccounts = [
      {
        customerId: String(shop.id),
        displayName: shop.name ?? shopDomain,
        currencyCode: shop.currency ?? null,
        timeZone: shop.iana_timezone ?? null,
        organizationId: null,
        organizationName: null,
        status: "active" as const,
      },
    ]

    const primaryAccount = discoveredAccounts[0]

    await this.repository.withTransaction(async () => {
      const consumed = await this.repository.consumeStateOnce(String(state.id), now)
      if (!consumed) {
        throw new Error("SHOPIFY_OAUTH_STATE_ALREADY_CONSUMED")
      }

      await this.repository.upsertConnection({
        id: connectionId,
        organizationId,
        workspaceId,
        projectId,
        dataSourceId: null,
        shopDomain,
        providerAccountId: primaryAccount.customerId,
        providerAccountName: primaryAccount.displayName,
        providerAccountEmail: shop.email ?? null,
        // Shopify's offline access tokens never expire and there is no refresh_token
        // grant at all -- unlike Salla/Meta, this stays permanently null.
        encryptedRefreshToken: null,
        encryptedAccessToken: encryptSecret(token.access_token, config.tokenEncryptionKey),
        scopes: effectiveScopes,
        tokenExpiresAt: null,
        status: "connected",
        connectionReference: primaryAccount.displayName,
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
          eventType: "shopify.oauth.authorization.completed",
          aggregateId: connectionId,
          actorUserId,
          organizationId,
          workspaceId,
          projectId,
          occurredAt: now,
          payload: {
            shopDomain,
            accountId: primaryAccount.customerId,
            accountName: primaryAccount.displayName,
            discoveredAccountCount: discoveredAccounts.length,
            tokenEndpoint: shopUrls.tokenUrl,
            discoveryEndpoint: `${shopUrls.apiBaseUrl}/shop.json`,
            scopes: effectiveScopes,
          },
        },
        "integration.shopify_oauth.connected"
      )
    })

    return {
      connectionId,
      projectId,
      workspaceId,
      organizationId,
      accountName: primaryAccount.displayName,
      accountEmail: shop.email ?? null,
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

  // Shopify's offline access token never expires -- there is no refresh flow to run, this
  // just decrypts and returns the token that was stored at connect time.
  async resolveAccessToken(connectionId: string) {
    const config = await this.loadResolvedConfig()

    const tokenMaterial = await this.repository.getRawTokenMaterial(connectionId)
    if (!tokenMaterial || !tokenMaterial.encryptedAccessToken) {
      throw new Error("SHOPIFY_OAUTH_CONNECTION_NOT_READY")
    }

    return decryptSecret(tokenMaterial.encryptedAccessToken, config.tokenEncryptionKey)
  }

  private async findOwnedConnectionOrThrow(actor: AuthenticatedActor, connectionId: string) {
    const connection = await this.repository.findConnectionById(connectionId)
    if (!connection || connection.organizationId !== actor.organizationId) {
      throw new Error("SHOPIFY_OAUTH_CONNECTION_NOT_FOUND")
    }

    if (actor.workspaceId && connection.workspaceId !== actor.workspaceId) {
      throw new Error("SHOPIFY_OAUTH_CONNECTION_NOT_FOUND")
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
          eventType: "shopify.oauth.connection.paused",
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
        "integration.shopify_oauth.paused"
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
          eventType: "shopify.oauth.connection.resumed",
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
        "integration.shopify_oauth.resumed"
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
          eventType: "shopify.oauth.connection.disconnected",
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
        "integration.shopify_oauth.disconnected"
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
    const shopDomain = await this.repository.findConnectionShopDomain(connectionId)
    if (!shopDomain) {
      throw new Error("SHOPIFY_OAUTH_SHOP_DOMAIN_MISSING")
    }
    const now = new Date().toISOString()

    await this.recordLifecycle(
      {
        eventType: "shopify.oauth.connection.reconnect.started",
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
      "integration.shopify_oauth.reconnect.started"
    )

    return this.startAuthorization(actor, {
      workspaceId: connection.workspaceId,
      projectId: connection.projectId,
      connectionName: connection.connectionReference,
      shopDomain,
    })
  }

  async getRecentEvents(
    actor: AuthenticatedActor,
    input: { connectionId: string; limit: number }
  ): Promise<ShopifyOAuthTimelineResult> {
    assertActorCanManageIntegrations(actor)

    const connection = await this.findOwnedConnectionOrThrow(actor, input.connectionId)
    const events = await this.repository.listRecentOutboxEvents(connection.id, input.limit)

    const items: ShopifyOAuthTimelineEvent[] = events.map((event) => {
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

  buildSuccessRedirect(result: ShopifyOAuthCallbackResult) {
    const redirectUrl = toOnboardingRedirectUrl(this.config.successRedirectUri)
    redirectUrl.searchParams.set("shopify_oauth", "connected")
    redirectUrl.searchParams.set("shopify_connection_id", result.connectionId)
    redirectUrl.searchParams.set("shopify_project_id", result.projectId)
    redirectUrl.searchParams.set("shopify_status", result.status)
    redirectUrl.searchParams.set("shopify_account_name", result.accountName)
    redirectUrl.searchParams.set("shopify_connected_at", result.connectedAt)
    return redirectUrl.toString()
  }

  buildErrorRedirect(reason: string) {
    const redirectUrl = new URL(this.config.successRedirectUri)
    redirectUrl.searchParams.set("shopify_oauth", "error")
    redirectUrl.searchParams.set("reason", reason)
    return redirectUrl.toString()
  }

  getOAuthEndpointsForTesting(shopDomain: string) {
    return buildShopUrls(shopDomain, this.config.apiVersion)
  }

  private async recordLifecycle(event: ShopifyOAuthDomainEvent, auditAction: string) {
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

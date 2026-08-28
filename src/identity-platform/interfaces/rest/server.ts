import { randomUUID } from "node:crypto"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { URL } from "node:url"
import { z } from "zod"

import {
  createIdentityPlatform,
  type IdentityPlatformContainer,
} from "../../bootstrap/create-identity-platform"
import { GoogleOAuthController } from "../../google-oauth/controller"
import { GoogleOAuthConnectionDeletionService } from "../../google-oauth/connection-deletion-service"
import { GoogleOAuthRepository } from "../../google-oauth/repository"
import { GoogleOAuthService } from "../../google-oauth/service"
import { SnapchatOAuthConnectionDeletionService } from "../../snapchat-oauth/connection-deletion-service"
import { SnapchatOAuthRepository } from "../../snapchat-oauth/repository"
import { MetaOAuthConnectionDeletionService } from "../../meta-oauth/connection-deletion-service"
import { MetaOAuthRepository } from "../../meta-oauth/repository"
import { SallaOAuthConnectionDeletionService } from "../../salla-oauth/connection-deletion-service"
import { SallaOAuthRepository } from "../../salla-oauth/repository"
import { ShopifyOAuthConnectionDeletionService } from "../../shopify-oauth/connection-deletion-service"
import { ShopifyOAuthRepository } from "../../shopify-oauth/repository"
import { GoogleAnalyticsOAuthConnectionDeletionService } from "../../google-analytics-oauth/connection-deletion-service"
import { GoogleAnalyticsOAuthRepository } from "../../google-analytics-oauth/repository"
import { ZidOAuthConnectionDeletionService } from "../../zid-oauth/connection-deletion-service"
import { ZidOAuthRepository } from "../../zid-oauth/repository"
import { ZidOAuthService } from "../../zid-oauth/service"
import { TikTokAdsOAuthConnectionDeletionService } from "../../tiktok-ads-oauth/connection-deletion-service"
import { TikTokAdsOAuthRepository } from "../../tiktok-ads-oauth/repository"
import { ProductsAggregationService } from "../../products/service"
import { CustomersAggregationService } from "../../customers/service"
import { OrdersAggregationService } from "../../orders/service"
import { StoresAggregationService } from "../../stores/service"
import { PosRepository } from "../../pos/repository"
import { PosService } from "../../pos/service"
import { CampaignRepository } from "../../campaigns/repository"
import { CampaignService } from "../../campaigns/service"
import {
  CampaignsPerformanceAggregationService,
  type CampaignPerformancePlatform,
  type CampaignPerformanceQuery,
} from "../../campaigns/performance-service"
import { CampaignLinkRepository } from "../../campaign-links/repository"
import { CampaignLinkService } from "../../campaign-links/service"
import { extractPlatformSignals } from "../../tracking/platform-macros"
import { TrackingRepository } from "../../tracking/repository"
import { TRACKING_SNIPPET_JS } from "../../tracking/snippet"
import { TrackingService } from "../../tracking/service"
import { hashCustomerEmail } from "../../tracking/customer-ref"
import { AttributionRepository } from "../../attribution/repository"
import { OrderAttributionService } from "../../attribution/service"
import { ORDER_PROVIDERS, type OrderProvider } from "../../attribution/types"
import { AggregationRepository } from "../../aggregation/repository"
import { AggregationService } from "../../aggregation/service"
import { HmacTokenService, ScryptPasswordHasher } from "../../infrastructure/jwt/token-service"
import type { IntegrationProvider } from "../../integrations/provider-contracts"
import {
  beginGoogleAdsSyncRequestTrace,
  endGoogleAdsSyncRequestTrace,
} from "../../google-ads/client"
import { ERRORS, IdentityError } from "../../application/errors/IdentityError"
import { EnvironmentFirstMetaAdsCredentialsProvider } from "../../meta-ads/credentials"
import { createMetaGraphApiClient, runMetaConnectionDiagnostics } from "../../meta-ads/diagnostics"
import { createRequestContext, mapIdentityError } from "../middleware"
import {
  addTeamMemberSchema,
  assignCustomRoleSchema,
  assignRoleSchema,
  createCustomRoleSchema,
  createOrganizationSchema,
  createTeamSchema,
  createWorkspaceSchema,
  createNativeCampaignSchema,
  createCampaignLinkSchema,
  previewCampaignLinkSchema,
  updateCampaignLinkSchema,
  importCampaignsSchema,
  matchOrdersSchema,
  aggregateCampaignLinksSchema,
  captureTrackingEventSchema,
  forgotPasswordSchema,
  integrationAccountSelectionSchema,
  integrationAccountsQuerySchema,
  integrationDisconnectSchema,
  integrationEventsQuerySchema,
  integrationOAuthStartSchema,
  integrationRecordsQuerySchema,
  integrationSyncSchema,
  inviteOrganizationMemberSchema,
  loginSchema,
  posCreateEmployeeSchema,
  posCreateRoleSchema,
  posLoginSchema,
  posUpdateEmployeeSchema,
  posUpdateRoleSchema,
  removeMemberSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  revokeSessionSchema,
  setMemberModuleAccessSchema,
  suspendMemberSchema,
  switchWorkspaceSchema,
  updateCustomRoleSchema,
  updateMemberProfileSchema,
  updateOrganizationSchema,
  updateProfileSchema,
  updateTeamSchema,
  updateWorkspaceSchema,
  uploadAvatarSchema,
  verifyEmailSchema,
} from "../../schemas"

function json(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string | string[]> = {}
) {
  response.writeHead(status, {
    "content-type": "application/json",
    ...headers,
  })
  response.end(JSON.stringify(body))
}

function getLogoutCookieHeaders(): Record<string, string[]> {
  const expiredAttributes =
    "Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax"
  const names = [
    "madar_access_token",
    "madar_refresh_token",
    "madar_session",
    "accessToken",
    "refreshToken",
    "session",
  ]
  return {
    "set-cookie": names.map((name) => `${name}=; ${expiredAttributes}`),
  }
}

const CAMPAIGN_PERFORMANCE_PLATFORMS = new Set<CampaignPerformancePlatform>([
  "Google Search",
  "Google Display",
  "YouTube",
  "Meta",
  "TikTok",
  "Snapchat",
])

function parsePerformanceQuery(url: URL): CampaignPerformanceQuery {
  const platform = url.searchParams.get("platform")
  return {
    startDate: url.searchParams.get("startDate") ?? undefined,
    endDate: url.searchParams.get("endDate") ?? undefined,
    platform:
      platform && CAMPAIGN_PERFORMANCE_PLATFORMS.has(platform as CampaignPerformancePlatform)
        ? (platform as CampaignPerformancePlatform)
        : undefined,
    status: url.searchParams.get("status") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  if (chunks.length === 0) {
    return {}
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}

function mapZodError(error: z.ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    code: issue.code,
    message: issue.message,
  }))
}

function isPostgresLikeError(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  )
}

function classifyAuthFailure(error: unknown) {
  if (isPostgresLikeError(error)) {
    const code = (error as { code: string }).code
    if (code === "42P01")
      return { category: "database", code, exceptionType: "PostgresError", shouldLogStack: true }
    if (code === "42703")
      return { category: "database", code, exceptionType: "PostgresError", shouldLogStack: true }
    if (code === "23505")
      return { category: "database", code, exceptionType: "PostgresError", shouldLogStack: true }
    if (code === "08001" || code === "08006" || code.startsWith("08")) {
      return {
        category: "infrastructure",
        code,
        exceptionType: "PostgresError",
        shouldLogStack: true,
      }
    }
    if (code === "42501")
      return { category: "security", code, exceptionType: "PostgresError", shouldLogStack: true }
  }

  if (error instanceof z.ZodError) {
    return {
      category: "validation",
      code: "VALIDATION_ERROR",
      exceptionType: error.name,
      shouldLogStack: false,
    }
  }

  if (error instanceof Error) {
    return {
      category: "bug",
      code: "INTERNAL_ERROR",
      exceptionType: error.name,
      shouldLogStack: true,
    }
  }

  return {
    category: "bug",
    code: "INTERNAL_ERROR",
    exceptionType: typeof error,
    shouldLogStack: true,
  }
}

function logAuthFailure(input: {
  error: unknown
  requestId: string
  correlationId: string
  endpoint: string
  method: string
}) {
  const classification = classifyAuthFailure(input.error)
  const stackTrace =
    classification.shouldLogStack && input.error instanceof Error ? input.error.stack : undefined

  console.error(
    JSON.stringify({
      level: "error",
      service: "identity-platform",
      timestamp: new Date().toISOString(),
      event: "auth.error",
      requestId: input.requestId,
      correlationId: input.correlationId,
      endpoint: input.endpoint,
      method: input.method,
      category: classification.category,
      code: classification.code,
      exceptionType: classification.exceptionType,
      stackTrace,
      message: input.error instanceof Error ? input.error.message : "Unexpected error.",
    })
  )
}

function getBearerToken(request: IncomingMessage): string | null {
  const authorization = request.headers.authorization
  if (!authorization) {
    return null
  }
  const [scheme, token] = authorization.split(" ")
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null
  }
  return token
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {}
  const cookies: Record<string, string> = {}
  for (const part of header.split(";")) {
    const separatorIndex = part.indexOf("=")
    if (separatorIndex === -1) continue
    const name = part.slice(0, separatorIndex).trim()
    const value = part.slice(separatorIndex + 1).trim()
    if (name) cookies[name] = decodeURIComponent(value)
  }
  return cookies
}

function classifyDeviceType(userAgent: string | undefined): string | null {
  if (!userAgent) return null
  if (/mobile/i.test(userAgent)) return "mobile"
  if (/tablet|ipad/i.test(userAgent)) return "tablet"
  return "desktop"
}

function parsePage(value: string | null, fallback: number) {
  const parsed = Number(value ?? fallback)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function toOrigin(value: string) {
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

function getCorsOrigins() {
  const configured = [process.env.NEXT_PUBLIC_APP_URL, process.env.APP_URL]
    .filter((value): value is string => Boolean(value && value.trim().length > 0))
    .map((value) => toOrigin(value))
    .filter((value): value is string => Boolean(value))

  const allowListFromEnv = (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => toOrigin(value))
    .filter((value): value is string => Boolean(value))

  const defaults = ["http://localhost:3000"]
  if (process.env.NODE_ENV !== "production") {
    defaults.push("http://localhost:3001")
  }

  return new Set<string>([...defaults, ...configured, ...allowListFromEnv])
}

function getCorsHeaders(request: IncomingMessage): Record<string, string> {
  const origin = request.headers.origin
  const allowedOrigins = getCorsOrigins()

  if (origin && allowedOrigins.has(origin)) {
    return {
      "access-control-allow-origin": origin,
      "access-control-allow-credentials": "true",
      "access-control-allow-headers":
        "content-type, authorization, x-correlation-id, x-request-id, x-workspace-id, x-request-timeout-ms",
      "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
      vary: "Origin",
    }
  }

  return {}
}

// The storefront capture snippet (tracking/snippet.ts) calls this from an arbitrary merchant
// origin, which getCorsHeaders()'s allowlist can never contain by design (it's scoped to
// MADAR's own dashboard origins). A wildcard is safe specifically here: the route is write-only,
// returns nothing sensitive, and never reads MADAR-domain cookies, so no
// access-control-allow-credentials is needed (which is what makes "*" unsafe elsewhere).
const PUBLIC_CAPTURE_CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "POST,OPTIONS",
}

// Providers signal that a connectionId isn't theirs by throwing an Error whose
// message ends in "_CONNECTION_NOT_FOUND" (e.g. GOOGLE_OAUTH_CONNECTION_NOT_FOUND,
// SNAPCHAT_OAUTH_CONNECTION_NOT_FOUND) -- this lets connection-lifecycle routes try
// every registered provider in turn without bespoke per-connector wiring here, so a
// new connector gets pause/resume/disconnect/reconnect/events automatically once it
// implements the IntegrationProvider methods.
function isConnectionNotFoundError(error: unknown) {
  return error instanceof Error && /_CONNECTION_NOT_FOUND$/.test(error.message)
}

async function dispatchToProviders<T>(
  providers: IntegrationProvider[],
  attempt: (provider: IntegrationProvider) => Promise<T> | undefined
): Promise<{ found: true; value: T } | { found: false }> {
  for (const provider of providers) {
    const call = attempt(provider)
    if (call === undefined) continue
    try {
      return { found: true, value: await call }
    } catch (error) {
      if (!isConnectionNotFoundError(error)) throw error
    }
  }
  return { found: false }
}

export function createIdentityApiServer(
  container: IdentityPlatformContainer = createIdentityPlatform()
) {
  const googleOAuthService = container.infrastructure.database
    ? new GoogleOAuthService(
        new GoogleOAuthRepository(container.infrastructure.database),
        undefined,
        container.infrastructure.googleIdentityCredentialsProvider
      )
    : null
  const googleOAuthController = googleOAuthService
    ? new GoogleOAuthController(googleOAuthService)
    : null

  // Pausing/resuming connections on org/workspace archive is a best-effort
  // side effect -- the archive/restore itself has already succeeded by the
  // time this runs, so a failure here must never turn a successful response
  // into an error.
  async function runConnectionCascade(run: () => Promise<unknown> | undefined) {
    try {
      await run()
    } catch (error) {
      console.error("connection lifecycle cascade failed", error)
    }
  }
  const googleOAuthDeletionService = container.infrastructure.database
    ? new GoogleOAuthConnectionDeletionService(
        new GoogleOAuthRepository(container.infrastructure.database)
      )
    : null
  const snapchatOAuthDeletionService = container.infrastructure.database
    ? new SnapchatOAuthConnectionDeletionService(
        new SnapchatOAuthRepository(container.infrastructure.database)
      )
    : null
  const metaOAuthDeletionService = container.infrastructure.database
    ? new MetaOAuthConnectionDeletionService(
        new MetaOAuthRepository(container.infrastructure.database)
      )
    : null
  const sallaOAuthDeletionService = container.infrastructure.database
    ? new SallaOAuthConnectionDeletionService(
        new SallaOAuthRepository(container.infrastructure.database)
      )
    : null
  const shopifyOAuthDeletionService = container.infrastructure.database
    ? new ShopifyOAuthConnectionDeletionService(
        new ShopifyOAuthRepository(container.infrastructure.database)
      )
    : null
  const metaAdsCredentialsProvider = new EnvironmentFirstMetaAdsCredentialsProvider()
  const googleAnalyticsOAuthDeletionService = container.infrastructure.database
    ? new GoogleAnalyticsOAuthConnectionDeletionService(
        new GoogleAnalyticsOAuthRepository(container.infrastructure.database)
      )
    : null
  const zidOAuthDeletionService = container.infrastructure.database
    ? new ZidOAuthConnectionDeletionService(
        new ZidOAuthRepository(container.infrastructure.database)
      )
    : null
  // Standalone instance for the marketplace-install routes below (getPendingInstallSummary/
  // claimInstall) -- these are Zid-only, not part of the generic IntegrationProvider interface
  // every other :provider/oauth/* route dispatches through via container.infrastructure.integrations.
  const zidOAuthMarketplaceService = container.infrastructure.database
    ? new ZidOAuthService(new ZidOAuthRepository(container.infrastructure.database))
    : null
  const tiktokAdsOAuthDeletionService = container.infrastructure.database
    ? new TikTokAdsOAuthConnectionDeletionService(
        new TikTokAdsOAuthRepository(container.infrastructure.database)
      )
    : null
  const productsAggregationService = container.infrastructure.database
    ? new ProductsAggregationService(container.infrastructure.database)
    : null
  const customersAggregationService = container.infrastructure.database
    ? new CustomersAggregationService(container.infrastructure.database)
    : null
  const ordersAggregationService = container.infrastructure.database
    ? new OrdersAggregationService(container.infrastructure.database)
    : null
  const campaignsPerformanceAggregationService = container.infrastructure.database
    ? new CampaignsPerformanceAggregationService(container.infrastructure.database)
    : null
  const storesAggregationService = container.infrastructure.database
    ? new StoresAggregationService(container.infrastructure.database)
    : null
  const posService = container.infrastructure.database
    ? new PosService(
        new PosRepository(container.infrastructure.database),
        new HmacTokenService(container.config.jwtSecret, container.config.tokenHashSecret),
        new ScryptPasswordHasher()
      )
    : null
  const campaignRepositoryForLinks = container.infrastructure.database
    ? new CampaignRepository(container.infrastructure.database)
    : null
  const campaignService = campaignRepositoryForLinks
    ? new CampaignService(campaignRepositoryForLinks)
    : null
  const campaignLinkService =
    container.infrastructure.database && campaignRepositoryForLinks
      ? new CampaignLinkService(
          new CampaignLinkRepository(container.infrastructure.database),
          campaignRepositoryForLinks,
          container.infrastructure.database,
          container.config.shortLinkBaseUrl,
          async (displayId: string) => {
            await container.infrastructure.cache?.delete(`campaign-link:redirect:${displayId}`)
          }
        )
      : null
  const trackingService =
    container.infrastructure.database && campaignLinkService
      ? new TrackingService(
          new CampaignLinkRepository(container.infrastructure.database),
          new TrackingRepository(container.infrastructure.database),
          container.infrastructure.cache
        )
      : null
  const orderAttributionService = container.infrastructure.database
    ? new OrderAttributionService(
        new AttributionRepository(container.infrastructure.database),
        new CampaignLinkRepository(container.infrastructure.database)
      )
    : null
  const aggregationService = container.infrastructure.database
    ? new AggregationService(new AggregationRepository(container.infrastructure.database))
    : null
  // No Meta Graph API version was in use anywhere in this codebase prior to this endpoint
  // (confirmed by inspection -- only Google/Snapchat connectors exist), so this default is a
  // new choice, not a change to an existing pinned version. Override via env if needed.
  const metaGraphApiBaseUrl =
    process.env.IDENTITY_PLATFORM_META_GRAPH_API_BASE_URL?.trim() ||
    "https://graph.facebook.com/v21.0"

  return createServer(async (request, response) => {
    const method = request.method ?? "GET"
    const url = new URL(request.url ?? "/", "http://localhost")
    const context = createRequestContext(request)
    const requestStartedAt = Date.now()
    const corsHeaders = getCorsHeaders(request)
    const send = (
      status: number,
      body: unknown,
      headers: Record<string, string | string[]> = {}
    ) => {
      container.infrastructure.metrics?.recordHistogram(
        "organization_api_latency",
        Date.now() - requestStartedAt,
        {
          path: url.pathname,
          method,
        }
      )
      return json(response, status, body, { ...corsHeaders, ...headers })
    }

    try {
      if (method === "OPTIONS" && url.pathname === "/v1/tracking/capture") {
        return send(204, null, PUBLIC_CAPTURE_CORS_HEADERS)
      }

      if (method === "OPTIONS") {
        return send(204, null)
      }

      if (method === "GET" && url.pathname === "/live") {
        return send(200, { status: "live", service: "identity-platform" })
      }

      if (method === "GET" && url.pathname === "/health") {
        const databaseHealth = container.infrastructure.database
          ? await container.infrastructure.database.healthCheck()
          : { ok: true, message: "memory mode" }
        const cacheHealth = container.infrastructure.cache
          ? await container.infrastructure.cache.healthCheck()
          : { ok: true, message: "memory mode" }
        return send(200, {
          status: databaseHealth.ok && cacheHealth.ok ? "ok" : "degraded",
          service: "identity-platform",
          checks: { database: databaseHealth, cache: cacheHealth },
        })
      }

      if (method === "GET" && url.pathname === "/ready") {
        const databaseHealth = container.infrastructure.database
          ? await container.infrastructure.database.healthCheck()
          : { ok: true, message: "memory mode" }
        const cacheHealth = container.infrastructure.cache
          ? await container.infrastructure.cache.healthCheck()
          : { ok: true, message: "memory mode" }
        const ready = databaseHealth.ok && cacheHealth.ok
        return send(ready ? 200 : 503, {
          status: ready ? "ready" : "not_ready",
          service: "identity-platform",
          checks: { database: databaseHealth, cache: cacheHealth },
        })
      }

      if (method === "POST" && url.pathname === "/v1/auth/register") {
        return send(
          201,
          await container.commands.register(
            registerSchema.parse(await readJsonBody(request)),
            context
          )
        )
      }

      if (method === "POST" && url.pathname === "/v1/auth/verify-email") {
        await container.commands.verifyEmail(
          verifyEmailSchema.parse(await readJsonBody(request)),
          context
        )
        return send(200, { verified: true })
      }

      if (method === "POST" && url.pathname === "/v1/auth/login") {
        return send(
          200,
          await container.commands.login(loginSchema.parse(await readJsonBody(request)), context)
        )
      }

      if (method === "POST" && url.pathname === "/v1/auth/refresh") {
        return send(
          200,
          await container.commands.refresh(
            refreshSchema.parse(await readJsonBody(request)),
            context
          )
        )
      }

      if (method === "POST" && url.pathname === "/v1/auth/password/forgot") {
        return send(
          202,
          await container.commands.createPasswordReset(
            forgotPasswordSchema.parse(await readJsonBody(request)),
            context
          )
        )
      }

      if (method === "POST" && url.pathname === "/v1/auth/password/reset") {
        await container.commands.resetPassword(
          resetPasswordSchema.parse(await readJsonBody(request)),
          context
        )
        return send(200, { reset: true })
      }

      // POS employees aren't `users` rows -- their tokens are verified against a separate
      // session store (see PosService.resolveActor), so these can never be authenticated via
      // the regular resolveActorFromAccessToken() gate below and must be handled up here.
      if (method === "POST" && url.pathname === "/v1/pos/auth/login") {
        if (!posService) {
          return send(503, {
            code: "POS_UNAVAILABLE",
            message: "POS is unavailable in memory mode.",
          })
        }
        return send(200, await posService.login(posLoginSchema.parse(await readJsonBody(request))))
      }

      if (url.pathname === "/v1/pos/auth/session" || url.pathname === "/v1/pos/auth/logout") {
        if (!posService) {
          return send(503, {
            code: "POS_UNAVAILABLE",
            message: "POS is unavailable in memory mode.",
          })
        }
        const posToken = getBearerToken(request)
        if (!posToken) {
          return send(401, { code: "POS_AUTH_TOKEN_MISSING", message: "Authentication required." })
        }
        const posActor = await posService.resolveActor(posToken)

        if (method === "GET" && url.pathname === "/v1/pos/auth/session") {
          const employee = await posService.getEmployee(
            posActor.organizationId,
            posActor.employeeId
          )
          if (!employee) {
            return send(401, {
              code: "POS_AUTH_TOKEN_INVALID",
              message: "Session is invalid or expired.",
            })
          }
          return send(200, { employee })
        }

        if (method === "POST" && url.pathname === "/v1/pos/auth/logout") {
          await posService.logout(posActor.sessionId)
          return send(200, { loggedOut: true })
        }
      }

      if (method === "GET" && url.pathname === "/v1/integrations/google/oauth/callback") {
        if (!googleOAuthController) {
          return send(503, {
            code: "GOOGLE_OAUTH_UNAVAILABLE",
            message: "Google OAuth is unavailable in memory mode.",
          })
        }

        const callbackResult = await googleOAuthController.callback(request, url.searchParams)
        response.writeHead(callbackResult.status, callbackResult.headers)
        response.end()
        return
      }

      const providerOauthCallbackMatch = url.pathname.match(
        /^\/v1\/integrations\/([^/]+)\/oauth\/callback$/
      )
      if (method === "GET" && providerOauthCallbackMatch) {
        const provider = container.infrastructure.integrations?.find(providerOauthCallbackMatch[1])
        if (!provider || !provider.oauthCallback) {
          return send(404, { code: "PROVIDER_NOT_FOUND", message: "Provider not found." })
        }

        const callbackResult = await provider.oauthCallback(request, url.searchParams)
        response.writeHead(callbackResult.status, callbackResult.headers)
        response.end()
        return
      }

      const zidInstallSummaryMatch = url.pathname.match(
        /^\/v1\/integrations\/zid\/install\/([^/]+)$/
      )
      if (method === "GET" && zidInstallSummaryMatch) {
        if (!zidOAuthMarketplaceService) {
          return send(503, {
            code: "ZID_MARKETPLACE_INSTALL_UNAVAILABLE",
            message: "Zid marketplace install is unavailable in memory mode.",
          })
        }

        const decision = await container.infrastructure.rateLimiter?.check(
          `zid_install_lookup:${context.ipAddress}`,
          30,
          60_000
        )
        if (decision && !decision.allowed) {
          return send(429, {
            code: "ZID_MARKETPLACE_INSTALL_RATE_LIMITED",
            message: "Too many requests.",
          })
        }

        try {
          const summary = await zidOAuthMarketplaceService.getPendingInstallSummary(
            decodeURIComponent(zidInstallSummaryMatch[1])
          )
          return send(200, summary)
        } catch {
          return send(404, {
            code: "ZID_MARKETPLACE_INSTALL_NOT_FOUND",
            message: "Install not found or expired.",
          })
        }
      }

      const shortLinkRedirectMatch = url.pathname.match(/^\/m\/([^/]+)$/)
      if (method === "GET" && shortLinkRedirectMatch) {
        const displayId = decodeURIComponent(shortLinkRedirectMatch[1])
        const link = trackingService ? await trackingService.resolveLink(displayId) : null
        if (!link) {
          return send(404, { code: "CAMPAIGN_LINK_NOT_FOUND", message: "Link not found." })
        }
        if (!link.enabled) {
          return send(410, {
            code: "CAMPAIGN_LINK_DISABLED",
            message: "This link is no longer active.",
          })
        }

        const cookies = parseCookies(request.headers.cookie)
        const visitorId = cookies.madar_visitor_id ?? randomUUID()
        const sessionId = cookies.madar_session_id ?? randomUUID()
        const cookieBaseAttributes = "Path=/; HttpOnly; Secure; SameSite=Lax"
        const setCookieHeaders: string[] = []
        if (!cookies.madar_visitor_id) {
          setCookieHeaders.push(
            `madar_visitor_id=${visitorId}; Max-Age=31536000; ${cookieBaseAttributes}`
          )
        }
        if (!cookies.madar_session_id) {
          setCookieHeaders.push(
            `madar_session_id=${sessionId}; Max-Age=1800; ${cookieBaseAttributes}`
          )
        }

        // The redirect fires before anything else -- event/attribution recording below must
        // never delay or be able to fail it.
        response.writeHead(302, {
          location: link.finalUrl,
          ...(setCookieHeaders.length ? { "set-cookie": setCookieHeaders } : {}),
        })
        response.end()

        if (trackingService) {
          const referrerHeader = request.headers.referer
          const platformSignals = extractPlatformSignals(url.searchParams)
          trackingService
            .recordClick({
              organizationId: link.organizationId,
              campaignId: link.campaignId,
              campaignLinkId: link.campaignLinkId,
              eventType: "CLICK",
              visitorId,
              sessionId,
              utmSource: link.utmSource,
              utmMedium: link.utmMedium,
              utmCampaign: link.utmCampaign,
              utmContent: link.utmContent,
              utmTerm: link.utmTerm,
              landingUrl: link.finalUrl,
              referrerUrl: Array.isArray(referrerHeader)
                ? (referrerHeader[0] ?? null)
                : (referrerHeader ?? null),
              deviceType: classifyDeviceType(request.headers["user-agent"]),
              customerRef: null,
              ...platformSignals,
            })
            .catch((error: unknown) => {
              container.infrastructure.metrics?.incrementCounter(
                "campaign_link_click_record_failed",
                1
              )
              console.error("campaign_link.click_record_failed", error)
            })
        }

        return
      }

      if (method === "GET" && url.pathname === "/v1/tracking/snippet.js") {
        response.writeHead(200, {
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": "public, max-age=300",
        })
        response.end(TRACKING_SNIPPET_JS)
        return
      }

      if (method === "POST" && url.pathname === "/v1/tracking/capture") {
        if (!trackingService) {
          return send(
            503,
            {
              code: "TRACKING_UNAVAILABLE",
              message: "Tracking capture is unavailable in memory mode.",
            },
            PUBLIC_CAPTURE_CORS_HEADERS
          )
        }

        const decision = await container.infrastructure.rateLimiter?.check(
          `tracking_capture:${context.ipAddress}`,
          60,
          60_000
        )
        if (decision && !decision.allowed) {
          return send(
            429,
            { code: "TRACKING_CAPTURE_RATE_LIMITED", message: "Too many requests." },
            PUBLIC_CAPTURE_CORS_HEADERS
          )
        }

        const payload = captureTrackingEventSchema.parse(await readJsonBody(request))
        const organizationId = await trackingService.resolveOrganizationBySiteKey(payload.siteKey)
        if (!organizationId) {
          return send(
            404,
            { code: "TRACKING_SITE_KEY_NOT_FOUND", message: "Unknown site key." },
            PUBLIC_CAPTURE_CORS_HEADERS
          )
        }

        await trackingService.recordClick({
          organizationId,
          campaignId: null,
          campaignLinkId: null,
          eventType: "PAGE_VIEW",
          visitorId: payload.visitorId,
          sessionId: payload.sessionId,
          utmSource: payload.utmSource ?? null,
          utmMedium: payload.utmMedium ?? null,
          utmCampaign: payload.utmCampaign ?? null,
          utmContent: payload.utmContent ?? null,
          utmTerm: payload.utmTerm ?? null,
          landingUrl: payload.pageUrl,
          referrerUrl: payload.referrerUrl ?? null,
          deviceType: classifyDeviceType(request.headers["user-agent"]),
          clickId: payload.clickId ?? null,
          clickIdPlatform: payload.clickIdPlatform ?? null,
          platformCampaignId: payload.platformCampaignId ?? null,
          platformAdgroupId: payload.platformAdgroupId ?? null,
          platformKeyword: payload.platformKeyword ?? null,
          platformCreativeId: payload.platformCreativeId ?? null,
          customerRef: hashCustomerEmail(payload.customerEmail ?? null),
        })

        return send(200, { ok: true }, PUBLIC_CAPTURE_CORS_HEADERS)
      }

      const token = getBearerToken(request)
      if (!token) {
        return send(401, { code: "AUTH_TOKEN_MISSING", message: "Authentication required." })
      }

      const actor = await container.commands.resolveActorFromAccessToken(token)

      const zidInstallClaimMatch = url.pathname.match(
        /^\/v1\/integrations\/zid\/install\/([^/]+)\/claim$/
      )
      if (method === "POST" && zidInstallClaimMatch) {
        if (!zidOAuthMarketplaceService) {
          return send(503, {
            code: "ZID_MARKETPLACE_INSTALL_UNAVAILABLE",
            message: "Zid marketplace install is unavailable in memory mode.",
          })
        }
        return send(
          200,
          await zidOAuthMarketplaceService.claimInstall(
            actor,
            decodeURIComponent(zidInstallClaimMatch[1])
          )
        )
      }

      if (method === "GET" && url.pathname === "/v1/auth/session") {
        return send(200, await container.queries.getSession(actor))
      }

      if (method === "POST" && url.pathname === "/v1/auth/logout") {
        await container.commands.logout({ sessionId: actor.sessionId }, context, actor)
        return send(200, { loggedOut: true }, getLogoutCookieHeaders())
      }

      if (method === "POST" && url.pathname === "/v1/auth/sessions/revoke") {
        await container.commands.revokeSession(
          revokeSessionSchema.parse(await readJsonBody(request)),
          context,
          actor
        )
        return send(200, { revoked: true })
      }

      if (method === "GET" && url.pathname === "/v1/identity/profile") {
        return send(200, await container.queries.getProfile(actor))
      }

      if (method === "PATCH" && url.pathname === "/v1/identity/profile") {
        return send(
          200,
          await container.commands.updateProfile(
            actor,
            updateProfileSchema.parse(await readJsonBody(request)),
            context
          )
        )
      }

      if (method === "GET" && url.pathname === "/v1/integrations/meta-ads/diagnostics") {
        if (!actor.modulePermissions.includes("connections:manage")) {
          throw ERRORS.forbidden()
        }

        let accessToken: string
        try {
          accessToken = (await metaAdsCredentialsProvider.load()).accessToken
        } catch {
          // Never echo the underlying error -- it may include partial secret material from a
          // malformed AWS Secrets Manager payload. The message here is deliberately generic.
          return send(400, {
            code: "META_ADS_NOT_CONFIGURED",
            message:
              "No Meta access token is configured. Set META_ACCESS_TOKEN or the AWS secret at " +
              "madar/prod/connectors/meta before running diagnostics.",
          })
        }

        const client = createMetaGraphApiClient({
          accessToken,
          apiBaseUrl: metaGraphApiBaseUrl,
        })
        return send(200, await runMetaConnectionDiagnostics(client))
      }

      if (method === "POST" && url.pathname === "/v1/identity/profile/avatar") {
        return send(
          200,
          await container.commands.uploadAvatar(
            actor,
            uploadAvatarSchema.parse(await readJsonBody(request)),
            context
          )
        )
      }

      if (method === "DELETE" && url.pathname === "/v1/identity/profile/avatar") {
        return send(
          200,
          await container.commands.updateProfile(actor, { avatarUrl: null }, context)
        )
      }

      if (method === "POST" && url.pathname === "/v1/integrations/google/oauth/start") {
        if (!googleOAuthController) {
          return send(503, {
            code: "GOOGLE_OAUTH_UNAVAILABLE",
            message: "Google OAuth is unavailable in memory mode.",
          })
        }

        const payload = integrationOAuthStartSchema.parse(await readJsonBody(request))
        return send(200, await googleOAuthController.start(actor, payload))
      }

      if (method === "POST" && url.pathname === "/v1/integrations/google-ads/oauth/start") {
        if (!googleOAuthController) {
          return send(503, {
            code: "GOOGLE_OAUTH_UNAVAILABLE",
            message: "Google OAuth is unavailable in memory mode.",
          })
        }

        const payload = integrationOAuthStartSchema.parse(await readJsonBody(request))
        return send(200, await googleOAuthController.start(actor, payload))
      }

      const providerOauthStartMatch = url.pathname.match(
        /^\/v1\/integrations\/([^/]+)\/oauth\/start$/
      )
      if (method === "POST" && providerOauthStartMatch) {
        const provider = container.infrastructure.integrations?.find(providerOauthStartMatch[1])
        if (!provider || !provider.oauthStart) {
          return send(404, { code: "PROVIDER_NOT_FOUND", message: "Provider not found." })
        }

        const payload = integrationOAuthStartSchema.parse(await readJsonBody(request))
        return send(200, await provider.oauthStart(actor, payload))
      }

      if (method === "GET" && url.pathname === "/v1/integrations/google/connection") {
        if (!googleOAuthController) {
          return send(503, {
            code: "GOOGLE_OAUTH_UNAVAILABLE",
            message: "Google OAuth is unavailable in memory mode.",
          })
        }
        return send(200, await googleOAuthController.getActiveConnection(actor))
      }

      const providerConnectionMatch = url.pathname.match(
        /^\/v1\/integrations\/([^/]+)\/connection$/
      )
      if (method === "GET" && providerConnectionMatch) {
        const provider = container.infrastructure.integrations?.find(providerConnectionMatch[1])
        if (!provider || !provider.getActiveConnection) {
          return send(404, { code: "PROVIDER_NOT_FOUND", message: "Provider not found." })
        }

        return send(200, await provider.getActiveConnection(actor))
      }

      const pauseIntegrationMatch = url.pathname.match(/^\/v1\/integrations\/([^/]+)\/pause$/)
      if (method === "POST" && pauseIntegrationMatch) {
        const connectionId = pauseIntegrationMatch[1]

        if (googleOAuthController) {
          try {
            return send(200, await googleOAuthController.pause(actor, connectionId))
          } catch (error) {
            if (!isConnectionNotFoundError(error)) throw error
          }
        }

        const dispatched = await dispatchToProviders(
          container.infrastructure.integrations?.list() ?? [],
          (provider) => provider.pause?.(actor, { connectionId })
        )
        if (dispatched.found) {
          return send(200, dispatched.value)
        }

        return send(404, { code: "CONNECTION_NOT_FOUND", message: "Connection not found." })
      }

      const resumeIntegrationMatch = url.pathname.match(/^\/v1\/integrations\/([^/]+)\/resume$/)
      if (method === "POST" && resumeIntegrationMatch) {
        const connectionId = resumeIntegrationMatch[1]

        if (googleOAuthController) {
          try {
            return send(200, await googleOAuthController.resume(actor, connectionId))
          } catch (error) {
            if (!isConnectionNotFoundError(error)) throw error
          }
        }

        const dispatched = await dispatchToProviders(
          container.infrastructure.integrations?.list() ?? [],
          (provider) => provider.resume?.(actor, { connectionId })
        )
        if (dispatched.found) {
          return send(200, dispatched.value)
        }

        return send(404, { code: "CONNECTION_NOT_FOUND", message: "Connection not found." })
      }

      const disconnectIntegrationMatch = url.pathname.match(
        /^\/v1\/integrations\/([^/]+)\/disconnect$/
      )
      if (method === "POST" && disconnectIntegrationMatch) {
        const connectionId = disconnectIntegrationMatch[1]
        const payload = integrationDisconnectSchema.parse(await readJsonBody(request))

        if (googleOAuthController) {
          try {
            return send(
              200,
              await googleOAuthController.disconnect(actor, {
                connectionId,
                reason: payload.reason,
              })
            )
          } catch (error) {
            if (!isConnectionNotFoundError(error)) throw error
          }
        }

        const dispatched = await dispatchToProviders(
          container.infrastructure.integrations?.list() ?? [],
          (provider) => provider.disconnect?.(actor, { connectionId, reason: payload.reason })
        )
        if (dispatched.found) {
          return send(200, dispatched.value)
        }

        return send(404, { code: "CONNECTION_NOT_FOUND", message: "Connection not found." })
      }

      const reconnectIntegrationMatch = url.pathname.match(
        /^\/v1\/integrations\/([^/]+)\/reconnect$/
      )
      if (method === "POST" && reconnectIntegrationMatch) {
        const connectionId = reconnectIntegrationMatch[1]

        if (googleOAuthController) {
          try {
            return send(200, await googleOAuthController.reconnect(actor, connectionId))
          } catch (error) {
            if (!isConnectionNotFoundError(error)) throw error
          }
        }

        const dispatched = await dispatchToProviders(
          container.infrastructure.integrations?.list() ?? [],
          (provider) => provider.reconnect?.(actor, { connectionId })
        )
        if (dispatched.found) {
          return send(200, dispatched.value)
        }

        return send(404, { code: "CONNECTION_NOT_FOUND", message: "Connection not found." })
      }

      const retryStatusIntegrationMatch = url.pathname.match(
        /^\/v1\/integrations\/([^/]+)\/retry-status$/
      )
      if (method === "GET" && retryStatusIntegrationMatch) {
        const provider = container.infrastructure.integrations?.find("google-ads")
        if (!provider || !provider.getRetryStatus) {
          return send(404, { code: "PROVIDER_NOT_FOUND", message: "Provider not found." })
        }

        return send(
          200,
          await provider.getRetryStatus(actor, { connectionId: retryStatusIntegrationMatch[1] })
        )
      }

      const retryIntegrationMatch = url.pathname.match(/^\/v1\/integrations\/([^/]+)\/retry$/)
      if (method === "POST" && retryIntegrationMatch) {
        const provider = container.infrastructure.integrations?.find("google-ads")
        if (!provider || !provider.retry) {
          return send(404, { code: "PROVIDER_NOT_FOUND", message: "Provider not found." })
        }

        return send(200, await provider.retry(actor, { connectionId: retryIntegrationMatch[1] }))
      }

      const integrationEventsMatch = url.pathname.match(/^\/v1\/integrations\/([^/]+)\/events$/)
      if (method === "GET" && integrationEventsMatch) {
        const connectionId = integrationEventsMatch[1]
        const query = integrationEventsQuerySchema.parse(
          Object.fromEntries(url.searchParams.entries())
        )

        if (googleOAuthController) {
          try {
            return send(
              200,
              await googleOAuthController.listRecentEvents(actor, {
                connectionId,
                limit: query.limit,
              })
            )
          } catch (error) {
            if (!isConnectionNotFoundError(error)) throw error
          }
        }

        const dispatched = await dispatchToProviders(
          container.infrastructure.integrations?.list() ?? [],
          (provider) => provider.listEvents?.(actor, { connectionId, limit: query.limit })
        )
        if (dispatched.found) {
          return send(200, dispatched.value)
        }

        return send(404, { code: "CONNECTION_NOT_FOUND", message: "Connection not found." })
      }

      const deleteIntegrationMatch = url.pathname.match(/^\/v1\/integrations\/([^/]+)$/)
      if (method === "DELETE" && deleteIntegrationMatch) {
        if (
          !googleOAuthDeletionService &&
          !snapchatOAuthDeletionService &&
          !metaOAuthDeletionService &&
          !sallaOAuthDeletionService &&
          !shopifyOAuthDeletionService &&
          !googleAnalyticsOAuthDeletionService &&
          !zidOAuthDeletionService &&
          !tiktokAdsOAuthDeletionService
        ) {
          return send(503, {
            code: "INTEGRATION_OAUTH_UNAVAILABLE",
            message: "Integration OAuth is unavailable in memory mode.",
          })
        }

        let deleted = false

        if (googleOAuthDeletionService) {
          try {
            await googleOAuthDeletionService.deleteConnection(actor, deleteIntegrationMatch[1])
            deleted = true
          } catch (error) {
            const isNotFound =
              error instanceof IdentityError && error.code === "GOOGLE_OAUTH_CONNECTION_NOT_FOUND"
            if (!isNotFound) {
              throw error
            }
          }
        }

        if (!deleted && snapchatOAuthDeletionService) {
          try {
            await snapchatOAuthDeletionService.deleteConnection(actor, deleteIntegrationMatch[1])
            deleted = true
          } catch (error) {
            const isNotFound =
              error instanceof IdentityError && error.code === "SNAPCHAT_OAUTH_CONNECTION_NOT_FOUND"
            if (!isNotFound) {
              throw error
            }
          }
        }

        if (!deleted && metaOAuthDeletionService) {
          try {
            await metaOAuthDeletionService.deleteConnection(actor, deleteIntegrationMatch[1])
            deleted = true
          } catch (error) {
            const isNotFound =
              error instanceof IdentityError && error.code === "META_OAUTH_CONNECTION_NOT_FOUND"
            if (!isNotFound) {
              throw error
            }
          }
        }

        if (!deleted && sallaOAuthDeletionService) {
          try {
            await sallaOAuthDeletionService.deleteConnection(actor, deleteIntegrationMatch[1])
            deleted = true
          } catch (error) {
            const isNotFound =
              error instanceof IdentityError && error.code === "SALLA_OAUTH_CONNECTION_NOT_FOUND"
            if (!isNotFound) {
              throw error
            }
          }
        }

        if (!deleted && shopifyOAuthDeletionService) {
          try {
            await shopifyOAuthDeletionService.deleteConnection(actor, deleteIntegrationMatch[1])
            deleted = true
          } catch (error) {
            const isNotFound =
              error instanceof IdentityError && error.code === "SHOPIFY_OAUTH_CONNECTION_NOT_FOUND"
            if (!isNotFound) {
              throw error
            }
          }
        }

        if (!deleted && googleAnalyticsOAuthDeletionService) {
          try {
            await googleAnalyticsOAuthDeletionService.deleteConnection(
              actor,
              deleteIntegrationMatch[1]
            )
            deleted = true
          } catch (error) {
            const isNotFound =
              error instanceof IdentityError &&
              error.code === "GOOGLE_ANALYTICS_OAUTH_CONNECTION_NOT_FOUND"
            if (!isNotFound) {
              throw error
            }
          }
        }

        if (!deleted && zidOAuthDeletionService) {
          try {
            await zidOAuthDeletionService.deleteConnection(actor, deleteIntegrationMatch[1])
            deleted = true
          } catch (error) {
            const isNotFound =
              error instanceof IdentityError && error.code === "ZID_OAUTH_CONNECTION_NOT_FOUND"
            if (!isNotFound) {
              throw error
            }
          }
        }

        if (!deleted && tiktokAdsOAuthDeletionService) {
          try {
            await tiktokAdsOAuthDeletionService.deleteConnection(actor, deleteIntegrationMatch[1])
            deleted = true
          } catch (error) {
            const isNotFound =
              error instanceof IdentityError &&
              error.code === "TIKTOK_ADS_OAUTH_CONNECTION_NOT_FOUND"
            if (!isNotFound) {
              throw error
            }
          }
        }

        if (!deleted) {
          return send(404, {
            code: "CONNECTION_NOT_FOUND",
            message: "Connection not found.",
          })
        }

        response.writeHead(204, corsHeaders)
        response.end()
        return
      }

      const integrationSelectedAccountMatch = url.pathname.match(
        /^\/v1\/integrations\/([^/]+)\/accounts\/selected$/
      )
      if (method === "GET" && integrationSelectedAccountMatch) {
        const provider = container.infrastructure.integrations?.find(
          integrationSelectedAccountMatch[1]
        )
        if (!provider || !provider.getSelectedAccount) {
          return send(404, { code: "PROVIDER_NOT_FOUND", message: "Provider not found." })
        }

        const query = integrationAccountsQuerySchema.parse(
          Object.fromEntries(url.searchParams.entries())
        )
        return send(200, { item: await provider.getSelectedAccount(actor, query) })
      }

      const integrationSelectAccountMatch = url.pathname.match(
        /^\/v1\/integrations\/([^/]+)\/accounts\/select$/
      )
      if (method === "POST" && integrationSelectAccountMatch) {
        const provider = container.infrastructure.integrations?.find(
          integrationSelectAccountMatch[1]
        )
        if (!provider || !provider.selectAccount) {
          return send(404, { code: "PROVIDER_NOT_FOUND", message: "Provider not found." })
        }

        const payload = integrationAccountSelectionSchema.parse(await readJsonBody(request))
        return send(200, await provider.selectAccount(actor, payload))
      }

      const integrationMatch = url.pathname.match(
        /^\/v1\/integrations\/([^/]+)\/(sync|records|accounts)$/
      )
      if (integrationMatch) {
        const providerId = integrationMatch[1]
        const action = integrationMatch[2]
        const provider = container.infrastructure.integrations?.find(providerId)

        if (!provider) {
          return send(404, { code: "PROVIDER_NOT_FOUND", message: "Provider not found." })
        }

        if (action === "sync" && method === "POST" && provider.sync) {
          const payload = integrationSyncSchema.parse(await readJsonBody(request))
          const loginCustomerId =
            process.env.IDENTITY_PLATFORM_GOOGLE_ADS_LOGIN_CUSTOMER_ID?.trim() || null

          console.info(
            JSON.stringify({
              level: "info",
              service: "identity-platform",
              event: "google_ads.sync_request",
              endpoint: url.pathname,
              handler: "server.integration.sync",
              connectionId: payload.connectionId,
              customerId: payload.customerId,
              loginCustomerId,
              timestamp: new Date().toISOString(),
            })
          )

          beginGoogleAdsSyncRequestTrace({
            endpoint: url.pathname,
            handler: "server.integration.sync",
            connectionId: payload.connectionId,
            customerId: payload.customerId,
          })

          try {
            const syncResult = await provider.sync(actor, payload)

            // Fire-and-forget: an attribution failure must never surface as a sync failure, and
            // must never delay the sync response either.
            if (
              orderAttributionService &&
              (ORDER_PROVIDERS as readonly string[]).includes(providerId)
            ) {
              orderAttributionService
                .matchOrders(actor.organizationId, actor.workspaceId, {
                  provider: providerId as OrderProvider,
                })
                .catch((error: unknown) => {
                  container.infrastructure.metrics?.incrementCounter(
                    "order_attribution_match_failed",
                    1
                  )
                  console.error("order_attribution.match_failed", error)
                })
            }

            return send(200, syncResult)
          } finally {
            endGoogleAdsSyncRequestTrace()
          }
        }

        if (action === "records" && method === "GET" && provider.listRecords) {
          const query = integrationRecordsQuerySchema.parse(
            Object.fromEntries(url.searchParams.entries())
          )
          return send(200, { items: await provider.listRecords(actor, query) })
        }

        if (action === "accounts" && method === "GET" && provider.listAccounts) {
          const query = integrationAccountsQuerySchema.parse(
            Object.fromEntries(url.searchParams.entries())
          )
          return send(200, { items: await provider.listAccounts(actor, query) })
        }
      }

      const invitationAcceptMatch = url.pathname.match(
        /^\/v1\/organizations\/invitations\/([^/]+)\/accept$/
      )
      if (method === "POST" && invitationAcceptMatch) {
        return send(
          200,
          await container.commands.acceptInvitation(
            actor,
            { token: invitationAcceptMatch[1] },
            context
          )
        )
      }

      const invitationDeclineMatch = url.pathname.match(
        /^\/v1\/organizations\/invitations\/([^/]+)\/decline$/
      )
      if (method === "POST" && invitationDeclineMatch) {
        return send(
          200,
          await container.commands.declineInvitation(
            actor,
            { token: invitationDeclineMatch[1] },
            context
          )
        )
      }

      const invitationCancelMatch = url.pathname.match(
        /^\/v1\/organizations\/invitations\/([^/]+)\/cancel$/
      )
      if (method === "POST" && invitationCancelMatch) {
        return send(
          200,
          await container.commands.cancelInvitation(
            actor,
            { invitationId: invitationCancelMatch[1] },
            context
          )
        )
      }

      const invitationResendMatch = url.pathname.match(
        /^\/v1\/organizations\/invitations\/([^/]+)\/resend$/
      )
      if (method === "POST" && invitationResendMatch) {
        return send(
          200,
          await container.commands.resendInvitation(
            actor,
            { invitationId: invitationResendMatch[1] },
            context
          )
        )
      }

      if (method === "POST" && url.pathname === "/v1/organizations") {
        return send(
          201,
          await container.commands.createOrganization(
            actor,
            createOrganizationSchema.parse(await readJsonBody(request)),
            context
          )
        )
      }

      if (method === "GET" && url.pathname === "/v1/organizations") {
        return send(
          200,
          await container.queries.listOrganizations(actor, {
            page: parsePage(url.searchParams.get("page"), 1),
            pageSize: Math.min(parsePage(url.searchParams.get("pageSize"), 20), 100),
            status:
              (url.searchParams.get("status") as "active" | "archived" | "deleted" | null) ??
              undefined,
            sort:
              (url.searchParams.get("sort") as
                | "createdAt:asc"
                | "createdAt:desc"
                | "name:asc"
                | "name:desc"
                | null) ?? undefined,
          })
        )
      }

      const organizationMembersMatch = url.pathname.match(/^\/v1\/organizations\/([^/]+)\/members$/)
      if (method === "GET" && organizationMembersMatch) {
        return send(
          200,
          await container.queries.listOrganizationMembers(actor, organizationMembersMatch[1])
        )
      }

      const organizationTeamsMatch = url.pathname.match(/^\/v1\/organizations\/([^/]+)\/teams$/)
      if (method === "GET" && organizationTeamsMatch) {
        return send(200, await container.queries.listTeams(actor, organizationTeamsMatch[1]))
      }
      if (method === "POST" && organizationTeamsMatch) {
        const payload = createTeamSchema.parse(await readJsonBody(request))
        return send(
          201,
          await container.commands.createTeam(
            actor,
            {
              organizationId: organizationTeamsMatch[1],
              workspaceId: payload.workspaceId,
              name: payload.name,
              description: payload.description,
              color: payload.color,
              roleReference: payload.roleReference,
            },
            context
          )
        )
      }

      const teamMembersMatch = url.pathname.match(/^\/v1\/organizations\/teams\/([^/]+)\/members$/)
      if (method === "GET" && teamMembersMatch) {
        return send(200, await container.queries.listTeamMembers(actor, teamMembersMatch[1]))
      }
      if (method === "POST" && teamMembersMatch) {
        const payload = addTeamMemberSchema.parse(await readJsonBody(request))
        return send(
          201,
          await container.commands.addTeamMember(
            actor,
            { teamId: teamMembersMatch[1], userId: payload.userId },
            context
          )
        )
      }

      const teamMemberMatch = url.pathname.match(
        /^\/v1\/organizations\/teams\/([^/]+)\/members\/([^/]+)$/
      )
      if (method === "DELETE" && teamMemberMatch) {
        return send(
          200,
          await container.commands.removeTeamMember(
            actor,
            { teamId: teamMemberMatch[1], userId: teamMemberMatch[2] },
            context
          )
        )
      }

      const teamMatch = url.pathname.match(/^\/v1\/organizations\/teams\/([^/]+)$/)
      if (method === "PATCH" && teamMatch) {
        const payload = updateTeamSchema.parse(await readJsonBody(request))
        return send(
          200,
          await container.commands.updateTeam(
            actor,
            {
              teamId: teamMatch[1],
              name: payload.name,
              description: payload.description,
              workspaceId: payload.workspaceId,
              color: payload.color,
              roleReference: payload.roleReference,
            },
            context
          )
        )
      }
      if (method === "DELETE" && teamMatch) {
        return send(
          200,
          await container.commands.deleteTeam(actor, { teamId: teamMatch[1] }, context)
        )
      }

      const organizationRolesMatch = url.pathname.match(/^\/v1\/organizations\/([^/]+)\/roles$/)
      if (method === "GET" && organizationRolesMatch) {
        return send(200, await container.queries.listRoles(actor, organizationRolesMatch[1]))
      }
      if (method === "POST" && organizationRolesMatch) {
        const payload = createCustomRoleSchema.parse(await readJsonBody(request))
        return send(
          201,
          await container.commands.createCustomRole(
            actor,
            {
              organizationId: organizationRolesMatch[1],
              name: payload.name,
              description: payload.description,
              permissions: payload.permissions,
            },
            context
          )
        )
      }

      const customRoleMatch = url.pathname.match(/^\/v1\/organizations\/roles\/([^/]+)$/)
      if (method === "PATCH" && customRoleMatch) {
        const payload = updateCustomRoleSchema.parse(await readJsonBody(request))
        return send(
          200,
          await container.commands.updateCustomRole(
            actor,
            {
              roleId: customRoleMatch[1],
              name: payload.name,
              description: payload.description,
              permissions: payload.permissions,
            },
            context
          )
        )
      }
      if (method === "DELETE" && customRoleMatch) {
        return send(
          200,
          await container.commands.deleteCustomRole(actor, { roleId: customRoleMatch[1] }, context)
        )
      }

      const organizationInvitationsMatch = url.pathname.match(
        /^\/v1\/organizations\/([^/]+)\/invitations$/
      )
      if (organizationInvitationsMatch && method === "POST") {
        const payload = inviteOrganizationMemberSchema.parse(await readJsonBody(request))
        return send(
          201,
          await container.commands.inviteMember(
            actor,
            {
              organizationId: organizationInvitationsMatch[1],
              workspaceId: payload.workspaceId,
              email: payload.email,
              role: payload.role,
              idempotencyKey: payload.idempotencyKey,
            },
            context
          )
        )
      }
      if (organizationInvitationsMatch && method === "GET") {
        return send(
          200,
          await container.queries.listOrganizationInvitations(
            actor,
            organizationInvitationsMatch[1],
            {
              page: parsePage(url.searchParams.get("page"), 1),
              pageSize: Math.min(parsePage(url.searchParams.get("pageSize"), 20), 100),
              status:
                (url.searchParams.get("status") as
                  | "pending"
                  | "accepted"
                  | "declined"
                  | "canceled"
                  | "expired"
                  | null) ?? undefined,
            }
          )
        )
      }

      const organizationArchiveMatch = url.pathname.match(/^\/v1\/organizations\/([^/]+)\/archive$/)
      if (method === "POST" && organizationArchiveMatch) {
        return send(
          200,
          await container.commands.archiveOrganization(
            actor,
            { organizationId: organizationArchiveMatch[1] },
            context
          )
        )
      }

      const organizationRestoreMatch = url.pathname.match(/^\/v1\/organizations\/([^/]+)\/restore$/)
      if (method === "POST" && organizationRestoreMatch) {
        return send(
          200,
          await container.commands.restoreOrganization(
            actor,
            { organizationId: organizationRestoreMatch[1] },
            context
          )
        )
      }

      const organizationDeleteMatch = url.pathname.match(/^\/v1\/organizations\/([^/]+)\/delete$/)
      if (method === "POST" && organizationDeleteMatch) {
        return send(
          200,
          await container.commands.deleteOrganization(
            actor,
            { organizationId: organizationDeleteMatch[1] },
            context
          )
        )
      }

      const organizationItemMatch = url.pathname.match(/^\/v1\/organizations\/([^/]+)$/)
      if (organizationItemMatch && method === "GET") {
        return send(200, await container.queries.getOrganization(actor, organizationItemMatch[1]))
      }
      if (organizationItemMatch && method === "PATCH") {
        return send(
          200,
          await container.commands.updateOrganization(
            actor,
            organizationItemMatch[1],
            updateOrganizationSchema.parse(await readJsonBody(request)),
            context
          )
        )
      }

      const memberActionMatch = url.pathname.match(
        /^\/v1\/organizations\/([^/]+)\/members\/([^/]+)\/(suspend|reactivate|remove|transfer-ownership|roles|custom-role|module-access|profile)$/
      )
      if (memberActionMatch && method === "POST") {
        const organizationId = memberActionMatch[1]
        const memberUserId = memberActionMatch[2]
        const action = memberActionMatch[3]
        if (action === "suspend") {
          return send(
            200,
            await container.commands.suspendMember(
              actor,
              {
                organizationId,
                memberUserId,
                reason: suspendMemberSchema.parse(await readJsonBody(request)).reason,
              },
              context
            )
          )
        }
        if (action === "reactivate") {
          return send(
            200,
            await container.commands.reactivateMember(
              actor,
              { organizationId, memberUserId },
              context
            )
          )
        }
        if (action === "remove") {
          return send(
            200,
            await container.commands.removeMember(
              actor,
              {
                organizationId,
                memberUserId,
                reason: removeMemberSchema.parse(await readJsonBody(request)).reason,
              },
              context
            )
          )
        }
        if (action === "transfer-ownership") {
          return send(
            200,
            await container.commands.transferOwnership(
              actor,
              {
                organizationId,
                newOwnerUserId: memberUserId,
              },
              context
            )
          )
        }
        if (action === "roles") {
          return send(
            200,
            await container.commands.assignMemberRole(
              actor,
              {
                organizationId,
                memberUserId,
                role: assignRoleSchema.parse(await readJsonBody(request)).role,
              },
              context
            )
          )
        }
        if (action === "custom-role") {
          return send(
            200,
            await container.commands.assignMemberCustomRole(
              actor,
              {
                organizationId,
                memberUserId,
                customRoleId: assignCustomRoleSchema.parse(await readJsonBody(request))
                  .customRoleId,
              },
              context
            )
          )
        }
        if (action === "module-access") {
          return send(
            200,
            await container.commands.setMemberModuleAccess(
              actor,
              {
                organizationId,
                memberUserId,
                revoked: setMemberModuleAccessSchema.parse(await readJsonBody(request)).revoked,
              },
              context
            )
          )
        }
        if (action === "profile") {
          return send(
            200,
            await container.commands.updateMemberProfile(
              actor,
              {
                organizationId,
                memberUserId,
                profile: updateMemberProfileSchema.parse(await readJsonBody(request)).profile,
              },
              context
            )
          )
        }
      }

      if (method === "POST" && url.pathname === "/v1/workspaces") {
        return send(
          201,
          await container.commands.createWorkspace(
            actor,
            createWorkspaceSchema.parse(await readJsonBody(request)),
            context
          )
        )
      }

      if (method === "GET" && url.pathname === "/v1/workspaces") {
        return send(200, { items: await container.queries.listWorkspaces(actor) })
      }

      if (method === "POST" && url.pathname === "/v1/workspaces/switch") {
        return send(
          200,
          await container.commands.switchWorkspace(
            actor,
            switchWorkspaceSchema.parse(await readJsonBody(request)),
            context
          )
        )
      }

      const workspaceArchiveMatch = url.pathname.match(/^\/v1\/workspaces\/([^/]+)\/archive$/)
      if (method === "POST" && workspaceArchiveMatch) {
        const result = await container.commands.archiveWorkspace(
          actor,
          { workspaceId: workspaceArchiveMatch[1] },
          context
        )
        // archiveWorkspace already verified membership/authorization for this
        // workspace's organization -- scope the cascade actor to it, since it
        // may differ from the actor's active session organization.
        const archiveCascadeActor = { ...actor, organizationId: result.organizationId }
        await runConnectionCascade(() =>
          googleOAuthService?.pauseConnectionsForWorkspace(
            archiveCascadeActor,
            workspaceArchiveMatch[1]
          )
        )
        for (const provider of container.infrastructure.integrations?.list() ?? []) {
          await runConnectionCascade(() =>
            provider.pauseAllForWorkspace?.(archiveCascadeActor, workspaceArchiveMatch[1])
          )
        }
        return send(200, result)
      }

      const workspaceRestoreMatch = url.pathname.match(/^\/v1\/workspaces\/([^/]+)\/restore$/)
      if (method === "POST" && workspaceRestoreMatch) {
        const result = await container.commands.restoreWorkspace(
          actor,
          { workspaceId: workspaceRestoreMatch[1] },
          context
        )
        const restoreCascadeActor = { ...actor, organizationId: result.organizationId }
        await runConnectionCascade(() =>
          googleOAuthService?.resumeConnectionsForWorkspace(
            restoreCascadeActor,
            workspaceRestoreMatch[1]
          )
        )
        for (const provider of container.infrastructure.integrations?.list() ?? []) {
          await runConnectionCascade(() =>
            provider.resumeAllForWorkspace?.(restoreCascadeActor, workspaceRestoreMatch[1])
          )
        }
        return send(200, result)
      }

      const workspaceMembersMatch = url.pathname.match(/^\/v1\/workspaces\/([^/]+)\/members$/)
      if (method === "GET" && workspaceMembersMatch) {
        return send(
          200,
          await container.queries.listWorkspaceMembers(actor, workspaceMembersMatch[1])
        )
      }

      const workspaceItemMatch = url.pathname.match(/^\/v1\/workspaces\/([^/]+)$/)
      if (workspaceItemMatch && method === "GET") {
        return send(200, await container.queries.getWorkspace(actor, workspaceItemMatch[1]))
      }
      if (workspaceItemMatch && method === "PATCH") {
        return send(
          200,
          await container.commands.updateWorkspace(
            actor,
            workspaceItemMatch[1],
            updateWorkspaceSchema.parse(await readJsonBody(request)),
            context
          )
        )
      }

      if (method === "GET" && url.pathname === "/v1/products") {
        if (!productsAggregationService) {
          return send(503, {
            code: "PRODUCTS_UNAVAILABLE",
            message: "Product aggregation is unavailable in memory mode.",
          })
        }

        return send(200, { items: await productsAggregationService.listProducts(actor) })
      }

      if (method === "GET" && url.pathname === "/v1/customers") {
        if (!customersAggregationService) {
          return send(503, {
            code: "CUSTOMERS_UNAVAILABLE",
            message: "Customer aggregation is unavailable in memory mode.",
          })
        }

        return send(200, { items: await customersAggregationService.listCustomers(actor) })
      }

      const customerDetailMatch = url.pathname.match(/^\/v1\/customers\/([^/]+)$/)
      if (method === "GET" && customerDetailMatch) {
        if (!customersAggregationService) {
          return send(503, {
            code: "CUSTOMERS_UNAVAILABLE",
            message: "Customer aggregation is unavailable in memory mode.",
          })
        }

        const customer = await customersAggregationService.getCustomer(
          actor,
          decodeURIComponent(customerDetailMatch[1])
        )
        if (!customer) {
          return send(404, { code: "CUSTOMER_NOT_FOUND", message: "Customer not found." })
        }

        return send(200, customer)
      }

      if (method === "GET" && url.pathname === "/v1/orders") {
        if (!ordersAggregationService) {
          return send(503, {
            code: "ORDERS_UNAVAILABLE",
            message: "Order aggregation is unavailable in memory mode.",
          })
        }

        const result = await ordersAggregationService.listOrders(actor, {
          startDate: url.searchParams.get("startDate") ?? undefined,
          endDate: url.searchParams.get("endDate") ?? undefined,
        })
        return send(200, result)
      }

      const orderDetailMatch = url.pathname.match(/^\/v1\/orders\/([^/]+)\/details$/)
      if (method === "GET" && orderDetailMatch) {
        if (!ordersAggregationService) {
          return send(503, {
            code: "ORDERS_UNAVAILABLE",
            message: "Order aggregation is unavailable in memory mode.",
          })
        }

        const orderId = decodeURIComponent(orderDetailMatch[1])
        const connectionRef = await ordersAggregationService.resolveOrderConnection(actor, orderId)
        if (!connectionRef) {
          return send(404, { code: "ORDER_NOT_FOUND", message: "Order not found." })
        }

        const provider = container.infrastructure.integrations?.find(connectionRef.platform)
        if (!provider || !provider.getOrderDetail) {
          return send(501, {
            code: "ORDER_DETAILS_UNSUPPORTED",
            message: "Detailed order line items aren't available for this platform yet.",
          })
        }

        const detail = await provider.getOrderDetail(actor, {
          connectionId: connectionRef.connectionId,
          orderId: connectionRef.entityId,
        })
        return send(200, detail)
      }

      if (method === "GET" && url.pathname === "/v1/stores") {
        if (!storesAggregationService) {
          return send(503, {
            code: "STORES_UNAVAILABLE",
            message: "Store aggregation is unavailable in memory mode.",
          })
        }

        return send(200, { items: await storesAggregationService.listStores(actor) })
      }

      if (method === "GET" && url.pathname === "/v1/campaigns") {
        if (!campaignService) {
          return send(503, {
            code: "CAMPAIGNS_UNAVAILABLE",
            message: "Campaigns are unavailable in memory mode.",
          })
        }
        if (!actor.modulePermissions.includes("campaigns:view")) {
          throw ERRORS.forbidden()
        }
        return send(200, {
          items: await campaignService.list(actor.organizationId, actor.workspaceId),
        })
      }

      if (method === "POST" && url.pathname === "/v1/campaigns") {
        if (!campaignService) {
          return send(503, {
            code: "CAMPAIGNS_UNAVAILABLE",
            message: "Campaigns are unavailable in memory mode.",
          })
        }
        if (!actor.modulePermissions.includes("campaigns:create")) {
          throw ERRORS.forbidden()
        }
        const payload = createNativeCampaignSchema.parse(await readJsonBody(request))
        return send(
          201,
          await campaignService.createNative(actor.organizationId, actor.workspaceId, {
            displayName: payload.displayName,
            objective: payload.objective ?? null,
            budgetCurrency: payload.budgetCurrency ?? null,
            budgetAmount: payload.budgetAmount ?? null,
            startDate: payload.startDate ?? null,
            endDate: payload.endDate ?? null,
          })
        )
      }

      if (method === "GET" && url.pathname === "/v1/campaigns/imported") {
        if (!campaignService) {
          return send(503, {
            code: "CAMPAIGNS_UNAVAILABLE",
            message: "Campaigns are unavailable in memory mode.",
          })
        }
        if (!actor.modulePermissions.includes("campaigns:view")) {
          throw ERRORS.forbidden()
        }
        const platform = url.searchParams.get("platform")
        return send(200, {
          items: await campaignService.listImported(
            actor.organizationId,
            (platform as Parameters<typeof campaignService.listImported>[1]) ?? undefined
          ),
        })
      }

      if (method === "POST" && url.pathname === "/v1/campaigns/sync") {
        if (!campaignService) {
          return send(503, {
            code: "CAMPAIGNS_UNAVAILABLE",
            message: "Campaigns are unavailable in memory mode.",
          })
        }
        if (!actor.modulePermissions.includes("campaigns:manage")) {
          throw ERRORS.forbidden()
        }
        const payload = importCampaignsSchema.parse(await readJsonBody(request))
        return send(200, await campaignService.importFromPlatform(actor.organizationId, payload))
      }

      if (method === "POST" && url.pathname === "/v1/campaigns/attribution/match-orders") {
        if (!orderAttributionService) {
          return send(503, {
            code: "CAMPAIGNS_UNAVAILABLE",
            message: "Campaigns are unavailable in memory mode.",
          })
        }
        if (!actor.modulePermissions.includes("campaigns:manage")) {
          throw ERRORS.forbidden()
        }
        const payload = matchOrdersSchema.parse(await readJsonBody(request))
        return send(
          200,
          await orderAttributionService.matchOrders(actor.organizationId, actor.workspaceId, {
            provider: payload.provider,
          })
        )
      }

      if (method === "GET" && url.pathname === "/v1/campaigns/performance/summary") {
        if (!campaignsPerformanceAggregationService) {
          return send(503, {
            code: "CAMPAIGNS_PERFORMANCE_UNAVAILABLE",
            message: "Campaign performance is unavailable in memory mode.",
          })
        }
        if (!actor.modulePermissions.includes("campaigns:view")) {
          throw ERRORS.forbidden()
        }
        return send(
          200,
          await campaignsPerformanceAggregationService.getSummary(actor, parsePerformanceQuery(url))
        )
      }

      if (method === "GET" && url.pathname === "/v1/campaigns/performance/platforms") {
        if (!campaignsPerformanceAggregationService) {
          return send(503, {
            code: "CAMPAIGNS_PERFORMANCE_UNAVAILABLE",
            message: "Campaign performance is unavailable in memory mode.",
          })
        }
        if (!actor.modulePermissions.includes("campaigns:view")) {
          throw ERRORS.forbidden()
        }
        return send(200, {
          items: await campaignsPerformanceAggregationService.getPlatformBreakdown(
            actor,
            parsePerformanceQuery(url)
          ),
        })
      }

      if (method === "GET" && url.pathname === "/v1/campaigns/performance/campaigns") {
        if (!campaignsPerformanceAggregationService) {
          return send(503, {
            code: "CAMPAIGNS_PERFORMANCE_UNAVAILABLE",
            message: "Campaign performance is unavailable in memory mode.",
          })
        }
        if (!actor.modulePermissions.includes("campaigns:view")) {
          throw ERRORS.forbidden()
        }
        const page = Number(url.searchParams.get("page") ?? "1")
        const pageSize = Number(url.searchParams.get("pageSize") ?? "20")
        return send(
          200,
          await campaignsPerformanceAggregationService.listCampaigns(actor, {
            ...parsePerformanceQuery(url),
            page: Number.isFinite(page) ? page : 1,
            pageSize: Number.isFinite(pageSize) ? pageSize : 20,
          })
        )
      }

      if (method === "GET" && url.pathname === "/v1/campaigns/performance/ad-groups") {
        if (!campaignsPerformanceAggregationService) {
          return send(503, {
            code: "CAMPAIGNS_PERFORMANCE_UNAVAILABLE",
            message: "Campaign performance is unavailable in memory mode.",
          })
        }
        if (!actor.modulePermissions.includes("campaigns:view")) {
          throw ERRORS.forbidden()
        }
        const campaignId = url.searchParams.get("campaignId")
        if (!campaignId) {
          return send(400, {
            code: "CAMPAIGN_ID_REQUIRED",
            message: "campaignId is required.",
          })
        }
        return send(
          200,
          await campaignsPerformanceAggregationService.listAdGroups(
            actor,
            campaignId,
            parsePerformanceQuery(url)
          )
        )
      }

      if (
        method === "GET" &&
        (url.pathname === "/v1/campaigns/performance/ads" ||
          url.pathname === "/v1/campaigns/performance/keywords")
      ) {
        if (!campaignsPerformanceAggregationService) {
          return send(503, {
            code: "CAMPAIGNS_PERFORMANCE_UNAVAILABLE",
            message: "Campaign performance is unavailable in memory mode.",
          })
        }
        if (!actor.modulePermissions.includes("campaigns:view")) {
          throw ERRORS.forbidden()
        }
        const adGroupId = url.searchParams.get("adGroupId")
        if (!adGroupId) {
          return send(400, {
            code: "AD_GROUP_ID_REQUIRED",
            message: "adGroupId is required.",
          })
        }
        const level = url.pathname.endsWith("/keywords") ? "keywords" : "ads"
        return send(
          200,
          await campaignsPerformanceAggregationService.listAdsOrKeywords(
            actor,
            adGroupId,
            level,
            parsePerformanceQuery(url)
          )
        )
      }

      if (url.pathname === "/v1/campaign-links") {
        if (!campaignLinkService) {
          return send(503, {
            code: "CAMPAIGN_LINKS_UNAVAILABLE",
            message: "Campaign links are unavailable in memory mode.",
          })
        }

        if (method === "GET") {
          if (!actor.modulePermissions.includes("campaigns:view")) {
            throw ERRORS.forbidden()
          }
          return send(200, {
            items: await campaignLinkService.list(actor.organizationId, actor.workspaceId),
          })
        }

        if (method === "POST") {
          if (!actor.modulePermissions.includes("campaigns:create")) {
            throw ERRORS.forbidden()
          }
          const payload = createCampaignLinkSchema.parse(await readJsonBody(request))
          return send(
            201,
            await campaignLinkService.create(
              actor.organizationId,
              actor.workspaceId,
              actor.userId,
              {
                campaignId: payload.campaignId,
                name: payload.name,
                trackingType: payload.trackingType,
                destinationBaseUrl: payload.destinationBaseUrl,
                utmSource: payload.utmSource,
                utmMedium: payload.utmMedium,
                utmCampaign: payload.utmCampaign,
                utmContent: payload.utmContent ?? null,
                utmTerm: payload.utmTerm ?? null,
                adGroupName: payload.adGroupName ?? null,
                adName: payload.adName ?? null,
                platform: payload.platform ?? null,
                customParams: payload.customParams,
              }
            )
          )
        }
      }

      if (method === "POST" && url.pathname === "/v1/campaign-links/preview") {
        if (!campaignLinkService) {
          return send(503, {
            code: "CAMPAIGN_LINKS_UNAVAILABLE",
            message: "Campaign links are unavailable in memory mode.",
          })
        }
        if (!actor.modulePermissions.includes("campaigns:create")) {
          throw ERRORS.forbidden()
        }
        const payload = previewCampaignLinkSchema.parse(await readJsonBody(request))
        return send(
          200,
          campaignLinkService.preview({
            campaignId: payload.campaignId,
            name: payload.name,
            trackingType: payload.trackingType,
            destinationBaseUrl: payload.destinationBaseUrl,
            utmSource: payload.utmSource,
            utmMedium: payload.utmMedium,
            utmCampaign: payload.utmCampaign,
            utmContent: payload.utmContent ?? null,
            utmTerm: payload.utmTerm ?? null,
            adGroupName: payload.adGroupName ?? null,
            adName: payload.adName ?? null,
            platform: payload.platform ?? null,
            customParams: payload.customParams,
          })
        )
      }

      if (method === "GET" && url.pathname === "/v1/tracking/site-key") {
        if (!trackingService) {
          return send(503, {
            code: "TRACKING_UNAVAILABLE",
            message: "Tracking capture is unavailable in memory mode.",
          })
        }
        if (!actor.modulePermissions.includes("campaigns:view")) {
          throw ERRORS.forbidden()
        }
        return send(200, {
          siteKey: await trackingService.ensureSiteKey(actor.organizationId),
          snippetUrl: `${container.config.shortLinkBaseUrl}/v1/tracking/snippet.js`,
        })
      }

      if (method === "GET" && url.pathname === "/v1/campaign-links/summary") {
        if (!aggregationService) {
          return send(503, {
            code: "CAMPAIGN_LINKS_UNAVAILABLE",
            message: "Campaign links are unavailable in memory mode.",
          })
        }
        if (!actor.modulePermissions.includes("campaigns:view")) {
          throw ERRORS.forbidden()
        }
        return send(200, {
          items: await aggregationService.getCampaignLinksSummary(
            actor.organizationId,
            actor.workspaceId,
            {
              startDate: url.searchParams.get("startDate") ?? undefined,
              endDate: url.searchParams.get("endDate") ?? undefined,
            }
          ),
        })
      }

      if (method === "POST" && url.pathname === "/v1/campaign-links/aggregate") {
        if (!aggregationService) {
          return send(503, {
            code: "CAMPAIGN_LINKS_UNAVAILABLE",
            message: "Campaign links are unavailable in memory mode.",
          })
        }
        if (!actor.modulePermissions.includes("campaigns:manage")) {
          throw ERRORS.forbidden()
        }
        const body = aggregateCampaignLinksSchema.parse(await readJsonBody(request))
        return send(
          200,
          await aggregationService.rollupDaily(actor.organizationId, body.metricDate)
        )
      }

      const campaignLinkAttributionMatch = url.pathname.match(
        /^\/v1\/campaign-links\/([^/]+)\/attribution$/
      )
      if (method === "GET" && campaignLinkAttributionMatch) {
        if (!aggregationService) {
          return send(503, {
            code: "CAMPAIGN_LINKS_UNAVAILABLE",
            message: "Campaign links are unavailable in memory mode.",
          })
        }
        if (!actor.modulePermissions.includes("campaigns:view")) {
          throw ERRORS.forbidden()
        }
        const linkId = decodeURIComponent(campaignLinkAttributionMatch[1])
        return send(
          200,
          await aggregationService.getLinkAttributionDetail(actor.organizationId, linkId)
        )
      }

      const campaignLinkMatch = url.pathname.match(/^\/v1\/campaign-links\/([^/]+)$/)
      if (campaignLinkMatch && (method === "GET" || method === "PATCH")) {
        if (!campaignLinkService) {
          return send(503, {
            code: "CAMPAIGN_LINKS_UNAVAILABLE",
            message: "Campaign links are unavailable in memory mode.",
          })
        }
        const linkId = decodeURIComponent(campaignLinkMatch[1])

        if (method === "GET") {
          if (!actor.modulePermissions.includes("campaigns:view")) {
            throw ERRORS.forbidden()
          }
          return send(200, await campaignLinkService.getById(actor.organizationId, linkId))
        }

        if (!actor.modulePermissions.includes("campaigns:edit")) {
          throw ERRORS.forbidden()
        }
        const payload = updateCampaignLinkSchema.parse(await readJsonBody(request))
        return send(
          200,
          await campaignLinkService.update(
            actor.organizationId,
            actor.workspaceId,
            actor.userId,
            linkId,
            payload
          )
        )
      }

      const campaignLinkEnableMatch = url.pathname.match(/^\/v1\/campaign-links\/([^/]+)\/enable$/)
      if (method === "POST" && campaignLinkEnableMatch) {
        if (!campaignLinkService) {
          return send(503, {
            code: "CAMPAIGN_LINKS_UNAVAILABLE",
            message: "Campaign links are unavailable in memory mode.",
          })
        }
        if (!actor.modulePermissions.includes("campaigns:manage")) {
          throw ERRORS.forbidden()
        }
        const linkId = decodeURIComponent(campaignLinkEnableMatch[1])
        return send(
          200,
          await campaignLinkService.setEnabled(
            actor.organizationId,
            actor.workspaceId,
            actor.userId,
            linkId,
            true
          )
        )
      }

      const campaignLinkDisableMatch = url.pathname.match(
        /^\/v1\/campaign-links\/([^/]+)\/disable$/
      )
      if (method === "POST" && campaignLinkDisableMatch) {
        if (!campaignLinkService) {
          return send(503, {
            code: "CAMPAIGN_LINKS_UNAVAILABLE",
            message: "Campaign links are unavailable in memory mode.",
          })
        }
        if (!actor.modulePermissions.includes("campaigns:manage")) {
          throw ERRORS.forbidden()
        }
        const linkId = decodeURIComponent(campaignLinkDisableMatch[1])
        return send(
          200,
          await campaignLinkService.setEnabled(
            actor.organizationId,
            actor.workspaceId,
            actor.userId,
            linkId,
            false
          )
        )
      }

      const campaignLinkArchiveMatch = url.pathname.match(
        /^\/v1\/campaign-links\/([^/]+)\/archive$/
      )
      if (method === "POST" && campaignLinkArchiveMatch) {
        if (!campaignLinkService) {
          return send(503, {
            code: "CAMPAIGN_LINKS_UNAVAILABLE",
            message: "Campaign links are unavailable in memory mode.",
          })
        }
        if (!actor.modulePermissions.includes("campaigns:delete")) {
          throw ERRORS.forbidden()
        }
        const linkId = decodeURIComponent(campaignLinkArchiveMatch[1])
        await campaignLinkService.archive(
          actor.organizationId,
          actor.workspaceId,
          actor.userId,
          linkId
        )
        return send(200, { archived: true })
      }

      if (url.pathname === "/v1/pos/roles") {
        if (!posService) {
          return send(503, {
            code: "POS_UNAVAILABLE",
            message: "POS is unavailable in memory mode.",
          })
        }
        if (!actor.modulePermissions.includes("pos:view")) {
          throw ERRORS.forbidden()
        }

        if (method === "GET") {
          return send(200, { items: await posService.listRoles(actor.organizationId) })
        }

        if (method === "POST") {
          if (!actor.modulePermissions.includes("pos:manage")) {
            throw ERRORS.forbidden()
          }
          const payload = posCreateRoleSchema.parse(await readJsonBody(request))
          return send(201, await posService.createRole(actor.organizationId, payload))
        }
      }

      const posRoleMatch = url.pathname.match(/^\/v1\/pos\/roles\/([^/]+)$/)
      if (posRoleMatch && (method === "PATCH" || method === "DELETE")) {
        if (!posService) {
          return send(503, {
            code: "POS_UNAVAILABLE",
            message: "POS is unavailable in memory mode.",
          })
        }
        if (!actor.modulePermissions.includes("pos:manage")) {
          throw ERRORS.forbidden()
        }
        const roleId = decodeURIComponent(posRoleMatch[1])

        if (method === "PATCH") {
          const payload = posUpdateRoleSchema.parse(await readJsonBody(request))
          return send(200, await posService.updateRole(actor.organizationId, roleId, payload))
        }

        await posService.deleteRole(actor.organizationId, roleId)
        return send(200, { deleted: true })
      }

      if (url.pathname === "/v1/pos/employees") {
        if (!posService) {
          return send(503, {
            code: "POS_UNAVAILABLE",
            message: "POS is unavailable in memory mode.",
          })
        }
        if (!actor.modulePermissions.includes("pos:view")) {
          throw ERRORS.forbidden()
        }

        if (method === "GET") {
          return send(200, { items: await posService.listEmployees(actor.organizationId) })
        }

        if (method === "POST") {
          if (!actor.modulePermissions.includes("pos:manage")) {
            throw ERRORS.forbidden()
          }
          const payload = posCreateEmployeeSchema.parse(await readJsonBody(request))
          return send(
            201,
            await posService.createEmployee(actor.organizationId, {
              fullName: payload.fullName,
              email: payload.email,
              password: payload.password,
              posRoleId: payload.posRoleId ?? null,
            })
          )
        }
      }

      const posEmployeeMatch = url.pathname.match(/^\/v1\/pos\/employees\/([^/]+)$/)
      if (method === "PATCH" && posEmployeeMatch) {
        if (!posService) {
          return send(503, {
            code: "POS_UNAVAILABLE",
            message: "POS is unavailable in memory mode.",
          })
        }
        if (!actor.modulePermissions.includes("pos:manage")) {
          throw ERRORS.forbidden()
        }
        const employeeId = decodeURIComponent(posEmployeeMatch[1])
        const payload = posUpdateEmployeeSchema.parse(await readJsonBody(request))
        return send(200, await posService.updateEmployee(actor.organizationId, employeeId, payload))
      }

      if (method === "GET" && url.pathname === "/v1/audit-logs") {
        return send(200, {
          items: await container.queries.getAuditLogs(actor, {
            page: parsePage(url.searchParams.get("page"), 1),
            pageSize: Math.min(parsePage(url.searchParams.get("pageSize"), 20), 100),
          }),
        })
      }

      return send(404, { code: "NOT_FOUND", message: "Endpoint not found." })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return send(400, {
          code: "VALIDATION_ERROR",
          category: "validation",
          message: "Request validation failed.",
          details: mapZodError(error),
        })
      }

      const mapped = mapIdentityError(error)
      if (mapped.status >= 500) {
        logAuthFailure({
          error,
          requestId: context.requestId,
          correlationId: context.correlationId,
          endpoint: url.pathname,
          method,
        })
      }
      return send(mapped.status, mapped.body)
    }
  })
}

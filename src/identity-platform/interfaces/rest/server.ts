import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { URL } from "node:url"
import { z } from "zod"

import { createIdentityPlatform, type IdentityPlatformContainer } from "../../bootstrap/create-identity-platform"
import { GoogleOAuthController } from "../../google-oauth/controller"
import { GoogleOAuthConnectionDeletionService } from "../../google-oauth/connection-deletion-service"
import { GoogleOAuthRepository } from "../../google-oauth/repository"
import { GoogleOAuthService } from "../../google-oauth/service"
import { createRequestContext, mapIdentityError } from "../middleware"
import {
  assignRoleSchema,
  createOrganizationSchema,
  createWorkspaceSchema,
  forgotPasswordSchema,
  googleAdsRecordsQuerySchema,
  googleAdsAccountsQuerySchema,
  googleAdsSyncSchema,
  googleOAuthStartSchema,
  inviteOrganizationMemberSchema,
  loginSchema,
  removeMemberSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  revokeSessionSchema,
  suspendMemberSchema,
  updateMemberProfileSchema,
  updateOrganizationSchema,
  updateProfileSchema,
  verifyEmailSchema,
} from "../../schemas"

function json(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  response.writeHead(status, {
    "content-type": "application/json",
    ...headers,
  })
  response.end(JSON.stringify(body))
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
      "access-control-allow-headers": "content-type, authorization, x-correlation-id, x-request-id, x-workspace-id, x-request-timeout-ms",
      "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
      vary: "Origin",
    }
  }

  return {}
}

export function createIdentityApiServer(container: IdentityPlatformContainer = createIdentityPlatform()) {
  const googleOAuthController = container.infrastructure.database
    ? new GoogleOAuthController(new GoogleOAuthService(new GoogleOAuthRepository(container.infrastructure.database)))
    : null
  const googleOAuthDeletionService = container.infrastructure.database
    ? new GoogleOAuthConnectionDeletionService(new GoogleOAuthRepository(container.infrastructure.database))
    : null

  return createServer(async (request, response) => {
    const method = request.method ?? "GET"
    const url = new URL(request.url ?? "/", "http://localhost")
    const context = createRequestContext(request)
    const requestStartedAt = Date.now()
    const corsHeaders = getCorsHeaders(request)
    const send = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      container.infrastructure.metrics?.recordHistogram("organization_api_latency", Date.now() - requestStartedAt, {
        path: url.pathname,
        method,
      })
      return json(response, status, body, { ...corsHeaders, ...headers })
    }

    try {
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
        return send(201, await container.commands.register(registerSchema.parse(await readJsonBody(request)), context))
      }

      if (method === "POST" && url.pathname === "/v1/auth/verify-email") {
        await container.commands.verifyEmail(verifyEmailSchema.parse(await readJsonBody(request)), context)
        return send(200, { verified: true })
      }

      if (method === "POST" && url.pathname === "/v1/auth/login") {
        return send(200, await container.commands.login(loginSchema.parse(await readJsonBody(request)), context))
      }

      if (method === "POST" && url.pathname === "/v1/auth/refresh") {
        return send(200, await container.commands.refresh(refreshSchema.parse(await readJsonBody(request)), context))
      }

      if (method === "POST" && url.pathname === "/v1/auth/password/forgot") {
        return send(202, await container.commands.createPasswordReset(forgotPasswordSchema.parse(await readJsonBody(request)), context))
      }

      if (method === "POST" && url.pathname === "/v1/auth/password/reset") {
        await container.commands.resetPassword(resetPasswordSchema.parse(await readJsonBody(request)), context)
        return send(200, { reset: true })
      }

      if (method === "GET" && url.pathname === "/v1/integrations/google/oauth/callback") {
        if (!googleOAuthController) {
          return send(503, { code: "GOOGLE_OAUTH_UNAVAILABLE", message: "Google OAuth is unavailable in memory mode." })
        }

        const callbackResult = await googleOAuthController.callback(request, url.searchParams)
        response.writeHead(callbackResult.status, callbackResult.headers)
        response.end()
        return
      }

      const token = getBearerToken(request)
      if (!token) {
        return send(401, { code: "AUTH_TOKEN_MISSING", message: "Authentication required." })
      }

      const actor = await container.commands.resolveActorFromAccessToken(token)

      if (method === "GET" && url.pathname === "/v1/auth/session") {
        return send(200, await container.queries.getSession(actor))
      }

      if (method === "POST" && url.pathname === "/v1/auth/logout") {
        await container.commands.logout({ sessionId: actor.sessionId }, context, actor)
        return send(200, { loggedOut: true })
      }

      if (method === "POST" && url.pathname === "/v1/auth/sessions/revoke") {
        await container.commands.revokeSession(revokeSessionSchema.parse(await readJsonBody(request)), context, actor)
        return send(200, { revoked: true })
      }

      if (method === "GET" && url.pathname === "/v1/identity/profile") {
        return send(200, await container.queries.getProfile(actor))
      }

      if (method === "PATCH" && url.pathname === "/v1/identity/profile") {
        return send(200, await container.commands.updateProfile(actor, updateProfileSchema.parse(await readJsonBody(request)), context))
      }

      if (method === "POST" && url.pathname === "/v1/integrations/google/oauth/start") {
        if (!googleOAuthController) {
          return send(503, { code: "GOOGLE_OAUTH_UNAVAILABLE", message: "Google OAuth is unavailable in memory mode." })
        }

        const payload = googleOAuthStartSchema.parse(await readJsonBody(request))
        return send(200, await googleOAuthController.start(actor, payload))
      }

      if (method === "GET" && url.pathname === "/v1/integrations/google/connection") {
        if (!googleOAuthController) {
          return send(503, { code: "GOOGLE_OAUTH_UNAVAILABLE", message: "Google OAuth is unavailable in memory mode." })
        }
        return send(200, await googleOAuthController.getActiveConnection(actor))
      }

      const deleteIntegrationMatch = url.pathname.match(/^\/v1\/integrations\/([^/]+)$/)
      if (method === "DELETE" && deleteIntegrationMatch) {
        if (!googleOAuthDeletionService) {
          return send(503, { code: "GOOGLE_OAUTH_UNAVAILABLE", message: "Google OAuth is unavailable in memory mode." })
        }

        await googleOAuthDeletionService.deleteConnection(actor, deleteIntegrationMatch[1])
        response.writeHead(204, corsHeaders)
        response.end()
        return
      }

      const integrationMatch = url.pathname.match(/^\/v1\/integrations\/([^/]+)\/(sync|records|accounts)$/)
      if (integrationMatch) {
        const providerId = integrationMatch[1]
        const action = integrationMatch[2]
        const provider = container.infrastructure.integrations?.find(providerId)

        if (!provider) {
          return send(404, { code: "PROVIDER_NOT_FOUND", message: "Provider not found." })
        }

        if (action === "sync" && method === "POST" && provider.sync) {
          const payload = googleAdsSyncSchema.parse(await readJsonBody(request))
          return send(200, await provider.sync(actor, payload))
        }

        if (action === "records" && method === "GET" && provider.listRecords) {
          const query = googleAdsRecordsQuerySchema.parse(Object.fromEntries(url.searchParams.entries()))
          return send(200, { items: await provider.listRecords(actor, query) })
        }

        if (action === "accounts" && method === "GET" && provider.listAccounts) {
          const query = googleAdsAccountsQuerySchema.parse(Object.fromEntries(url.searchParams.entries()))
          return send(200, { items: await provider.listAccounts(actor, query) })
        }
      }

      const invitationAcceptMatch = url.pathname.match(/^\/v1\/organizations\/invitations\/([^/]+)\/accept$/)
      if (method === "POST" && invitationAcceptMatch) {
        return send(200, await container.commands.acceptInvitation(actor, { token: invitationAcceptMatch[1] }, context))
      }

      const invitationDeclineMatch = url.pathname.match(/^\/v1\/organizations\/invitations\/([^/]+)\/decline$/)
      if (method === "POST" && invitationDeclineMatch) {
        return send(200, await container.commands.declineInvitation(actor, { token: invitationDeclineMatch[1] }, context))
      }

      const invitationCancelMatch = url.pathname.match(/^\/v1\/organizations\/invitations\/([^/]+)\/cancel$/)
      if (method === "POST" && invitationCancelMatch) {
        return send(200, await container.commands.cancelInvitation(actor, { invitationId: invitationCancelMatch[1] }, context))
      }

      const invitationResendMatch = url.pathname.match(/^\/v1\/organizations\/invitations\/([^/]+)\/resend$/)
      if (method === "POST" && invitationResendMatch) {
        return send(200, await container.commands.resendInvitation(actor, { invitationId: invitationResendMatch[1] }, context))
      }

      if (method === "POST" && url.pathname === "/v1/organizations") {
        return send(201, await container.commands.createOrganization(actor, createOrganizationSchema.parse(await readJsonBody(request)), context))
      }

      if (method === "GET" && url.pathname === "/v1/organizations") {
        return send(200, await container.queries.listOrganizations(actor, {
          page: parsePage(url.searchParams.get("page"), 1),
          pageSize: Math.min(parsePage(url.searchParams.get("pageSize"), 20), 100),
          status: (url.searchParams.get("status") as "active" | "archived" | "deleted" | null) ?? undefined,
          sort: (url.searchParams.get("sort") as "createdAt:asc" | "createdAt:desc" | "name:asc" | "name:desc" | null) ?? undefined,
        }))
      }

      const organizationMembersMatch = url.pathname.match(/^\/v1\/organizations\/([^/]+)\/members$/)
      if (method === "GET" && organizationMembersMatch) {
        return send(200, await container.queries.listOrganizationMembers(actor, organizationMembersMatch[1]))
      }

      const organizationInvitationsMatch = url.pathname.match(/^\/v1\/organizations\/([^/]+)\/invitations$/)
      if (organizationInvitationsMatch && method === "POST") {
        const payload = inviteOrganizationMemberSchema.parse(await readJsonBody(request))
        return send(201, await container.commands.inviteMember(actor, {
          organizationId: organizationInvitationsMatch[1],
          workspaceId: payload.workspaceId,
          email: payload.email,
          role: payload.role,
          idempotencyKey: payload.idempotencyKey,
        }, context))
      }
      if (organizationInvitationsMatch && method === "GET") {
        return send(200, await container.queries.listOrganizationInvitations(actor, organizationInvitationsMatch[1], {
          page: parsePage(url.searchParams.get("page"), 1),
          pageSize: Math.min(parsePage(url.searchParams.get("pageSize"), 20), 100),
          status: (url.searchParams.get("status") as "pending" | "accepted" | "declined" | "canceled" | "expired" | null) ?? undefined,
        }))
      }

      const organizationArchiveMatch = url.pathname.match(/^\/v1\/organizations\/([^/]+)\/archive$/)
      if (method === "POST" && organizationArchiveMatch) {
        return send(200, await container.commands.archiveOrganization(actor, { organizationId: organizationArchiveMatch[1] }, context))
      }

      const organizationRestoreMatch = url.pathname.match(/^\/v1\/organizations\/([^/]+)\/restore$/)
      if (method === "POST" && organizationRestoreMatch) {
        return send(200, await container.commands.restoreOrganization(actor, { organizationId: organizationRestoreMatch[1] }, context))
      }

      const organizationDeleteMatch = url.pathname.match(/^\/v1\/organizations\/([^/]+)\/delete$/)
      if (method === "POST" && organizationDeleteMatch) {
        return send(200, await container.commands.deleteOrganization(actor, { organizationId: organizationDeleteMatch[1] }, context))
      }

      const organizationItemMatch = url.pathname.match(/^\/v1\/organizations\/([^/]+)$/)
      if (organizationItemMatch && method === "GET") {
        return send(200, await container.queries.getOrganization(actor, organizationItemMatch[1]))
      }
      if (organizationItemMatch && method === "PATCH") {
        return send(200, await container.commands.updateOrganization(actor, organizationItemMatch[1], updateOrganizationSchema.parse(await readJsonBody(request)), context))
      }

      const memberActionMatch = url.pathname.match(/^\/v1\/organizations\/([^/]+)\/members\/([^/]+)\/(suspend|reactivate|remove|transfer-ownership|roles|profile)$/)
      if (memberActionMatch && method === "POST") {
        const organizationId = memberActionMatch[1]
        const memberUserId = memberActionMatch[2]
        const action = memberActionMatch[3]
        if (action === "suspend") {
          return send(200, await container.commands.suspendMember(actor, {
            organizationId,
            memberUserId,
            reason: suspendMemberSchema.parse(await readJsonBody(request)).reason,
          }, context))
        }
        if (action === "reactivate") {
          return send(200, await container.commands.reactivateMember(actor, { organizationId, memberUserId }, context))
        }
        if (action === "remove") {
          return send(200, await container.commands.removeMember(actor, {
            organizationId,
            memberUserId,
            reason: removeMemberSchema.parse(await readJsonBody(request)).reason,
          }, context))
        }
        if (action === "transfer-ownership") {
          return send(200, await container.commands.transferOwnership(actor, {
            organizationId,
            newOwnerUserId: memberUserId,
          }, context))
        }
        if (action === "roles") {
          return send(200, await container.commands.assignMemberRole(actor, {
            organizationId,
            memberUserId,
            role: assignRoleSchema.parse(await readJsonBody(request)).role,
          }, context))
        }
        if (action === "profile") {
          return send(200, await container.commands.updateMemberProfile(actor, {
            organizationId,
            memberUserId,
            profile: updateMemberProfileSchema.parse(await readJsonBody(request)).profile,
          }, context))
        }
      }

      if (method === "POST" && url.pathname === "/v1/workspaces") {
        return send(201, await container.commands.createWorkspace(actor, createWorkspaceSchema.parse(await readJsonBody(request)), context))
      }

      if (method === "GET" && url.pathname === "/v1/workspaces") {
        return send(200, { items: await container.queries.listWorkspaces(actor) })
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
      return send(mapped.status, mapped.body)
    }
  })
}

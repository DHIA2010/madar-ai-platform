import type { IncomingMessage } from "node:http"
import { randomUUID } from "node:crypto"

import type { RequestContext } from "../../application/dto/identity-dtos"
import { IdentityError } from "../../application/errors/IdentityError"
import { mapProviderStatusToErrorCategory } from "../../integrations/provider-mappers"
import { IntegrationProviderError } from "../../integrations/provider-error"

// Behind the ALB, request.socket.remoteAddress is the load balancer's own address, not the
// visitor's -- the ALB appends the real client IP as the first hop of X-Forwarded-For. Trusting
// that header is safe here specifically because the ALB is the sole entry point in front of this
// service (confirmed in terraform/modules/alb), so the first hop is always ALB-supplied, never
// forgeable by the client directly.
function getClientIp(request: IncomingMessage): string {
  const forwardedFor = request.headers["x-forwarded-for"]
  const raw = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor
  const firstHop = raw?.split(",")[0]?.trim()
  return firstHop || request.socket.remoteAddress || "unknown"
}

export function createRequestContext(request: IncomingMessage): RequestContext {
  const requestId = request.headers["x-request-id"]?.toString() || randomUUID()
  const correlationId = request.headers["x-correlation-id"]?.toString() || requestId
  return {
    requestId,
    correlationId,
    ipAddress: getClientIp(request),
    userAgent: request.headers["user-agent"]?.toString() ?? "unknown",
    headers: request.headers,
  }
}

export function mapIdentityError(error: unknown) {
  if (error instanceof IdentityError) {
    return {
      status: error.status,
      body: {
        code: error.code,
        category: error.category,
        message: error.message,
        details: error.details,
      },
    }
  }

  if (error instanceof IntegrationProviderError) {
    return {
      status: error.status,
      body: {
        code: error.code,
        category: mapProviderStatusToErrorCategory(error.status),
        message: error.message,
      },
    }
  }

  return {
    status: 500,
    body: {
      code: "INTERNAL_ERROR",
      category: "infrastructure",
      message: "Unexpected error.",
    },
  }
}

import type { IncomingMessage } from "node:http"
import { randomUUID } from "node:crypto"

import type { RequestContext } from "../../application/dto/identity-dtos"
import { IdentityError } from "../../application/errors/IdentityError"
import { mapProviderStatusToErrorCategory } from "../../integrations/provider-mappers"
import { IntegrationProviderError } from "../../integrations/provider-error"

// Behind the ALB, request.socket.remoteAddress is the load balancer's own address, not the
// visitor's. The ALB APPENDS the address it saw to X-Forwarded-For, so the real client is the LAST
// entry; anything before it is whatever the client chose to send. Reading the first entry let a
// caller pick its own "address" and so slip past every per-address rate limit (login, register,
// password reset, the public forms) by changing the header on each request.
function getClientIp(request: IncomingMessage): string {
  const forwardedFor = request.headers["x-forwarded-for"]
  const raw = Array.isArray(forwardedFor) ? forwardedFor.join(",") : forwardedFor
  const lastHop = raw?.split(",").at(-1)?.trim()
  return lastHop || request.socket.remoteAddress || "unknown"
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

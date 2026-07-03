import type { IncomingMessage } from "node:http"
import { randomUUID } from "node:crypto"

import type { RequestContext } from "../../application/dto/identity-dtos"
import { IdentityError } from "../../application/errors/IdentityError"
import { GoogleAdsIntegrationError } from "../../google-ads/errors"

export function createRequestContext(request: IncomingMessage): RequestContext {
  const requestId = request.headers["x-request-id"]?.toString() || randomUUID()
  const correlationId = request.headers["x-correlation-id"]?.toString() || requestId
  return {
    requestId,
    correlationId,
    ipAddress: request.socket.remoteAddress ?? "unknown",
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

  if (error instanceof GoogleAdsIntegrationError) {
    return {
      status: error.status,
      body: {
        code: error.code,
        category: error.status >= 500 ? "infrastructure" : error.status === 400 ? "validation" : "business",
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

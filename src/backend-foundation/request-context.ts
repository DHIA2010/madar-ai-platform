import { randomUUID } from "node:crypto"
import type { IncomingMessage } from "node:http"

import type { FoundationLogger, RequestContext } from "./types"

class NoopLogger implements FoundationLogger {
  info() {}
  warn() {}
  error() {}
  debug() {}
}

function asSingleHeader(value: string | string[] | undefined) {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function parsePermissions(headerValue: string | null) {
  if (!headerValue) return []
  return headerValue
    .split(",")
    .map((permission) => permission.trim())
    .filter(Boolean)
}

export function createRequestContextFromHttp(request: IncomingMessage, logger: FoundationLogger = new NoopLogger()): RequestContext {
  const requestId = asSingleHeader(request.headers["x-request-id"]) ?? randomUUID()
  const correlationId = asSingleHeader(request.headers["x-correlation-id"]) ?? requestId

  return {
    requestId,
    correlationId,
    actor: {
      userId: asSingleHeader(request.headers["x-user-id"]),
      organizationId: asSingleHeader(request.headers["x-organization-id"]),
      workspaceId: asSingleHeader(request.headers["x-workspace-id"]),
      projectId: asSingleHeader(request.headers["x-project-id"]),
    },
    permissions: parsePermissions(asSingleHeader(request.headers["x-permissions"])),
    logger,
    transaction: null,
    ipAddress: request.socket.remoteAddress ?? "unknown",
    userAgent: asSingleHeader(request.headers["user-agent"]) ?? "unknown",
    headers: request.headers,
  }
}

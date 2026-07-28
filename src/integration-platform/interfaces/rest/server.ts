import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { URL } from "node:url"
import { z } from "zod"

import { createIntegrationPlatform } from "../../bootstrap/create-integration-platform"
import { INTEGRATION_ERRORS } from "../../application/errors/IntegrationPlatformError"
import { createConnectionSchema, oauthCallbackSchema, registerConnectorSchema, syncRequestSchema, webhookRegistrationSchema } from "../../schemas"

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" })
  response.end(JSON.stringify(body))
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}

function actorFromRequest(request: IncomingMessage) {
  return {
    userId: String(request.headers["x-user-id"] ?? "system"),
    sessionId: String(request.headers["x-session-id"] ?? "system"),
    organizationId: String(request.headers["x-organization-id"] ?? "system"),
    workspaceId: (request.headers["x-workspace-id"] as string | undefined) ?? null,
    roles: ["owner" as const],
  }
}

export function createIntegrationApiServer(platform = createIntegrationPlatform()) {
  return createServer(async (request, response) => {
    const method = request.method ?? "GET"
    const url = new URL(request.url ?? "/", "http://localhost")
    const integrations = platform.services.integrations

    try {
      if (method === "GET" && url.pathname === "/health") {
        return json(response, 200, { status: "ok", service: "integration-platform" })
      }

      if (method === "POST" && url.pathname === "/v1/connectors") {
        return json(response, 201, await integrations.registerConnector(actorFromRequest(request) as never, registerConnectorSchema.parse(await readJsonBody(request))))
      }

      const connectorCapabilitiesMatch = url.pathname.match(/^\/v1\/connectors\/([^/]+)\/capabilities$/)
      if (method === "GET" && connectorCapabilitiesMatch) {
        return json(response, 200, await integrations.getConnectorCapabilities(actorFromRequest(request) as never, connectorCapabilitiesMatch[1]))
      }

      const connectorHealthMatch = url.pathname.match(/^\/v1\/connectors\/([^/]+)\/health$/)
      if (method === "GET" && connectorHealthMatch) {
        return json(response, 200, await integrations.getConnectorHealth(actorFromRequest(request) as never, connectorHealthMatch[1]))
      }

      if (method === "POST" && url.pathname === "/v1/connections") {
        const body = createConnectionSchema.parse(await readJsonBody(request))
        return json(response, 201, await integrations.createConnection(actorFromRequest(request) as never, {
          connectorId: body.connectorId,
          workspaceId: body.workspaceId ?? null,
          projectId: body.projectId ?? null,
          metadata: body.metadata ?? {},
        }))
      }

      const connectionMatch = url.pathname.match(/^\/v1\/connections\/([^/]+)$/)
      if (method === "GET" && connectionMatch) {
        return json(response, 200, await integrations.getConnectorHealth(actorFromRequest(request) as never, connectionMatch[1]))
      }

      const connectionActionMatch = url.pathname.match(/^\/v1\/connections\/([^/]+)\/(disconnect|oauth\/start|sync|webhooks)$/)
      if (method === "POST" && connectionActionMatch) {
        const connectionId = connectionActionMatch[1]
        const action = connectionActionMatch[2]
        if (action === "disconnect") return json(response, 200, await integrations.disconnect(actorFromRequest(request) as never, connectionId))
        if (action === "oauth/start") return json(response, 200, await integrations.startOAuth(actorFromRequest(request) as never, connectionId))
        if (action === "sync") {
          const body = syncRequestSchema.parse({ ...(await readJsonBody(request) as Record<string, unknown>), connectionId })
          return json(response, 200, await integrations.requestSync(actorFromRequest(request) as never, body))
        }
        if (action === "webhooks") {
          const body = webhookRegistrationSchema.parse({ ...(await readJsonBody(request) as Record<string, unknown>), connectionId })
          return json(response, 201, await integrations.registerWebhook(actorFromRequest(request) as never, body))
        }
      }

      if (method === "POST" && url.pathname === "/v1/oauth/callback") {
        return json(response, 200, await integrations.completeOAuth(actorFromRequest(request) as never, oauthCallbackSchema.parse(await readJsonBody(request))))
      }

      const cancelMatch = url.pathname.match(/^\/v1\/sync-jobs\/([^/]+)\/cancel$/)
      if (method === "POST" && cancelMatch) {
        return json(response, 200, await integrations.cancelSync(actorFromRequest(request) as never, cancelMatch[1]))
      }

      return json(response, 404, { code: "unknown as NOT_FOUND", message: "Endpoint not found." })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return json(response, 400, { code: "VALIDATION_ERROR", category: "validation", message: "Request validation failed.", details: error.issues })
      }
      if (error instanceof Error && error.name === "IntegrationPlatformError") {
        const integrationError = error as unknown as { code: string; status?: number }
        return json(response, integrationError.status ?? 400, { code: integrationError.code, message: error.message })
      }
      return json(response, 500, { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : String(error) })
    }
  })
}

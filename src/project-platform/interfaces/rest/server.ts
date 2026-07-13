import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { z } from "zod"

import { createProjectPlatform } from "../../bootstrap/create-project-platform"
import { mapProjectError } from "../../errors"
import {
  createDataSourceSchema,
  createProjectSchema,
  projectInvitationSchema,
  projectMemberActionSchema,
  updateDataSourceSchema,
  updateProjectSchema,
} from "../../schemas"

type ProjectSort = "createdAt:asc" | "createdAt:desc" | "name:asc" | "name:desc"
type ProjectStatus = "active" | "archived" | "deleted"
type DataSourceStatus = "draft" | "enabled" | "disabled" | "archived" | "deleted"
type DataSourceType =
  | "google_ads"
  | "meta_ads"
  | "tiktok_ads"
  | "snapchat_ads"
  | "google_analytics_4"
  | "shopify"
  | "woocommerce"
  | "salla"
  | "zid"
  | "csv_import"
  | "rest_api"
  | "webhook"
  | "manual_upload"

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" })
  response.end(JSON.stringify(body))
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}

function parseListParam(value: string | null, fallback: number) {
  const parsed = Number(value ?? fallback)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function createProjectApiServer(platform = createProjectPlatform()) {
  return createServer(async (request, response) => {
    const method = request.method ?? "GET"
    const url = new URL(request.url ?? "/", "http://localhost")
    const projects = platform.services.projects

    const send = (status: number, body: unknown) => json(response, status, body)

    try {
      if (method === "GET" && url.pathname === "/health") {
        return send(200, { status: "ok", service: "project-platform" })
      }

      if (method === "POST" && url.pathname === "/v1/projects") {
        const body = createProjectSchema.parse(await readJsonBody(request))
        return send(201, await projects.createProject({ userId: "system", organizationId: body.organizationId, workspaceId: null, roles: ["owner"] } as never, body))
      }

      const projectList = method === "GET" && url.pathname === "/v1/projects"
      if (projectList) {
        return send(200, await projects.listProjects({ userId: "system", organizationId: url.searchParams.get("organizationId") ?? "system", workspaceId: null, roles: ["owner"] } as never, {
          organizationId: url.searchParams.get("organizationId") ?? undefined,
          workspaceId: url.searchParams.get("workspaceId") ?? undefined,
          status: (url.searchParams.get("status") as ProjectStatus | null) ?? undefined,
          page: parseListParam(url.searchParams.get("page"), 1),
          pageSize: Math.min(parseListParam(url.searchParams.get("pageSize"), 20), 100),
          sort: (url.searchParams.get("sort") as ProjectSort | null) ?? undefined,
        }))
      }

      const projectMatch = url.pathname.match(/^\/v1\/projects\/([^/]+)$/)
      if (projectMatch && method === "GET") {
        return send(200, await projects.getProject({ userId: "system", organizationId: "system", workspaceId: null, roles: ["owner"] } as never, projectMatch[1]))
      }
      if (projectMatch && method === "PATCH") {
        return send(200, await projects.updateProject({ userId: "system", organizationId: "system", workspaceId: null, roles: ["owner"] } as never, projectMatch[1], updateProjectSchema.parse(await readJsonBody(request))))
      }

      const archiveMatch = url.pathname.match(/^\/v1\/projects\/([^/]+)\/(archive|restore|delete)$/)
      if (archiveMatch && method === "POST") {
        const actor = { userId: "system", organizationId: "system", workspaceId: null, roles: ["owner"] }
        if (archiveMatch[2] === "archive") return send(200, await projects.archiveProject(actor as never, archiveMatch[1]))
        if (archiveMatch[2] === "restore") return send(200, await projects.restoreProject(actor as never, archiveMatch[1]))
        return send(200, await projects.deleteProject(actor as never, archiveMatch[1]))
      }

      const dataSourceList = url.pathname.match(/^\/v1\/projects\/([^/]+)\/data-sources$/)
      if (dataSourceList && method === "POST") {
        return send(201, await projects.createDataSource({ userId: "system", organizationId: "system", workspaceId: null, roles: ["owner"] } as never, {
          projectId: dataSourceList[1],
          ...createDataSourceSchema.parse(await readJsonBody(request)),
        }))
      }
      if (dataSourceList && method === "GET") {
        return send(200, await projects.listDataSources({ userId: "system", organizationId: "system", workspaceId: null, roles: ["owner"] } as never, {
          projectId: dataSourceList[1],
          status: (url.searchParams.get("status") as DataSourceStatus | null) ?? undefined,
          type: (url.searchParams.get("type") as DataSourceType | null) ?? undefined,
          page: parseListParam(url.searchParams.get("page"), 1),
          pageSize: Math.min(parseListParam(url.searchParams.get("pageSize"), 20), 100),
        }))
      }

      const dataSourceMatch = url.pathname.match(/^\/v1\/data-sources\/([^/]+)$/)
      if (dataSourceMatch && method === "PATCH") {
        return send(200, await projects.updateDataSource({ userId: "system", organizationId: "system", workspaceId: null, roles: ["owner"] } as never, dataSourceMatch[1], updateDataSourceSchema.parse(await readJsonBody(request))))
      }
      if (dataSourceMatch && method === "POST") {
        const action = url.searchParams.get("action")
        const actor = { userId: "system", organizationId: "system", workspaceId: null, roles: ["owner"] }
        if (action === "enable") return send(200, await projects.enableDataSource(actor as never, dataSourceMatch[1]))
        if (action === "disable") return send(200, await projects.disableDataSource(actor as never, dataSourceMatch[1]))
        if (action === "archive") return send(200, await projects.archiveDataSource(actor as never, dataSourceMatch[1]))
        if (action === "delete") return send(200, await projects.deleteDataSource(actor as never, dataSourceMatch[1]))
      }

      const inviteMatch = url.pathname.match(/^\/v1\/projects\/([^/]+)\/invitations$/)
      if (inviteMatch && method === "POST") {
        return send(201, await projects.inviteProjectMember({ userId: "system", organizationId: "system", workspaceId: null, roles: ["owner"] } as never, {
          projectId: inviteMatch[1],
          ...projectInvitationSchema.parse(await readJsonBody(request)),
        }))
      }
      if (inviteMatch && method === "GET") {
        return send(200, { items: [] })
      }

      const memberMatch = url.pathname.match(/^\/v1\/projects\/([^/]+)\/members\/([^/]+)\/(roles|suspend|remove)$/)
      if (memberMatch && method === "POST") {
        const body = projectMemberActionSchema.parse(await readJsonBody(request))
        const actor = { userId: "system", organizationId: "system", workspaceId: null, roles: ["owner"] }
        if (memberMatch[3] === "roles") return send(200, await projects.updateProjectMemberRole(actor as never, { projectId: memberMatch[1], userId: memberMatch[2], role: body.role ?? "viewer" }))
        if (memberMatch[3] === "suspend") return send(200, await projects.suspendProjectMember(actor as never, { projectId: memberMatch[1], userId: memberMatch[2], reason: body.reason ?? "suspended" }))
        return send(200, await projects.removeProjectMember(actor as never, { projectId: memberMatch[1], userId: memberMatch[2], reason: body.reason ?? "removed" }))
      }

      return send(404, { code: "NOT_FOUND", message: "Endpoint not found." })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return send(400, { code: "VALIDATION_ERROR", category: "validation", message: "Request validation failed.", details: error.issues })
      }
      const mapped = mapProjectError(error)
      return send(mapped.status, mapped.body)
    }
  })
}

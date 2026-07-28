// @vitest-environment node

import { describe, expect, it } from "vitest"

import { createBackendFoundation } from "../bootstrap/create-backend-foundation"
import { createRequestContextFromHttp } from "../request-context"

describe("backend foundation", () => {
  it("discovers and registers backend modules", async () => {
    const foundation = await createBackendFoundation(["identity", "project"])
    const modules = foundation.registry.list().map((entry) => entry.id)
    expect(modules).toEqual(["identity", "project"])
  })

  it("builds request context from request headers", async () => {
    const request = {
      headers: {
        "x-request-id": "req-1",
        "x-correlation-id": "corr-1",
        "x-user-id": "user-1",
        "x-organization-id": "org-1",
        "x-workspace-id": "ws-1",
        "x-project-id": "proj-1",
        "x-permissions": "org:read, org:write",
        "user-agent": "vitest",
      },
      socket: { remoteAddress: "127.0.0.1" },
    } as never

    const context = createRequestContextFromHttp(request)

    expect(context.requestId).toBe("req-1")
    expect(context.correlationId).toBe("corr-1")
    expect(context.actor).toEqual({
      userId: "user-1",
      organizationId: "org-1",
      workspaceId: "ws-1",
      projectId: "proj-1",
    })
    expect(context.permissions).toEqual(["org:read", "org:write"])
  })
})

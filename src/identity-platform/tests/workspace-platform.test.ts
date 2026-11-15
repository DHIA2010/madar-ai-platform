import { describe, expect, it } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import type { RequestContext } from "../types"

const context: RequestContext = {
  requestId: "request-workspace-1",
  correlationId: "correlation-workspace-1",
  ipAddress: "127.0.0.1",
  userAgent: "vitest",
  headers: {},
}

function createContainer() {
  return createIdentityPlatform({
    mode: "memory",
    config: {
      jwtSecret: "test-secret-test-secret",
      tokenHashSecret: "test-token-secret-secret",
      postgresUrl: "postgresql://unused",
      redisUrl: "redis://unused",
      storagePath: ".tmp-identity-tests",
      emailFrom: "identity@test.local",
    },
  })
}

async function registerAndLogin(
  container: ReturnType<typeof createIdentityPlatform>,
  email: string
) {
  const registration = await container.commands.register(
    {
      email,
      password: "VeryStrongPassword123!",
      fullName: email,
      organizationName: `Org ${email}`,
      timezone: "UTC",
      language: "en",
    },
    context
  )

  await container.commands.verifyEmail({ token: registration.verificationToken }, context)

  const login = await container.commands.login(
    {
      email,
      password: "VeryStrongPassword123!",
    },
    context
  )

  const actor = await container.commands.resolveActorFromAccessToken(login.session.accessToken)
  return { registration, login, actor }
}

describe("workspace platform", () => {
  it("creates a default workspace alongside a newly created organization", async () => {
    const container = createContainer()
    const owner = await registerAndLogin(container, "owner-workspace-default@madar.test")

    const organization = await container.commands.createOrganization(
      owner.actor,
      { name: "MADAR Retail" },
      context
    )

    const { items } = await container.queries.listOrganizations(owner.actor, {
      page: 1,
      pageSize: 20,
    })
    expect(items.some((entry) => entry.id === organization.id)).toBe(true)

    const workspaces = await container.queries.listWorkspaces(owner.actor)
    const defaultWorkspace = workspaces.find(
      (entry) => entry.workspace?.organizationId === organization.id
    )
    expect(defaultWorkspace).toBeTruthy()
    expect(defaultWorkspace?.workspace?.name).toBe("MADAR Retail - Default")
  })

  it("supports workspace lifecycle: get, update, archive, restore", async () => {
    const container = createContainer()
    const owner = await registerAndLogin(container, "owner-workspace-lifecycle@madar.test")

    const organization = await container.commands.createOrganization(
      owner.actor,
      { name: "MADAR Logistics" },
      context
    )

    const workspace = await container.commands.createWorkspace(
      owner.actor,
      { organizationId: organization.id, name: "Ops Workspace" },
      context
    )
    expect(workspace.status).toBe("active")

    const fetched = await container.queries.getWorkspace(owner.actor, workspace.id)
    expect(fetched.name).toBe("Ops Workspace")

    const updated = await container.commands.updateWorkspace(
      owner.actor,
      workspace.id,
      { name: "Ops Workspace Renamed" },
      context
    )
    expect(updated.name).toBe("Ops Workspace Renamed")

    const archived = await container.commands.archiveWorkspace(
      owner.actor,
      { workspaceId: workspace.id },
      context
    )
    expect(archived.status).toBe("archived")

    const restored = await container.commands.restoreWorkspace(
      owner.actor,
      { workspaceId: workspace.id },
      context
    )
    expect(restored.status).toBe("active")
  })

  it("lists workspace members and supports switching the active workspace", async () => {
    const container = createContainer()
    const owner = await registerAndLogin(container, "owner-workspace-members@madar.test")

    const organization = await container.commands.createOrganization(
      owner.actor,
      { name: "MADAR Analytics" },
      context
    )

    const workspace = await container.commands.createWorkspace(
      owner.actor,
      { organizationId: organization.id, name: "Analytics Workspace" },
      context
    )

    const members = await container.queries.listWorkspaceMembers(owner.actor, workspace.id)
    expect(members.members.some((entry) => entry.userId === owner.actor.userId)).toBe(true)

    const switched = await container.commands.switchWorkspace(
      owner.actor,
      { workspaceId: workspace.id },
      context
    )
    expect(switched.activeWorkspaceId).toBe(workspace.id)
  })

  it("answers each request for the workspace it names, not only the one remembered on the account", async () => {
    const container = createContainer()
    const owner = await registerAndLogin(container, "owner-per-request-workspace@madar.test")
    const token = owner.login.session.accessToken
    const first = {
      organizationId: owner.actor.organizationId,
      workspaceId: owner.actor.workspaceId,
    }

    const otherOrganization = await container.commands.createOrganization(
      owner.actor,
      { name: "Second Company" },
      context
    )
    const other = await container.commands.createWorkspace(
      owner.actor,
      { organizationId: otherOrganization.id, name: "Second Company Branch" },
      context
    )

    // Another tab (or device) switches the account to the second company...
    await container.commands.switchWorkspace(owner.actor, { workspaceId: other.id }, context)
    const followsAccount = await container.commands.resolveActorFromAccessToken(token)
    expect(followsAccount).toMatchObject({
      organizationId: otherOrganization.id,
      workspaceId: other.id,
    })

    // ...while a tab still open on the first one keeps being answered for the first one, instead
    // of having its workspace checked against the other company ("Workspace not found").
    const staleTab = await container.commands.resolveActorFromAccessToken(token, first.workspaceId)
    expect(staleTab).toMatchObject(first)

    // A workspace the person isn't a member of, or a malformed id, changes nothing.
    const stranger = await registerAndLogin(container, "stranger-workspace@madar.test")
    for (const requested of [stranger.actor.workspaceId, "not-a-workspace-id", null]) {
      const actor = await container.commands.resolveActorFromAccessToken(token, requested)
      expect(actor).toMatchObject({ organizationId: otherOrganization.id, workspaceId: other.id })
    }
  })
})

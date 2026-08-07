// @vitest-environment node

import type { AddressInfo } from "node:net"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createIdentityApiServer } from "../api"
import { IdentityPlatformService } from "../service"

describe("Identity API", () => {
  let server: ReturnType<typeof createIdentityApiServer>
  let baseUrl = ""

  beforeEach(async () => {
    server = createIdentityApiServer(
      new IdentityPlatformService({
        jwtSecret: "test-secret-test-secret",
        tokenHashSecret: "test-token-secret-secret",
        postgresUrl: "postgresql://unused",
        redisUrl: "redis://unused",
        storagePath: ".tmp-identity-tests",
        emailFrom: "identity@test.local",
      })
    )
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const address = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    if (!server) {
      return
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  })

  it("runs the core auth flow through REST endpoints", async () => {
    const registrationResponse = await fetch(`${baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "api@madar.test",
        password: "VeryStrongPassword123!",
        fullName: "API User",
        organizationName: "API Org",
      }),
    })

    expect(registrationResponse.status).toBe(201)
    const registration = await registrationResponse.json()

    const verifyResponse = await fetch(`${baseUrl}/v1/auth/verify-email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: registration.verificationToken }),
    })
    expect(verifyResponse.status).toBe(200)

    const loginResponse = await fetch(`${baseUrl}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "api@madar.test",
        password: "VeryStrongPassword123!",
      }),
    })

    expect(loginResponse.status).toBe(200)
    const login = await loginResponse.json()
    expect(login.session.accessToken).toBeTruthy()

    const profileResponse = await fetch(`${baseUrl}/v1/identity/profile`, {
      headers: {
        authorization: `Bearer ${login.session.accessToken}`,
      },
    })

    expect(profileResponse.status).toBe(200)
    const profile = await profileResponse.json()
    expect(profile.email).toBe("api@madar.test")
  })

  it("supports organization platform endpoints for invitations", async () => {
    const registerOwner = await fetch(`${baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "org-owner@madar.test",
        password: "VeryStrongPassword123!",
        fullName: "Org Owner",
        organizationName: "Seed Org",
      }),
    })
    const ownerRegistration = await registerOwner.json()
    await fetch(`${baseUrl}/v1/auth/verify-email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: ownerRegistration.verificationToken }),
    })

    const ownerLoginRes = await fetch(`${baseUrl}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "org-owner@madar.test", password: "VeryStrongPassword123!" }),
    })
    const ownerLogin = await ownerLoginRes.json()

    const createOrgRes = await fetch(`${baseUrl}/v1/organizations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerLogin.session.accessToken}`,
      },
      body: JSON.stringify({
        name: "Platform Org",
        timezone: "Asia/Riyadh",
        locale: "ar-SA",
        currency: "SAR",
      }),
    })
    expect(createOrgRes.status).toBe(201)
    const createdOrg = await createOrgRes.json()

    const inviteRes1 = await fetch(`${baseUrl}/v1/organizations/${createdOrg.id}/invitations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerLogin.session.accessToken}`,
      },
      body: JSON.stringify({
        email: "invitee@madar.test",
        role: "viewer",
        idempotencyKey: "idem-invite-1",
      }),
    })

    expect(inviteRes1.status).toBe(201)
    const invite1 = await inviteRes1.json()

    const inviteRes2 = await fetch(`${baseUrl}/v1/organizations/${createdOrg.id}/invitations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerLogin.session.accessToken}`,
      },
      body: JSON.stringify({
        email: "invitee@madar.test",
        role: "viewer",
        idempotencyKey: "idem-invite-1",
      }),
    })

    expect(inviteRes2.status).toBe(201)
    const invite2 = await inviteRes2.json()
    expect(invite1.id).toBe(invite2.id)
  })

  it("creates a team and lists it with the creator as manager and first member", async () => {
    const registerOwner = await fetch(`${baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "team-owner@madar.test",
        password: "VeryStrongPassword123!",
        fullName: "Team Owner",
        organizationName: "Team Org",
      }),
    })
    const ownerRegistration = await registerOwner.json()
    await fetch(`${baseUrl}/v1/auth/verify-email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: ownerRegistration.verificationToken }),
    })

    const ownerLoginRes = await fetch(`${baseUrl}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "team-owner@madar.test", password: "VeryStrongPassword123!" }),
    })
    const ownerLogin = await ownerLoginRes.json()

    const createOrgRes = await fetch(`${baseUrl}/v1/organizations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerLogin.session.accessToken}`,
      },
      body: JSON.stringify({
        name: "Teams Platform Org",
        timezone: "Asia/Riyadh",
        locale: "ar-SA",
        currency: "SAR",
      }),
    })
    const createdOrg = await createOrgRes.json()

    const createTeamRes = await fetch(`${baseUrl}/v1/organizations/${createdOrg.id}/teams`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerLogin.session.accessToken}`,
      },
      body: JSON.stringify({
        name: "Growth Marketing",
        description: "Handles paid and organic growth",
      }),
    })
    expect(createTeamRes.status).toBe(201)
    const createdTeam = await createTeamRes.json()
    expect(createdTeam.name).toBe("Growth Marketing")
    expect(typeof createdTeam.managerUserId).toBe("string")

    const listTeamsRes = await fetch(`${baseUrl}/v1/organizations/${createdOrg.id}/teams`, {
      headers: { authorization: `Bearer ${ownerLogin.session.accessToken}` },
    })
    expect(listTeamsRes.status).toBe(200)
    const listedTeams = await listTeamsRes.json()
    expect(listedTeams.items).toHaveLength(1)
    expect(listedTeams.items[0].name).toBe("Growth Marketing")
    expect(listedTeams.items[0].managerName).toBe("Team Owner")
    expect(listedTeams.items[0].memberCount).toBe(1)
  })

  it("lists system roles with real member counts and supports creating/editing a custom role", async () => {
    const registerOwner = await fetch(`${baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "role-owner@madar.test",
        password: "VeryStrongPassword123!",
        fullName: "Role Owner",
        organizationName: "Role Org",
      }),
    })
    const ownerRegistration = await registerOwner.json()
    await fetch(`${baseUrl}/v1/auth/verify-email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: ownerRegistration.verificationToken }),
    })

    const ownerLoginRes = await fetch(`${baseUrl}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "role-owner@madar.test", password: "VeryStrongPassword123!" }),
    })
    const ownerLogin = await ownerLoginRes.json()

    const createOrgRes = await fetch(`${baseUrl}/v1/organizations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerLogin.session.accessToken}`,
      },
      body: JSON.stringify({
        name: "Roles Platform Org",
        timezone: "Asia/Riyadh",
        locale: "ar-SA",
        currency: "SAR",
      }),
    })
    const createdOrg = await createOrgRes.json()

    const listBeforeRes = await fetch(`${baseUrl}/v1/organizations/${createdOrg.id}/roles`, {
      headers: { authorization: `Bearer ${ownerLogin.session.accessToken}` },
    })
    expect(listBeforeRes.status).toBe(200)
    const listedBefore = await listBeforeRes.json()
    const ownerRole = listedBefore.items.find((item: { id: string }) => item.id === "owner")
    expect(ownerRole).toBeTruthy()
    expect(ownerRole.userCount).toBe(1)
    expect(ownerRole.editable).toBe(false)
    expect(ownerRole.permissions.campaigns).toContain("publish")

    const createRoleRes = await fetch(`${baseUrl}/v1/organizations/${createdOrg.id}/roles`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerLogin.session.accessToken}`,
      },
      body: JSON.stringify({
        name: "RevOps",
        description: "Custom role for revenue operations",
        permissions: [
          { module: "campaigns", action: "view" },
          { module: "reports", action: "export" },
        ],
      }),
    })
    expect(createRoleRes.status).toBe(201)
    const createdRole = await createRoleRes.json()
    expect(createdRole.name).toBe("RevOps")
    expect(createdRole.permissions).toHaveLength(2)

    const updateRoleRes = await fetch(`${baseUrl}/v1/organizations/roles/${createdRole.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerLogin.session.accessToken}`,
      },
      body: JSON.stringify({
        permissions: [
          { module: "campaigns", action: "view" },
          { module: "campaigns", action: "edit" },
        ],
      }),
    })
    expect(updateRoleRes.status).toBe(200)

    const listAfterRes = await fetch(`${baseUrl}/v1/organizations/${createdOrg.id}/roles`, {
      headers: { authorization: `Bearer ${ownerLogin.session.accessToken}` },
    })
    const listedAfter = await listAfterRes.json()
    const customRole = listedAfter.items.find((item: { id: string }) => item.id === createdRole.id)
    expect(customRole).toBeTruthy()
    expect(customRole.editable).toBe(true)
    expect(customRole.permissions.campaigns).toEqual(expect.arrayContaining(["view", "edit"]))
    expect(customRole.permissions.campaigns).not.toContain("publish")
  })

  it("prevents revoking a session that belongs to a different organization", async () => {
    async function registerAndLogin(email: string, orgName: string) {
      const registerRes = await fetch(`${baseUrl}/v1/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password: "VeryStrongPassword123!",
          fullName: "Tenant Owner",
          organizationName: orgName,
        }),
      })
      const registration = await registerRes.json()
      await fetch(`${baseUrl}/v1/auth/verify-email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: registration.verificationToken }),
      })
      const loginRes = await fetch(`${baseUrl}/v1/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: "VeryStrongPassword123!" }),
      })
      return loginRes.json()
    }

    const tenantA = await registerAndLogin("tenant-a-owner@madar.test", "Tenant A")
    const tenantB = await registerAndLogin("tenant-b-owner@madar.test", "Tenant B")

    const tenantBSessionRes = await fetch(`${baseUrl}/v1/auth/session`, {
      headers: { authorization: `Bearer ${tenantB.session.accessToken}` },
    })
    const tenantBSession = await tenantBSessionRes.json()
    const tenantBSessionId = tenantBSession.currentSessionId

    // Tenant A's owner must not be able to revoke a session belonging to
    // tenant B, even though "owner" has session:revoke permission -- the
    // target session's organization must match the actor's own.
    const crossTenantRevoke = await fetch(`${baseUrl}/v1/auth/sessions/revoke`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tenantA.session.accessToken}`,
      },
      body: JSON.stringify({ sessionId: tenantBSessionId }),
    })
    expect(crossTenantRevoke.status).toBe(404)

    // Tenant B's session must still be usable after the rejected cross-tenant attempt.
    const stillValidRes = await fetch(`${baseUrl}/v1/identity/profile`, {
      headers: { authorization: `Bearer ${tenantB.session.accessToken}` },
    })
    expect(stillValidRes.status).toBe(200)

    // A user can always revoke their own session, regardless of role.
    const selfRevoke = await fetch(`${baseUrl}/v1/auth/sessions/revoke`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tenantB.session.accessToken}`,
      },
      body: JSON.stringify({ sessionId: tenantBSessionId }),
    })
    expect(selfRevoke.status).toBe(200)
  })
})

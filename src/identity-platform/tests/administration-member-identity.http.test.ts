// @vitest-environment node
//
// Covers three real admin-on-member capabilities that didn't exist before this change:
// - updateMemberIdentity: an admin editing another member's name (previously the only such
//   command always targeted the caller, never a target member).
// - sendMemberPasswordReset: an admin triggering the real forgot-password email/token flow for
//   another member (not a new "set password directly" mechanism).
// - createMemberDirect: adding a member without the invitation/accept round-trip, active
//   immediately with an admin-provided password.
// uploadMemberAvatar (name/avatar's other half) is covered separately by live verification
// against the real dev stack rather than here -- see the note further down.

import type { AddressInfo } from "node:net"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createIdentityApiServer } from "../api"
import { IdentityPlatformService } from "../service"

describe("Administration: member identity, admin password reset, direct add", () => {
  let server: ReturnType<typeof createIdentityApiServer>
  let baseUrl = ""

  beforeEach(async () => {
    const service = new IdentityPlatformService({
      jwtSecret: "test-secret-test-secret",
      tokenHashSecret: "test-token-secret-secret",
      postgresUrl: "postgresql://unused",
      redisUrl: "redis://unused",
      storagePath: ".tmp-identity-tests",
      emailFrom: "identity@test.local",
    })

    server = createIdentityApiServer(service)
    await new Promise<void>((resolve) => server.listen(0, resolve))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterEach(async () => {
    if (!server) return
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })

  function authHeaders(token: string) {
    return { "content-type": "application/json", authorization: `Bearer ${token}` }
  }

  async function registerVerifyLogin(email: string, orgName?: string, invitationToken?: string) {
    const registerRes = await fetch(`${baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        password: "VeryStrongPassword123!",
        fullName: email.split("@")[0],
        ...(orgName ? { organizationName: orgName } : {}),
        ...(invitationToken ? { invitationToken } : {}),
      }),
    })
    expect(registerRes.status).toBe(201)
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
    expect(loginRes.status).toBe(200)
    const login = await loginRes.json()

    return { organizationId: registration.organizationId as string, login }
  }

  async function setupOwnerAndAnalyst() {
    const owner = await registerVerifyLogin("identity-owner@madar.test", "Identity Org")

    const inviteRes = await fetch(
      `${baseUrl}/v1/organizations/${owner.organizationId}/invitations`,
      {
        method: "POST",
        headers: authHeaders(owner.login.session.accessToken),
        body: JSON.stringify({ email: "identity-analyst@madar.test", role: "analyst" }),
      }
    )
    expect(inviteRes.status).toBe(201)
    const invite = await inviteRes.json()

    const analyst = await registerVerifyLogin(
      "identity-analyst@madar.test",
      undefined,
      invite.token
    )
    expect(analyst.organizationId).toBe(owner.organizationId)

    return { owner, analyst }
  }

  async function getMember(organizationId: string, token: string, userId: string) {
    const response = await fetch(`${baseUrl}/v1/organizations/${organizationId}/members`, {
      headers: authHeaders(token),
    })
    const body = (await response.json()) as {
      members: Array<{ userId: string; fullName: string | null; avatarUrl: string | null }>
    }
    return body.members.find((member) => member.userId === userId)
  }

  it("lets an owner rename another member without touching the owner's own name", async () => {
    const { owner, analyst } = await setupOwnerAndAnalyst()

    const response = await fetch(
      `${baseUrl}/v1/organizations/${owner.organizationId}/members/${analyst.login.user.id}/identity`,
      {
        method: "POST",
        headers: authHeaders(owner.login.session.accessToken),
        body: JSON.stringify({ fullName: "Analyst Renamed" }),
      }
    )
    expect(response.status).toBe(200)

    const analystRow = await getMember(
      owner.organizationId,
      owner.login.session.accessToken,
      analyst.login.user.id
    )
    expect(analystRow?.fullName).toBe("Analyst Renamed")

    const ownerRow = await getMember(
      owner.organizationId,
      owner.login.session.accessToken,
      owner.login.user.id
    )
    expect(ownerRow?.fullName).not.toBe("Analyst Renamed")
  })

  it("forbids a member without org:write from renaming another member", async () => {
    const { owner, analyst } = await setupOwnerAndAnalyst()

    const response = await fetch(
      `${baseUrl}/v1/organizations/${owner.organizationId}/members/${owner.login.user.id}/identity`,
      {
        method: "POST",
        headers: authHeaders(analyst.login.session.accessToken),
        body: JSON.stringify({ fullName: "Hijacked Name" }),
      }
    )
    expect(response.status).toBe(403)
  })

  // uploadMemberAvatar mirrors the self-service uploadAvatar command exactly (both read
  // this.deps.objectStorage, bound once when IdentityCommandHandlers is constructed). The
  // in-memory DI mode this harness uses never passes an objectStorage into that construction
  // (only the real Postgres/S3 mode does), so neither this nor the pre-existing self-service
  // uploadAvatar command has ever been exercised via this HTTP-test harness -- poking
  // `container.infrastructure.objectStorage` after construction (the pattern the product-image
  // and org-logo tests use) doesn't apply here because those routes read
  // `container.infrastructure.objectStorage` directly at request time, not through a handler's
  // already-frozen deps. Covered instead by live verification against the real dev stack (real
  // Postgres + MinIO), consistent with this plan's verification section.

  it("triggers a real password-reset email/token for another member, which actually works", async () => {
    const { owner, analyst } = await setupOwnerAndAnalyst()

    const response = await fetch(
      `${baseUrl}/v1/organizations/${owner.organizationId}/members/${analyst.login.user.id}/password-reset`,
      { method: "POST", headers: authHeaders(owner.login.session.accessToken) }
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { accepted: boolean; resetToken?: string }
    expect(body.accepted).toBe(true)
    expect(body.resetToken).toBeTruthy()

    const resetRes = await fetch(`${baseUrl}/v1/auth/password/reset`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: body.resetToken, password: "BrandNewPassword456!" }),
    })
    expect(resetRes.status).toBe(200)

    const loginRes = await fetch(`${baseUrl}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "identity-analyst@madar.test",
        password: "BrandNewPassword456!",
      }),
    })
    expect(loginRes.status).toBe(200)
  })

  it("forbids a member without org:write from triggering another member's password reset", async () => {
    const { owner, analyst } = await setupOwnerAndAnalyst()

    const response = await fetch(
      `${baseUrl}/v1/organizations/${owner.organizationId}/members/${owner.login.user.id}/password-reset`,
      { method: "POST", headers: authHeaders(analyst.login.session.accessToken) }
    )
    expect(response.status).toBe(403)
  })

  it("creates a member directly, active immediately, no invitation/verification step", async () => {
    const owner = await registerVerifyLogin("direct-owner@madar.test", "Direct Org")

    const createRes = await fetch(`${baseUrl}/v1/organizations/${owner.organizationId}/members`, {
      method: "POST",
      headers: authHeaders(owner.login.session.accessToken),
      body: JSON.stringify({
        email: "direct-member@madar.test",
        fullName: "Direct Member",
        password: "DirectMemberPass123!",
      }),
    })
    expect(createRes.status).toBe(201)

    // No verification token, no invite acceptance -- the new member can log in immediately.
    const loginRes = await fetch(`${baseUrl}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "direct-member@madar.test",
        password: "DirectMemberPass123!",
      }),
    })
    expect(loginRes.status).toBe(200)
    const login = await loginRes.json()
    expect(login.user.status).toBe("active")

    const memberRow = await getMember(
      owner.organizationId,
      owner.login.session.accessToken,
      login.user.id
    )
    expect(memberRow?.fullName).toBe("Direct Member")
  })

  it("creates one user with a real membership per requested workspace, atomically", async () => {
    const owner = await registerVerifyLogin("multi-owner@madar.test", "Multi Org")

    const secondWorkspaceRes = await fetch(`${baseUrl}/v1/workspaces`, {
      method: "POST",
      headers: authHeaders(owner.login.session.accessToken),
      body: JSON.stringify({ organizationId: owner.organizationId, name: "Second Workspace" }),
    })
    expect(secondWorkspaceRes.status).toBe(201)
    const secondWorkspace = await secondWorkspaceRes.json()

    const firstWorkspaceId = owner.login.session.workspaceId

    const createRes = await fetch(`${baseUrl}/v1/organizations/${owner.organizationId}/members`, {
      method: "POST",
      headers: authHeaders(owner.login.session.accessToken),
      body: JSON.stringify({
        email: "multi-member@madar.test",
        fullName: "Multi Workspace Member",
        password: "MultiMemberPass123!",
        workspaceIds: [firstWorkspaceId, secondWorkspace.id],
      }),
    })
    expect(createRes.status).toBe(201)
    const created = await createRes.json()
    expect(created.memberships).toHaveLength(2)
    expect(created.memberships.map((m: { workspaceId: string }) => m.workspaceId).sort()).toEqual(
      [firstWorkspaceId, secondWorkspace.id].sort()
    )
    // Same user, not two separate accounts.
    expect(new Set(created.memberships.map((m: { userId: string }) => m.userId)).size).toBe(1)

    const rows = await fetch(`${baseUrl}/v1/organizations/${owner.organizationId}/members`, {
      headers: authHeaders(owner.login.session.accessToken),
    })
    const body = (await rows.json()) as {
      members: Array<{ userId: string; email: string; workspaceId: string | null }>
    }
    const memberRows = body.members.filter((m) => m.email === "multi-member@madar.test")
    expect(memberRows).toHaveLength(2)
    expect(memberRows.map((m) => m.workspaceId).sort()).toEqual(
      [firstWorkspaceId, secondWorkspace.id].sort()
    )
  })

  it("grants an existing member access to an additional workspace without touching their first one", async () => {
    const owner = await registerVerifyLogin("assign-owner@madar.test", "Assign Org")
    const firstWorkspaceId = owner.login.session.workspaceId

    const memberRes = await fetch(`${baseUrl}/v1/organizations/${owner.organizationId}/members`, {
      method: "POST",
      headers: authHeaders(owner.login.session.accessToken),
      body: JSON.stringify({
        email: "assign-member@madar.test",
        fullName: "Assign Member",
        password: "AssignMemberPass123!",
      }),
    })
    expect(memberRes.status).toBe(201)
    const member = await memberRes.json()
    const userId = member.user.id as string

    const secondWorkspaceRes = await fetch(`${baseUrl}/v1/workspaces`, {
      method: "POST",
      headers: authHeaders(owner.login.session.accessToken),
      body: JSON.stringify({ organizationId: owner.organizationId, name: "Second Branch" }),
    })
    expect(secondWorkspaceRes.status).toBe(201)
    const secondWorkspace = await secondWorkspaceRes.json()

    const assignRes = await fetch(
      `${baseUrl}/v1/organizations/${owner.organizationId}/members/${userId}/workspaces`,
      {
        method: "POST",
        headers: authHeaders(owner.login.session.accessToken),
        body: JSON.stringify({ workspaceIds: [secondWorkspace.id] }),
      }
    )
    expect(assignRes.status).toBe(200)
    const assigned = await assignRes.json()
    expect(assigned.memberships).toHaveLength(1)
    expect(assigned.memberships[0].workspaceId).toBe(secondWorkspace.id)
    expect(assigned.memberships[0].userId).toBe(userId)

    const rows = await fetch(`${baseUrl}/v1/organizations/${owner.organizationId}/members`, {
      headers: authHeaders(owner.login.session.accessToken),
    })
    const body = (await rows.json()) as {
      members: Array<{ userId: string; workspaceId: string | null }>
    }
    const memberRows = body.members.filter((m) => m.userId === userId)
    // Both the original membership (from direct-add) and the newly assigned one are present --
    // assigning a second branch never removes the first.
    expect(memberRows.map((m) => m.workspaceId).sort()).toEqual(
      [firstWorkspaceId, secondWorkspace.id].sort()
    )
  })

  it("is idempotent: re-assigning a workspace the user already belongs to does not error or duplicate", async () => {
    const owner = await registerVerifyLogin("idem-owner@madar.test", "Idem Org")
    const firstWorkspaceId = owner.login.session.workspaceId

    const memberRes = await fetch(`${baseUrl}/v1/organizations/${owner.organizationId}/members`, {
      method: "POST",
      headers: authHeaders(owner.login.session.accessToken),
      body: JSON.stringify({
        email: "idem-member@madar.test",
        fullName: "Idem Member",
        password: "IdemMemberPass123!",
      }),
    })
    const userId = (await memberRes.json()).user.id as string

    const reassignRes = await fetch(
      `${baseUrl}/v1/organizations/${owner.organizationId}/members/${userId}/workspaces`,
      {
        method: "POST",
        headers: authHeaders(owner.login.session.accessToken),
        body: JSON.stringify({ workspaceIds: [firstWorkspaceId] }),
      }
    )
    expect(reassignRes.status).toBe(200)
    const reassigned = await reassignRes.json()
    // Already a member of this workspace -- silently skipped, not duplicated or errored.
    expect(reassigned.memberships).toHaveLength(0)

    const rows = await fetch(`${baseUrl}/v1/organizations/${owner.organizationId}/members`, {
      headers: authHeaders(owner.login.session.accessToken),
    })
    const body = (await rows.json()) as { members: Array<{ userId: string }> }
    expect(body.members.filter((m) => m.userId === userId)).toHaveLength(1)
  })

  it("rejects assigning workspaces to a user who is not already a member of this organization", async () => {
    const owner = await registerVerifyLogin("stranger-owner@madar.test", "Stranger Org")
    const stranger = await registerVerifyLogin("stranger-user@madar.test", "Stranger Other Org")

    const assignRes = await fetch(
      `${baseUrl}/v1/organizations/${owner.organizationId}/members/${stranger.login.user.id}/workspaces`,
      {
        method: "POST",
        headers: authHeaders(owner.login.session.accessToken),
        body: JSON.stringify({ workspaceIds: [owner.login.session.workspaceId] }),
      }
    )
    expect(assignRes.status).toBe(404)
  })

  it("forbids a member without membership:write (and not owner/admin) from assigning workspaces", async () => {
    const { owner, analyst } = await setupOwnerAndAnalyst()

    const memberRes = await fetch(`${baseUrl}/v1/organizations/${owner.organizationId}/members`, {
      method: "POST",
      headers: authHeaders(owner.login.session.accessToken),
      body: JSON.stringify({
        email: "forbidden-target@madar.test",
        fullName: "Forbidden Target",
        password: "ForbiddenTargetPass123!",
      }),
    })
    const targetUserId = (await memberRes.json()).user.id as string

    const assignRes = await fetch(
      `${baseUrl}/v1/organizations/${owner.organizationId}/members/${targetUserId}/workspaces`,
      {
        method: "POST",
        headers: authHeaders(analyst.login.session.accessToken),
        body: JSON.stringify({ workspaceIds: [owner.login.session.workspaceId] }),
      }
    )
    expect(assignRes.status).toBe(403)
  })

  it("rejects direct-add when the email is already registered", async () => {
    const owner = await registerVerifyLogin("dup-owner@madar.test", "Dup Org")

    await registerVerifyLogin("dup-member@madar.test", "Someone Elses Org")

    const createRes = await fetch(`${baseUrl}/v1/organizations/${owner.organizationId}/members`, {
      method: "POST",
      headers: authHeaders(owner.login.session.accessToken),
      body: JSON.stringify({
        email: "dup-member@madar.test",
        fullName: "Duplicate",
        password: "AnotherPassword123!",
      }),
    })
    expect(createRes.status).toBe(409)
  })

  it("forbids a member without membership:write (and not owner/admin) from direct-adding", async () => {
    const { owner, analyst } = await setupOwnerAndAnalyst()

    const createRes = await fetch(`${baseUrl}/v1/organizations/${owner.organizationId}/members`, {
      method: "POST",
      headers: authHeaders(analyst.login.session.accessToken),
      body: JSON.stringify({
        email: "blocked-direct-add@madar.test",
        fullName: "Blocked",
        password: "BlockedPassword123!",
      }),
    })
    expect(createRes.status).toBe(403)
  })
})

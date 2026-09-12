// @vitest-environment node
//
// Covers the two real backend additions behind the Administration rebuild:
// GET /v1/organizations/:id/sessions (org-wide session listing, composed from real per-user
// session data rather than a new session-store index) and the actorUserId filter on
// GET /v1/audit-logs (real per-user activity for the user profile drawer).

import type { AddressInfo } from "node:net"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createIdentityApiServer } from "../api"
import { IdentityPlatformService } from "../service"

describe("Administration: org-wide sessions and per-actor audit filter", () => {
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

  // Sets up one real organization with two real members: an owner (session:revoke via the
  // "owner" role) and an analyst (invited, no session:revoke) -- via the real invite/accept flow
  // already proven in api.test.ts, not a fabricated direct-insert shortcut.
  async function setupOwnerAndAnalyst() {
    const owner = await registerVerifyLogin("sessions-owner@madar.test", "Sessions Org")

    const inviteRes = await fetch(
      `${baseUrl}/v1/organizations/${owner.organizationId}/invitations`,
      {
        method: "POST",
        headers: authHeaders(owner.login.session.accessToken),
        body: JSON.stringify({ email: "sessions-analyst@madar.test", role: "analyst" }),
      }
    )
    expect(inviteRes.status).toBe(201)
    const invite = await inviteRes.json()

    const analyst = await registerVerifyLogin(
      "sessions-analyst@madar.test",
      undefined,
      invite.token
    )
    expect(analyst.organizationId).toBe(owner.organizationId)

    return { owner, analyst }
  }

  it("lists every active member's real sessions org-wide, not just the caller's", async () => {
    const { owner, analyst } = await setupOwnerAndAnalyst()

    const response = await fetch(`${baseUrl}/v1/organizations/${owner.organizationId}/sessions`, {
      headers: authHeaders(owner.login.session.accessToken),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      items: Array<{ userId: string; fullName: string | null; email: string | null }>
    }

    const userIds = body.items.map((item) => item.userId)
    expect(userIds).toContain(owner.login.user.id)
    expect(userIds).toContain(analyst.login.user.id)

    const analystSession = body.items.find((item) => item.userId === analyst.login.user.id)
    expect(analystSession).toMatchObject({ email: "sessions-analyst@madar.test" })
  })

  it("forbids a member without session:revoke from viewing org-wide sessions", async () => {
    const { owner, analyst } = await setupOwnerAndAnalyst()

    const response = await fetch(`${baseUrl}/v1/organizations/${owner.organizationId}/sessions`, {
      headers: authHeaders(analyst.login.session.accessToken),
    })
    expect(response.status).toBe(403)
  })

  it("lets an admin terminate another member's session via the existing revoke endpoint", async () => {
    const { owner, analyst } = await setupOwnerAndAnalyst()

    const before = await fetch(`${baseUrl}/v1/organizations/${owner.organizationId}/sessions`, {
      headers: authHeaders(owner.login.session.accessToken),
    })
    const beforeBody = (await before.json()) as { items: Array<{ id: string; userId: string }> }
    const analystSessionId = beforeBody.items.find(
      (item) => item.userId === analyst.login.user.id
    )?.id
    expect(analystSessionId).toBeTruthy()

    const revokeRes = await fetch(`${baseUrl}/v1/auth/sessions/revoke`, {
      method: "POST",
      headers: authHeaders(owner.login.session.accessToken),
      body: JSON.stringify({ sessionId: analystSessionId }),
    })
    expect(revokeRes.status).toBe(200)

    const after = await fetch(`${baseUrl}/v1/organizations/${owner.organizationId}/sessions`, {
      headers: authHeaders(owner.login.session.accessToken),
    })
    const afterBody = (await after.json()) as { items: Array<{ userId: string }> }
    expect(afterBody.items.some((item) => item.userId === analyst.login.user.id)).toBe(false)
  })

  it("filters audit logs to one member's own real events via actorUserId", async () => {
    const { owner, analyst } = await setupOwnerAndAnalyst()

    const response = await fetch(`${baseUrl}/v1/audit-logs?actorUserId=${analyst.login.user.id}`, {
      headers: authHeaders(owner.login.session.accessToken),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      items: { data: Array<{ actorUserId: string | null; action: string }> }
    }
    expect(body.items.data.length).toBeGreaterThan(0)
    for (const entry of body.items.data) {
      expect(entry.actorUserId).toBe(analyst.login.user.id)
    }
    // The analyst's own real login is a real audited event -- not a fabricated fixture.
    expect(body.items.data.some((entry) => entry.action === "auth.login")).toBe(true)
  })
})

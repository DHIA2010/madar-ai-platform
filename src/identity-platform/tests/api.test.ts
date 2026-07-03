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
})

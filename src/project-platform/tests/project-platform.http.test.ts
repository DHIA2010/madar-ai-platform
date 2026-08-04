// @vitest-environment node

import type { AddressInfo } from "node:net"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createProjectApiServer } from "../interfaces/rest/server"
import { createProjectPlatform } from "../bootstrap/create-project-platform"

let platform: ReturnType<typeof createProjectPlatform>
let server: ReturnType<typeof createProjectApiServer>
let baseUrl = ""

async function registerAndLogin(email: string) {
  const registration = await platform.identity.commands.register(
    {
      email,
      password: "VeryStrongPassword123!",
      fullName: email,
      organizationName: `Org ${email}`,
      timezone: "UTC",
      language: "en",
    },
    {
      requestId: "req-1",
      correlationId: "corr-1",
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
      headers: {},
    }
  )
  await platform.identity.commands.verifyEmail(
    { token: registration.verificationToken },
    {
      requestId: "req-2",
      correlationId: "corr-2",
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
      headers: {},
    }
  )
  const login = await platform.identity.commands.login(
    { email, password: "VeryStrongPassword123!" },
    {
      requestId: "req-3",
      correlationId: "corr-3",
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
      headers: {},
    }
  )
  return login.session.accessToken
}

beforeEach(async () => {
  platform = createProjectPlatform({ mode: "memory" })
  server = createProjectApiServer(platform)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const address = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
})

describe("project platform http auth", () => {
  it("rejects requests with no Authorization header", async () => {
    const response = await fetch(`${baseUrl}/v1/projects`)
    expect(response.status).toBe(401)
  })

  it("rejects requests with an invalid bearer token", async () => {
    const response = await fetch(`${baseUrl}/v1/projects`, {
      headers: { authorization: "Bearer not-a-real-token" },
    })
    expect(response.status).toBe(401)
  })

  it("allows /health without authentication", async () => {
    const response = await fetch(`${baseUrl}/health`)
    expect(response.status).toBe(200)
  })

  it("resolves the real actor from the token and ignores a spoofed organizationId in the body", async () => {
    const token = await registerAndLogin("owner-project-http@madar.test")

    const otherOrgId = "11111111-1111-4111-8111-111111111111"
    const createResponse = await fetch(`${baseUrl}/v1/projects`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ organizationId: otherOrgId, name: "My Project" }),
    })
    expect(createResponse.status).toBe(201)
    const project = await createResponse.json()

    // The actor's real organizationId (from the verified session) must win over
    // whatever organizationId the client attempted to pass in the request body.
    expect(project.organizationId).not.toBe(otherOrgId)

    const getResponse = await fetch(`${baseUrl}/v1/projects/${project.id}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(getResponse.status).toBe(200)
  })

  it("does not allow one user to read another user's project", async () => {
    const ownerToken = await registerAndLogin("owner-project-isolation@madar.test")
    const otherToken = await registerAndLogin("other-project-isolation@madar.test")

    const createResponse = await fetch(`${baseUrl}/v1/projects`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ name: "Owner Only Project" }),
    })
    const project = await createResponse.json()

    const response = await fetch(`${baseUrl}/v1/projects/${project.id}`, {
      headers: { authorization: `Bearer ${otherToken}` },
    })
    expect(response.status).toBe(404)
  })
})

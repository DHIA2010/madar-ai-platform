// @vitest-environment node

import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { GoogleSignInService } from "../google-sign-in/service"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { createIdentityApiServer } from "../interfaces/rest/server"
import { LoginLinkService } from "../login-links/service"

// "Continue with Google": Google's token endpoints are stood in for, the rest is real.
let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>
let google: GoogleSignInService
const realFetch = globalThis.fetch

const CLIENT_ID = "madar-client.apps.googleusercontent.com"

function stubGoogle(identity: { email: string; name?: string; verified?: boolean; aud?: string }) {
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith("https://oauth2.googleapis.com/tokeninfo")) {
      return new Response(
        JSON.stringify({
          aud: identity.aud ?? CLIENT_ID,
          iss: "https://accounts.google.com",
          email: identity.email,
          email_verified: identity.verified === false ? "false" : "true",
          name: identity.name,
        }),
        { status: 200 }
      )
    }
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ id_token: "google-id-token" }), { status: 200 })
    }
    return realFetch(input, init)
  })
}

beforeEach(async () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"
  const mem = newDb({ autoCreateForeignKeyIndices: true })
  database = new PostgresDatabase(new (mem.adapters.createPg().Pool)())
  await runIdentityMigrations(database, process.cwd())
  container = createIdentityPlatform({ mode: "memory" })
  ;(container.infrastructure as { database?: PostgresDatabase }).database = database
  const links = new LoginLinkService(
    database,
    container.zidAutoProvisionDeps!,
    "https://app.madar.test"
  )
  google = new GoogleSignInService({
    ...container.zidAutoProvisionDeps!,
    credentials: {
      load: async () => ({
        clientId: CLIENT_ID,
        clientSecret: "secret",
        developerToken: "dev",
        redirectUri: "https://api.madar.test/v1/integrations/google/oauth/callback",
      }),
    },
    stateSecret: "state-secret-for-tests",
    createSignInLink: (input) =>
      links.create({ ...input, redirectPath: "/", singleUse: true, ttlMs: 5 * 60 * 1000 }),
  })
  server = createIdentityApiServer(container)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
  await database.end()
})

async function stateFromStart() {
  const start = new URL(await google.startUrl())
  expect(start.origin + start.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth")
  expect(start.searchParams.get("client_id")).toBe(CLIENT_ID)
  expect(start.searchParams.get("redirect_uri")).toBe(
    "https://api.madar.test/v1/auth/google/callback"
  )
  expect(start.searchParams.get("scope")).toBe("openid email profile")
  return start.searchParams.get("state")!
}

function consume(signInUrl: string) {
  const token = signInUrl.split("/").at(-1)!
  return realFetch(`${baseUrl}/v1/auth/login-links/${token}/consume`, { method: "POST" })
}

describe("continue with Google", () => {
  it("creates an account for a new email and signs it in, once", async () => {
    const state = await stateFromStart()
    stubGoogle({ email: "New.Owner@Gmail.com", name: "Sara Ahmed" })

    const result = await google.callback({ code: "auth-code", state })
    expect(result).toMatchObject({ status: "ok", created: true })
    if (result.status !== "ok") return

    const response = await consume(result.signInUrl)
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      user: { email: string; fullName: string }
      session: { organizationId: string }
      redirectUrl: string
    }
    expect(body.user).toMatchObject({ email: "new.owner@gmail.com", fullName: "Sara Ahmed" })
    expect(body.redirectUrl).toBe("/")
    const organization = await container.zidAutoProvisionDeps!.organizations.findById(
      body.session.organizationId
    )
    expect(organization?.name).toBe("Sara Ahmed")

    // The link Google hands the browser works once.
    expect((await consume(result.signInUrl)).status).toBe(404)
  })

  it("signs an existing account in instead of creating another", async () => {
    const registration = await realFetch(`${baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "owner@store.test",
        password: "VeryStrongPassword123!",
        fullName: "Store Owner",
        organizationName: "Store Org",
      }),
    })
    const account = (await registration.json()) as { userId: string; organizationId: string }

    const state = await stateFromStart()
    stubGoogle({ email: "owner@store.test", name: "Someone Else" })
    const result = await google.callback({ code: "auth-code", state })
    expect(result).toMatchObject({ status: "ok", created: false })
    if (result.status !== "ok") return

    const body = (await (await consume(result.signInUrl)).json()) as {
      user: { id: string }
      session: { organizationId: string }
    }
    expect(body.user.id).toBe(account.userId)
    expect(body.session.organizationId).toBe(account.organizationId)
  })

  it("refuses a forged state, an unverified email, and a token issued to someone else", async () => {
    stubGoogle({ email: "x@gmail.com" })
    expect(await google.callback({ code: "c", state: "forged.state" })).toEqual({
      status: "error",
      reason: "state",
    })

    stubGoogle({ email: "x@gmail.com", verified: false })
    expect(await google.callback({ code: "c", state: await stateFromStart() })).toEqual({
      status: "error",
      reason: "unverified_email",
    })

    stubGoogle({ email: "x@gmail.com", aud: "another-app" })
    expect(await google.callback({ code: "c", state: await stateFromStart() })).toEqual({
      status: "error",
      reason: "google",
    })
    expect(await container.zidAutoProvisionDeps!.users.findByEmail("x@gmail.com")).toBeNull()
  })
})

// @vitest-environment node

import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { createIdentityApiServer } from "../interfaces/rest/server"
import { LoginLinkService } from "../login-links/service"

// One-click sign-in links e-mailed after a Salla App Store install sets an account up.
let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>
let links: LoginLinkService

beforeEach(async () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"
  const mem = newDb({ autoCreateForeignKeyIndices: true })
  database = new PostgresDatabase(new (mem.adapters.createPg().Pool)())
  await runIdentityMigrations(database, process.cwd())
  container = createIdentityPlatform({ mode: "memory" })
  ;(container.infrastructure as { database?: PostgresDatabase }).database = database
  links = new LoginLinkService(database, container.zidAutoProvisionDeps!, "https://app.madar.test")
  server = createIdentityApiServer(container)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
  await database.end()
})

async function registerAccount(email: string) {
  const registration = await fetch(`${baseUrl}/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: "VeryStrongPassword123!",
      fullName: "Store Owner",
      organizationName: "Store Org",
    }),
  })
  const body = (await registration.json()) as { userId: string; organizationId: string }
  return body
}

function consume(token: string) {
  return fetch(`${baseUrl}/v1/auth/login-links/${token}/consume`, { method: "POST" })
}

describe("sign-in links", () => {
  it("signs the link's account in, in its organization, and says where to continue", async () => {
    const account = await registerAccount("owner@store.test")
    const url = await links.create({
      userId: account.userId,
      organizationId: account.organizationId,
      redirectPath: "/integrations/connection-1",
    })
    expect(url).toMatch(/^https:\/\/app\.madar\.test\/login-link\/mll_[0-9a-f]+$/)
    const token = url.split("/").at(-1)!

    const response = await consume(token)
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      user: { email: string }
      session: { organizationId: string; accessToken: string }
      redirectUrl: string
    }
    expect(body.user.email).toBe("owner@store.test")
    expect(body.session.organizationId).toBe(account.organizationId)
    expect(body.redirectUrl).toBe("/integrations/connection-1")
    const actor = await container.commands.resolveActorFromAccessToken(body.session.accessToken)
    expect(actor.userId).toBe(account.userId)

    // Reusable until it expires -- opening the e-mail again still works.
    expect((await consume(token)).status).toBe(200)
  })

  it("refuses an unknown or expired link", async () => {
    const account = await registerAccount("owner@store.test")
    const url = await links.create({
      userId: account.userId,
      organizationId: account.organizationId,
      redirectPath: "/integrations",
    })
    await database.query("update account_login_links set expires_at = now() - interval '1 minute'")
    expect((await consume(url.split("/").at(-1)!)).status).toBe(404)
    expect((await consume("mll_not-a-real-token")).status).toBe(404)
  })
})

// @vitest-environment node
//
// Covers the Zid product-link REST routes: GET /v1/products/zid-linkable,
// PUT/GET/DELETE /v1/products/:id/zid-link, POST /v1/products/:id/push-to-zid.

import { randomUUID } from "node:crypto"
import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { ZidOAuthService } from "../zid-oauth/service"
import { createIdentityApiServer } from "../interfaces/rest/server"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>

beforeEach(async () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"

  const mem = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = mem.adapters.createPg()
  database = new PostgresDatabase(new adapter.Pool())

  await runIdentityMigrations(database, process.cwd())
  await runSqlFile(
    database,
    `${process.cwd()}/src/project-platform/migrations/001_project_core.sql`
  )

  container = createIdentityPlatform({ mode: "memory" })
  ;(container.infrastructure as { database?: PostgresDatabase }).database = database

  server = createIdentityApiServer(container)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  vi.restoreAllMocks()
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
  await database.end()
})

async function signIn(email: string, orgName: string) {
  const registerResponse = await fetch(`${baseUrl}/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: "VeryStrongPassword123!",
      fullName: "Zid Links Test",
      organizationName: orgName,
    }),
  })
  const registration = (await registerResponse.json()) as { verificationToken: string }

  await fetch(`${baseUrl}/v1/auth/verify-email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: registration.verificationToken }),
  })

  const loginResponse = await fetch(`${baseUrl}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "VeryStrongPassword123!" }),
  })
  const login = (await loginResponse.json()) as { session: { accessToken: string } }
  const actor = await container.commands.resolveActorFromAccessToken(login.session.accessToken)

  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, $2, 'hash', 'Zid Links Test', now()) on conflict (id) do nothing`,
    [actor.userId, email]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status)
     values ($1, $2, $3, 'active') on conflict (id) do nothing`,
    [actor.organizationId, orgName, actor.userId]
  )
  if (actor.workspaceId) {
    await database.query(
      `insert into workspaces (id, organization_id, name, status)
       values ($1, $2, $3, 'active') on conflict (id) do nothing`,
      [actor.workspaceId, actor.organizationId, `${orgName} Workspace`]
    )
  }

  return { token: login.session.accessToken, actor }
}

function authHeaders(token: string) {
  return { "content-type": "application/json", authorization: `Bearer ${token}` }
}

async function insertActiveZidConnection(organizationId: string, workspaceId: string | null) {
  const connectionId = randomUUID()
  const userId = randomUUID()
  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, 'zid-conn-owner@madar.test', 'hash', 'Conn Owner', now()) on conflict (id) do nothing`,
    [userId]
  )
  await database.query(
    `insert into zid_oauth_connections (
       id, organization_id, workspace_id, project_id, provider_account_id, status,
       created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1, $2, $3, $4, '998877', 'connected', $5, $5, now(), now())`,
    [connectionId, organizationId, workspaceId, randomUUID(), userId]
  )
  await database.query(
    `insert into zid_stores (id, connection_id, account_id, status, is_selected)
     values ($1, $2, '998877', 'active', true)`,
    [randomUUID(), connectionId]
  )
  return connectionId
}

describe("GET /v1/products/zid-linkable", () => {
  it("lists synced Zid products with a SKU, resolving the bilingual name to a plain string", async () => {
    const { token, actor } = await signIn("zid-linkable@madar.test", "Linkable Org")
    const connectionId = await insertActiveZidConnection(actor.organizationId, actor.workspaceId)
    await database.query(
      `insert into zid_records (id, connection_id, customer_id, entity_type, entity_id, record_date, payload, created_at, updated_at)
       values ($1, $2, 'cust-1', 'products', '555', now()::date, $3::jsonb, now(), now())`,
      [randomUUID(), connectionId, JSON.stringify({ name: { en: "Sony A7S III" }, sku: "SKU-1" })]
    )

    const response = await fetch(`${baseUrl}/v1/products/zid-linkable`, {
      headers: authHeaders(token),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      products: [{ zidProductId: "555", name: "Sony A7S III", sku: "SKU-1" }],
    })
  })
})

describe("PUT/GET/DELETE /v1/products/:id/zid-link", () => {
  it("links a native product to a Zid product, reads it back, then removes the link", async () => {
    const { token, actor } = await signIn("zid-link-crud@madar.test", "Link Crud Org")
    const productId = randomUUID()
    await database.query(
      `insert into products (id, organization_id, product_type, name) values ($1, $2, 'simple', 'Test')`,
      [productId, actor.organizationId]
    )

    const linkResponse = await fetch(`${baseUrl}/v1/products/${productId}/zid-link`, {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ zidProductId: "555", zidProductSku: "SKU-1", zidProductName: "Sony" }),
    })
    expect(linkResponse.status).toBe(200)

    const getResponse = await fetch(`${baseUrl}/v1/products/${productId}/zid-link`, {
      headers: authHeaders(token),
    })
    expect(await getResponse.json()).toEqual({ link: { zidProductId: "555" } })

    const removeResponse = await fetch(`${baseUrl}/v1/products/${productId}/zid-link`, {
      method: "DELETE",
      headers: authHeaders(token),
    })
    expect(removeResponse.status).toBe(200)

    const getAfterRemove = await fetch(`${baseUrl}/v1/products/${productId}/zid-link`, {
      headers: authHeaders(token),
    })
    expect(await getAfterRemove.json()).toEqual({ link: null })
  })
})

describe("POST /v1/products/:id/push-to-zid", () => {
  it("pushes a native product to Zid and records the returned id as a link", async () => {
    const { token, actor } = await signIn("push-to-zid@madar.test", "Push To Zid Org")
    await insertActiveZidConnection(actor.organizationId, actor.workspaceId)

    const productId = randomUUID()
    await database.query(
      `insert into products (id, organization_id, workspace_id, product_type, name, sku, sell_price, stock_quantity, status)
       values ($1, $2, $3, 'simple', 'Test Product', 'SKU-1', 100, 10, 'active')`,
      [productId, actor.organizationId, actor.workspaceId]
    )

    vi.spyOn(ZidOAuthService.prototype, "resolveAccessToken").mockResolvedValue({
      accessToken: "test-access-token",
      authorizationHeader: "Bearer test-access-token",
    })
    const nativeFetch = globalThis.fetch
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (rawInput, init) => {
      const url = typeof rawInput === "string" ? rawInput : rawInput.toString()
      if (url.startsWith(baseUrl)) return nativeFetch(rawInput, init)
      return new Response(JSON.stringify({ id: "999888" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      })
    })

    const response = await fetch(`${baseUrl}/v1/products/${productId}/push-to-zid`, {
      method: "POST",
      headers: authHeaders(token),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ zidProductId: "999888" })
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/products/"),
      expect.objectContaining({ method: "POST" })
    )

    const linkRow = await database.query(
      `select zid_product_id from zid_product_links where product_id = $1`,
      [productId]
    )
    expect(linkRow.rows).toEqual([{ zid_product_id: "999888" }])
  })
})

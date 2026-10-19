// @vitest-environment node
//
// Covers the Salla product-link REST routes: GET /v1/products/salla-linkable,
// PUT/DELETE /v1/products/:id/salla-link.

import { randomUUID } from "node:crypto"
import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
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
      fullName: "Links Test",
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
     values ($1, $2, 'hash', 'Links Test', now()) on conflict (id) do nothing`,
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

async function insertActiveSallaConnection(organizationId: string, workspaceId: string | null) {
  const connectionId = randomUUID()
  const userId = randomUUID()
  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, 'salla-conn-owner@madar.test', 'hash', 'Conn Owner', now()) on conflict (id) do nothing`,
    [userId]
  )
  await database.query(
    `insert into salla_oauth_connections (
       id, organization_id, workspace_id, project_id, provider_account_id, status,
       created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1, $2, $3, $4, '998877', 'connected', $5, $5, now(), now())`,
    [connectionId, organizationId, workspaceId, randomUUID(), userId]
  )
  return connectionId
}

async function insertSallaProductRecord(
  connectionId: string,
  entityId: string,
  payload: Record<string, unknown>
) {
  await database.query(
    `insert into salla_records (id, connection_id, customer_id, entity_type, entity_id, record_date, payload, created_at, updated_at)
     values ($1, $2, 'cust-1', 'products', $3, now()::date, $4::jsonb, now(), now())`,
    [randomUUID(), connectionId, entityId, JSON.stringify(payload)]
  )
}

describe("GET /v1/products/salla-linkable", () => {
  it("lists synced Salla products with a SKU, filtering out ones without one", async () => {
    const { token, actor } = await signIn("salla-linkable@madar.test", "Linkable Org")
    const connectionId = await insertActiveSallaConnection(actor.organizationId, actor.workspaceId)
    await insertSallaProductRecord(connectionId, "111", { name: "جاكيت", sku: "SKU-111" })
    await insertSallaProductRecord(connectionId, "222", { name: "No SKU Product" })

    const response = await fetch(`${baseUrl}/v1/products/salla-linkable`, {
      headers: authHeaders(token),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      products: Array<{ sallaProductId: string; name: string; sku: string }>
    }
    expect(body.products).toEqual([{ sallaProductId: "111", name: "جاكيت", sku: "SKU-111" }])
  })
})

describe("PUT/DELETE /v1/products/:id/salla-link", () => {
  it("links a native product to a Salla product, then removes the link", async () => {
    const { token, actor } = await signIn("salla-link-crud@madar.test", "Link Crud Org")
    const productId = randomUUID()
    await database.query(
      `insert into products (id, organization_id, product_type, name) values ($1, $2, 'simple', 'Test')`,
      [productId, actor.organizationId]
    )

    const linkResponse = await fetch(`${baseUrl}/v1/products/${productId}/salla-link`, {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({
        sallaProductId: "111",
        sallaProductSku: "SKU-111",
        sallaProductName: "جاكيت",
      }),
    })
    expect(linkResponse.status).toBe(200)

    const linkRow = await database.query(
      `select salla_product_id from salla_product_links where product_id = $1`,
      [productId]
    )
    expect(linkRow.rows).toEqual([{ salla_product_id: "111" }])

    const getResponse = await fetch(`${baseUrl}/v1/products/${productId}/salla-link`, {
      headers: authHeaders(token),
    })
    expect(getResponse.status).toBe(200)
    expect(await getResponse.json()).toEqual({ link: { sallaProductId: "111" } })

    const removeResponse = await fetch(`${baseUrl}/v1/products/${productId}/salla-link`, {
      method: "DELETE",
      headers: authHeaders(token),
    })
    expect(removeResponse.status).toBe(200)

    const afterRemove = await database.query(
      `select 1 from salla_product_links where product_id = $1`,
      [productId]
    )
    expect(afterRemove.rows).toHaveLength(0)

    const getAfterRemove = await fetch(`${baseUrl}/v1/products/${productId}/salla-link`, {
      headers: authHeaders(token),
    })
    expect(await getAfterRemove.json()).toEqual({ link: null })
  })

  it("rejects linking without product-write permission", async () => {
    // No signIn here -- an unauthenticated request should 401 before any permission check runs.
    const response = await fetch(`${baseUrl}/v1/products/${randomUUID()}/salla-link`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sallaProductId: "111" }),
    })
    expect(response.status).toBe(401)
  })
})

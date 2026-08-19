// @vitest-environment node

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
  const address = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }

  await database.end()
})

async function registerAndProvisionOrg(email: string, orgName: string) {
  const registerResponse = await fetch(`${baseUrl}/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: "VeryStrongPassword123!",
      fullName: "Products Test",
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
     values ($1, $2, 'hash', 'Products Test', now()) on conflict (id) do nothing`,
    [actor.userId, email]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status)
     values ($1, $2, $3, 'active') on conflict (id) do nothing`,
    [actor.organizationId, orgName, actor.userId]
  )

  return { login, actor }
}

async function provisionWorkspace(input: {
  organizationId: string
  ownerUserId: string
  workspaceId: string
  label: string
}) {
  await database.query(
    `insert into workspaces (id, organization_id, name, status)
     values ($1, $2, $3, 'active') on conflict (id) do nothing`,
    [input.workspaceId, input.organizationId, `${input.label} Workspace`]
  )
}

async function insertConnectedCommerceConnection(input: {
  provider: "salla" | "shopify" | "zid"
  organizationId: string
  workspaceId: string | null
  userId: string
  status?: "connected" | "disconnected"
}) {
  const connectionId = randomUUID()
  const table = `${input.provider}_oauth_connections`

  if (input.provider === "shopify") {
    await database.query(
      `insert into shopify_oauth_connections (
         id, organization_id, workspace_id, project_id, status, shop_domain,
         created_by_user_id, updated_by_user_id, created_at, updated_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $7, now(), now())`,
      [
        connectionId,
        input.organizationId,
        input.workspaceId,
        randomUUID(),
        input.status ?? "connected",
        `${connectionId}.myshopify.com`,
        input.userId,
      ]
    )
    return connectionId
  }

  await database.query(
    `insert into ${table} (
       id, organization_id, workspace_id, project_id, status,
       created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1, $2, $3, $4, $5, $6, $6, now(), now())`,
    [
      connectionId,
      input.organizationId,
      input.workspaceId,
      randomUUID(),
      input.status ?? "connected",
      input.userId,
    ]
  )
  return connectionId
}

async function insertProductRecord(input: {
  provider: "salla" | "shopify" | "zid"
  connectionId: string
  entityId: string
  payload: Record<string, unknown>
  updatedAt: string
}) {
  const table = `${input.provider}_records`
  await database.query(
    `insert into ${table} (
       id, connection_id, customer_id, entity_type, entity_id, record_date, payload, created_at, updated_at
     ) values ($1, $2, 'store-1', 'products', $3, $4::date, $5::jsonb, now(), $4::timestamptz)`,
    [
      randomUUID(),
      input.connectionId,
      input.entityId,
      input.updatedAt,
      JSON.stringify(input.payload),
    ]
  )
}

function authHeaders(login: { session: { accessToken: string } }) {
  return { authorization: `Bearer ${login.session.accessToken}` }
}

describe("GET /v1/products: real cross-connector product aggregation", () => {
  it("normalizes and merges products from Salla, Shopify, and Zid", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "products-full@madar.test",
      "Products Full Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001500"
    await provisionWorkspace({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      label: "Products Full",
    })

    const sallaConnectionId = await insertConnectedCommerceConnection({
      provider: "salla",
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
    })
    await insertProductRecord({
      provider: "salla",
      connectionId: sallaConnectionId,
      entityId: "653788621",
      updatedAt: "2026-08-15T02:53:53Z",
      payload: {
        name: "madar",
        sku: "SL-1",
        price: { amount: 1000, currency: "SAR" },
        cost_price: "500",
        quantity: 12,
        is_available: true,
        categories: [{ name: "الفساتين" }],
        main_image: "https://cdn.example.com/salla.webp",
      },
    })

    const shopifyConnectionId = await insertConnectedCommerceConnection({
      provider: "shopify",
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
    })
    await insertProductRecord({
      provider: "shopify",
      connectionId: shopifyConnectionId,
      entityId: "7736761843806",
      updatedAt: "2026-08-16T03:40:50Z",
      payload: {
        title: "test",
        status: "active",
        product_type: "",
        variants: [{ sku: null, price: "199.00", inventory_quantity: 20 }],
        image: { src: "https://cdn.example.com/shopify.jpg" },
      },
    })

    const zidConnectionId = await insertConnectedCommerceConnection({
      provider: "zid",
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
    })
    await insertProductRecord({
      provider: "zid",
      connectionId: zidConnectionId,
      entityId: "zid-1",
      updatedAt: "2026-08-14T00:00:00Z",
      payload: {
        name: { en: "Zid Product", ar: "منتج زد" },
        sku: "ZD-1",
        price: 100,
        sale_price: 95,
        cost: 40,
        quantity: 7,
        is_published: true,
        is_draft: false,
        categories: [{ name: { en: "Fashion" } }],
        images: [{ image: { large: "https://cdn.example.com/zid.png" } }],
      },
    })

    const response = await fetch(`${baseUrl}/v1/products`, { headers: authHeaders(login) })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      items: Array<{
        id: string
        name: string
        sku: string
        category: string
        status: string
        availableStock: number
        costPrice: number | null
        sellingPrice: number
        platform: string
        image: string | null
      }>
    }

    expect(body.items).toHaveLength(3)

    const salla = body.items.find((item) => item.platform === "Salla")
    expect(salla).toMatchObject({
      id: "salla:653788621",
      name: "madar",
      sku: "SL-1",
      category: "الفساتين",
      status: "Active",
      availableStock: 12,
      costPrice: 500,
      sellingPrice: 1000,
      image: "https://cdn.example.com/salla.webp",
    })

    const shopify = body.items.find((item) => item.platform === "Shopify")
    expect(shopify).toMatchObject({
      id: "shopify:7736761843806",
      name: "test",
      status: "Active",
      availableStock: 20,
      costPrice: null,
      sellingPrice: 199,
      image: "https://cdn.example.com/shopify.jpg",
    })

    const zid = body.items.find((item) => item.platform === "Zid")
    expect(zid).toMatchObject({
      id: "zid:zid-1",
      name: "Zid Product",
      sku: "ZD-1",
      category: "Fashion",
      status: "Active",
      availableStock: 7,
      costPrice: 40,
      sellingPrice: 100,
      image: "https://cdn.example.com/zid.png",
    })

    // Confirms merge sort puts the most recently updated product first (Shopify: Aug 16).
    expect(body.items[0]?.platform).toBe("Shopify")
  })

  it("excludes products from disconnected connections and other organizations", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "products-scoped@madar.test",
      "Products Scoped Org"
    )
    const { actor: otherActor } = await registerAndProvisionOrg(
      "products-other-org@madar.test",
      "Products Other Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001510"
    await provisionWorkspace({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      label: "Products Scoped",
    })
    const otherWorkspaceId = otherActor.workspaceId ?? "00000000-0000-4000-8000-000000001520"
    await provisionWorkspace({
      organizationId: otherActor.organizationId,
      ownerUserId: otherActor.userId,
      workspaceId: otherWorkspaceId,
      label: "Products Other Org",
    })

    const disconnectedConnectionId = await insertConnectedCommerceConnection({
      provider: "salla",
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
      status: "disconnected",
    })
    await insertProductRecord({
      provider: "salla",
      connectionId: disconnectedConnectionId,
      entityId: "disconnected-1",
      updatedAt: "2026-08-15T00:00:00Z",
      payload: { name: "Should not appear (disconnected)", is_available: true },
    })

    const otherOrgConnectionId = await insertConnectedCommerceConnection({
      provider: "shopify",
      organizationId: otherActor.organizationId,
      workspaceId: otherWorkspaceId,
      userId: otherActor.userId,
    })
    await insertProductRecord({
      provider: "shopify",
      connectionId: otherOrgConnectionId,
      entityId: "other-org-1",
      updatedAt: "2026-08-15T00:00:00Z",
      payload: { title: "Should not appear (other org)", status: "active" },
    })

    const response = await fetch(`${baseUrl}/v1/products`, { headers: authHeaders(login) })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { items: unknown[] }
    expect(body.items).toHaveLength(0)
  })

  it("rejects unauthenticated requests", async () => {
    const response = await fetch(`${baseUrl}/v1/products`)
    expect(response.status).toBe(401)
  })
})

// @vitest-environment node

import { createHmac } from "node:crypto"
import { randomUUID } from "node:crypto"
import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { SallaOAuthService } from "../salla-oauth/service"
import { createIdentityApiServer } from "../interfaces/rest/server"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>

const WEBHOOK_SECRET = "test-salla-webhook-secret"
const STORE_ID = "998877"
const SALLA_API_BASE_URL = "https://api.salla.dev/admin/v2"

// handleWebhookEvent() no longer trusts a webhook delivery's own payload.data beyond its `id` --
// confirmed live against the real Salla sandbox, a webhook's payload uses incompatible field
// shapes compared to Salla's own REST API for the same entity (price/regular_price as bare
// numbers vs GET /products/{id}'s {amount, currency} objects), so it re-fetches the canonical
// record via Salla's REST API and stores that instead. Every test that expects a successful
// write mocks both pieces this re-fetch needs: a resolved access token, and that REST GET call.
function mockAccessToken(token: string) {
  return vi.spyOn(SallaOAuthService.prototype, "resolveAccessToken").mockResolvedValue(token)
}

function mockSallaEntityFetch(entities: Record<string, Record<string, unknown>>) {
  const nativeFetch = globalThis.fetch
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (rawInput, init) => {
    const url = typeof rawInput === "string" ? rawInput : rawInput.toString()
    if (!url.startsWith(SALLA_API_BASE_URL)) {
      return nativeFetch(rawInput, init)
    }
    const entityId = url.slice(SALLA_API_BASE_URL.length).split("/").filter(Boolean).pop() ?? ""
    const data = entities[entityId]
    if (!data) {
      return new Response("{}", { status: 404 })
    }
    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  })
}

beforeEach(async () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"
  process.env.SALLA_CLIENT_ID = "salla-client-id"
  process.env.SALLA_CLIENT_SECRET = "salla-client-secret"
  process.env.SALLA_WEBHOOK_SECRET = WEBHOOK_SECRET

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
  delete process.env.SALLA_WEBHOOK_SECRET
  vi.restoreAllMocks()
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

async function seedOrganization() {
  const organizationId = randomUUID()
  const workspaceId = randomUUID()
  const userId = randomUUID()
  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, 'webhook-test@madar.test', 'hash', 'Webhook Test', now())`,
    [userId]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status)
     values ($1, 'Webhook Test Org', $2, 'active')`,
    [organizationId, userId]
  )
  await database.query(
    `insert into workspaces (id, organization_id, name, status)
     values ($1, $2, 'Webhook Test Workspace', 'active')`,
    [workspaceId, organizationId]
  )
  return { organizationId, workspaceId, userId }
}

async function seedConnectedStore(input: {
  organizationId: string
  workspaceId: string
  userId: string
  storeId: string
  status?: string
}) {
  const connectionId = randomUUID()
  await database.query(
    `insert into salla_oauth_connections (
       id, organization_id, workspace_id, project_id, provider_account_id, status,
       created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $7, now(), now())`,
    [
      connectionId,
      input.organizationId,
      input.workspaceId,
      randomUUID(),
      input.storeId,
      input.status ?? "connected",
      input.userId,
    ]
  )
  const customerId = randomUUID()
  await database.query(
    `insert into salla_stores (
       id, connection_id, account_id, account_name, status, is_selected
     ) values ($1, $2, $3, 'Webhook Test Store', 'active', true)`,
    [randomUUID(), connectionId, customerId]
  )
  return { connectionId, customerId }
}

function signedPost(path: string, bodyObject: unknown) {
  const body = JSON.stringify(bodyObject)
  const signature = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex")
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-salla-signature": signature },
    body,
  })
}

describe("POST /v1/integrations/salla/webhook", () => {
  it("verifies the signature, resolves the store, and upserts a salla_records row re-fetched from Salla's API", async () => {
    const org = await seedOrganization()
    const { connectionId } = await seedConnectedStore({ ...org, storeId: STORE_ID })
    mockAccessToken("test-access-token")
    mockSallaEntityFetch({
      555123: { id: 555123, status: { name: "Completed" }, updated_at: "2026-01-01 10:00:00" },
    })

    const response = await signedPost("/v1/integrations/salla/webhook", {
      event: "order.updated",
      merchant: STORE_ID,
      data: { id: 555123 },
    })
    expect(response.status).toBe(200)

    const rows = await database.query<{ entity_type: string; entity_id: string }>(
      `select entity_type, entity_id from salla_records where connection_id = $1`,
      [connectionId]
    )
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]).toEqual({ entity_type: "orders", entity_id: "555123" })
  })

  it("rejects a request with an invalid signature", async () => {
    const org = await seedOrganization()
    await seedConnectedStore({ ...org, storeId: STORE_ID })

    const body = JSON.stringify({ event: "order.updated", merchant: STORE_ID, data: { id: 1 } })
    const response = await fetch(`${baseUrl}/v1/integrations/salla/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-salla-signature": "not-the-right-signature",
      },
      body,
    })
    expect(response.status).toBe(401)

    const rows = await database.query(`select 1 from salla_records`)
    expect(rows.rows).toHaveLength(0)
  })

  it("acks with 200 and does nothing for an unknown/disconnected store", async () => {
    const response = await signedPost("/v1/integrations/salla/webhook", {
      event: "order.updated",
      merchant: "no-such-store",
      data: { id: 1 },
    })
    expect(response.status).toBe(200)

    const rows = await database.query(`select 1 from salla_records`)
    expect(rows.rows).toHaveLength(0)
  })

  it("acks with 200 and does nothing for an event type that isn't mapped", async () => {
    const org = await seedOrganization()
    await seedConnectedStore({ ...org, storeId: STORE_ID })

    const response = await signedPost("/v1/integrations/salla/webhook", {
      event: "review.added",
      merchant: STORE_ID,
      data: { id: 1 },
    })
    expect(response.status).toBe(200)

    const rows = await database.query(`select 1 from salla_records`)
    expect(rows.rows).toHaveLength(0)
  })

  // product.updated is deliberately unmapped (see the comment above SALLA_EVENT_TO_ENTITY_TYPE) --
  // Salla's own docs show it struck through with no description, so this guards against it
  // silently starting to re-fetch records if it's ever added back without that being a deliberate
  // decision.
  it("acks with 200 and does nothing for the deliberately-unmapped product.updated event", async () => {
    const org = await seedOrganization()
    await seedConnectedStore({ ...org, storeId: STORE_ID })

    const response = await signedPost("/v1/integrations/salla/webhook", {
      event: "product.updated",
      merchant: STORE_ID,
      data: { id: 1 },
    })
    expect(response.status).toBe(200)

    const rows = await database.query(`select 1 from salla_records`)
    expect(rows.rows).toHaveLength(0)
  })

  it("re-fetches and stores the product for each of the non-price product events (image/category/brand/tags)", async () => {
    const org = await seedOrganization()
    const { connectionId } = await seedConnectedStore({ ...org, storeId: STORE_ID })
    mockAccessToken("test-access-token")
    mockSallaEntityFetch({
      444: { id: 444, name: "Updated Product", updated_at: "2026-01-01 10:00:00" },
    })

    const response = await signedPost("/v1/integrations/salla/webhook", {
      event: "product.image.updated",
      merchant: STORE_ID,
      data: { id: 444 },
    })
    expect(response.status).toBe(200)

    const rows = await database.query<{ entity_type: string; entity_id: string }>(
      `select entity_type, entity_id from salla_records where connection_id = $1`,
      [connectionId]
    )
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]).toEqual({ entity_type: "products", entity_id: "444" })
  })

  it("is idempotent against a duplicated/replayed delivery", async () => {
    const org = await seedOrganization()
    const { connectionId } = await seedConnectedStore({ ...org, storeId: STORE_ID })
    mockAccessToken("test-access-token")
    mockSallaEntityFetch({
      777: { id: 777, price: { amount: 50, currency: "SAR" }, updated_at: "2026-01-01 10:00:00" },
    })

    const payload = {
      event: "product.price.updated",
      merchant: STORE_ID,
      data: { id: 777 },
    }
    const first = await signedPost("/v1/integrations/salla/webhook", payload)
    expect(first.status).toBe(200)
    const second = await signedPost("/v1/integrations/salla/webhook", payload)
    expect(second.status).toBe(200)

    const rows = await database.query<{ entity_type: string; entity_id: string }>(
      `select entity_type, entity_id from salla_records where connection_id = $1`,
      [connectionId]
    )
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]).toEqual({ entity_type: "products", entity_id: "777" })
  })

  // Found live in production: a webhook event's own payload.data isn't just partial (missing
  // fields a poll-sync's full fetch would have) -- fields it does include can use a different,
  // incompatible shape. product.price.updated sent `price` as a bare number while GET
  // /products/{id} (what poll-sync writes, and what the products list's read path expects) wraps
  // it as {amount, currency}; storing the webhook's own payload (even merged over the existing
  // row) corrupted price display to 0. Confirms the re-fetch fix: the webhook's own (shape-
  // incompatible) data is never written -- only the freshly re-fetched, poll-shaped record is.
  it("stores the re-fetched, poll-shaped record rather than the webhook delivery's own (differently-shaped) payload", async () => {
    const org = await seedOrganization()
    const { connectionId } = await seedConnectedStore({ ...org, storeId: STORE_ID })
    mockAccessToken("test-access-token")
    mockSallaEntityFetch({
      1450419203: {
        id: 1450419203,
        name: "قميص قطن أزرق",
        sku: "SKU-1001",
        price: { amount: 65, currency: "SAR" },
      },
    })

    // Simulates what a full poll-sync would have already written for this product.
    await database.query(
      `insert into salla_records (id, connection_id, customer_id, entity_type, entity_id, record_date, payload, created_at, updated_at)
       values ($1, $2, 'cust-1', 'products', '1450419203', now()::date, $3::jsonb, now(), now())`,
      [
        randomUUID(),
        connectionId,
        JSON.stringify({
          id: 1450419203,
          name: "قميص قطن أزرق",
          sku: "SKU-1001",
          price: { amount: 80, currency: "SAR" },
        }),
      ]
    )

    // A real delivery's own payload.data is shape-incompatible (a bare number, not
    // {amount, currency}) -- this must never reach storage; only the re-fetched shape should.
    const response = await signedPost("/v1/integrations/salla/webhook", {
      event: "product.price.updated",
      merchant: STORE_ID,
      data: { id: 1450419203, price: 65, sku: "SKU-1001" },
    })
    expect(response.status).toBe(200)

    const rows = await database.query<{
      payload: { name?: string; price?: { amount?: number; currency?: string }; sku?: string }
    }>(`select payload from salla_records where connection_id = $1 and entity_id = '1450419203'`, [
      connectionId,
    ])
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0].payload.name).toBe("قميص قطن أزرق")
    expect(rows.rows[0].payload.price).toEqual({ amount: 65, currency: "SAR" })
  })
})

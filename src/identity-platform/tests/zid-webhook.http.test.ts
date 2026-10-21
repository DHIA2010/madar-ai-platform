// @vitest-environment node

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

const WEBHOOK_USERNAME = "test-zid-webhook-user"
const WEBHOOK_PASSWORD = "test-zid-webhook-pass"
const STORE_ID = "3256254"

beforeEach(async () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"
  process.env.ZID_CLIENT_ID = "zid-client-id"
  process.env.ZID_CLIENT_SECRET = "zid-client-secret"
  process.env.ZID_WEBHOOK_USERNAME = WEBHOOK_USERNAME
  process.env.ZID_WEBHOOK_PASSWORD = WEBHOOK_PASSWORD

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
  delete process.env.ZID_WEBHOOK_USERNAME
  delete process.env.ZID_WEBHOOK_PASSWORD
  vi.restoreAllMocks()
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
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
     values ($1, 'zid-webhook-test@madar.test', 'hash', 'Zid Webhook Test', now())`,
    [userId]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status)
     values ($1, 'Zid Webhook Test Org', $2, 'active')`,
    [organizationId, userId]
  )
  await database.query(
    `insert into workspaces (id, organization_id, name, status)
     values ($1, $2, 'Zid Webhook Test Workspace', 'active')`,
    [workspaceId, organizationId]
  )
  return { organizationId, workspaceId, userId }
}

async function seedConnectedStore(input: {
  organizationId: string
  workspaceId: string
  userId: string
  storeId: string
}) {
  const connectionId = randomUUID()
  await database.query(
    `insert into zid_oauth_connections (
       id, organization_id, workspace_id, project_id, provider_account_id, status,
       created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1, $2, $3, $4, $5, 'connected', $6, $6, now(), now())`,
    [
      connectionId,
      input.organizationId,
      input.workspaceId,
      randomUUID(),
      input.storeId,
      input.userId,
    ]
  )
  const customerId = randomUUID()
  await database.query(
    `insert into zid_stores (id, connection_id, account_id, account_name, status, is_selected)
     values ($1, $2, $3, 'Zid Webhook Test Store', 'active', true)`,
    [randomUUID(), connectionId, customerId]
  )
  return { connectionId, customerId }
}

function basicAuthHeader() {
  return `Basic ${Buffer.from(`${WEBHOOK_USERNAME}:${WEBHOOK_PASSWORD}`).toString("base64")}`
}

// Confirmed live against a real delivery: Zid sends the event name in this header, never in the
// body -- there is no {event, data} envelope. A product.* event's body is the product resource
// itself (id/store_id/... at the top level); a product.stock.* event's body is a different,
// smaller shape with no store_id at all (see zid-oauth/webhook-service.ts).
function authedPost(
  path: string,
  event: string,
  bodyObject: unknown,
  authorization = basicAuthHeader()
) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization, "webhook-event": event },
    body: JSON.stringify(bodyObject),
  })
}

describe("POST /v1/integrations/zid/webhook", () => {
  it("verifies Basic Auth, resolves the store from the body's own store_id, and re-fetches the canonical product record", async () => {
    const org = await seedOrganization()
    const { connectionId } = await seedConnectedStore({ ...org, storeId: STORE_ID })

    vi.spyOn(ZidOAuthService.prototype, "resolveAccessToken").mockResolvedValue({
      accessToken: "test-access-token",
      authorizationHeader: "Bearer test-access-token",
    })
    const nativeFetch = globalThis.fetch
    vi.spyOn(globalThis, "fetch").mockImplementation(async (rawInput, init) => {
      const url = typeof rawInput === "string" ? rawInput : rawInput.toString()
      if (url.startsWith(baseUrl)) return nativeFetch(rawInput, init)
      expect(url).toContain("/products/555123/")
      return new Response(
        JSON.stringify({
          id: "555123",
          name: { en: "Test", ar: "اختبار" },
          updated_at: "2026-01-01T00:00:00Z",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    })

    const response = await authedPost("/v1/integrations/zid/webhook", "product.update", {
      id: "555123",
      store_id: Number(STORE_ID),
      name: { en: "Test" },
    })
    expect(response.status).toBe(200)

    const rows = await database.query<{ entity_type: string; entity_id: string }>(
      `select entity_type, entity_id from zid_records where connection_id = $1`,
      [connectionId]
    )
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]).toEqual({ entity_type: "products", entity_id: "555123" })
  })

  it("resolves a product.stock.update delivery (no store_id) via the product's own previously-synced record", async () => {
    const org = await seedOrganization()
    const { connectionId, customerId } = await seedConnectedStore({ ...org, storeId: STORE_ID })

    // The product must already have been synced once (its own product.create/update delivery,
    // which does carry store_id) before a stock-only delivery for it can be resolved.
    await database.query(
      `insert into zid_records (id, connection_id, customer_id, entity_type, entity_id, record_date, payload, created_at, updated_at)
       values ($1, $2, $3, 'products', '555123', now()::date, '{}'::jsonb, now(), now())`,
      [randomUUID(), connectionId, customerId]
    )

    vi.spyOn(ZidOAuthService.prototype, "resolveAccessToken").mockResolvedValue({
      accessToken: "test-access-token",
      authorizationHeader: "Bearer test-access-token",
    })
    const nativeFetch = globalThis.fetch
    vi.spyOn(globalThis, "fetch").mockImplementation(async (rawInput, init) => {
      const url = typeof rawInput === "string" ? rawInput : rawInput.toString()
      if (url.startsWith(baseUrl)) return nativeFetch(rawInput, init)
      expect(url).toContain("/products/555123/")
      return new Response(
        JSON.stringify({
          id: "555123",
          name: { en: "Test" },
          quantity: 7,
          updated_at: "2026-01-01T00:00:00Z",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    })

    // The real body shape, confirmed live: no store_id, the stock entry's own id (not the
    // product's) under `id`, and the product under `product_id`.
    const response = await authedPost("/v1/integrations/zid/webhook", "product.stock.update", {
      id: "1f9cd41c-cf17-4746-8814-f61827b01604",
      location: "93835d77-8eec-400d-a809-77657420d884",
      available_quantity: 7,
      is_infinite: false,
      product_id: "555123",
      sale_channels: ["catalog"],
    })
    expect(response.status).toBe(200)

    const rows = await database.query<{ payload: { quantity?: number } }>(
      `select payload from zid_records where connection_id = $1 and entity_id = '555123'`,
      [connectionId]
    )
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0].payload.quantity).toBe(7)
  })

  it("rejects a request with invalid Basic Auth credentials", async () => {
    const org = await seedOrganization()
    await seedConnectedStore({ ...org, storeId: STORE_ID })

    const response = await authedPost(
      "/v1/integrations/zid/webhook",
      "product.update",
      { id: "1", store_id: Number(STORE_ID) },
      `Basic ${Buffer.from("wrong:credentials").toString("base64")}`
    )
    expect(response.status).toBe(401)

    const rows = await database.query(`select 1 from zid_records`)
    expect(rows.rows).toHaveLength(0)
  })

  it("acks with 200 and does nothing for an unknown/disconnected store", async () => {
    const response = await authedPost("/v1/integrations/zid/webhook", "product.update", {
      id: "1",
      store_id: "no-such-store",
    })
    expect(response.status).toBe(200)

    const rows = await database.query(`select 1 from zid_records`)
    expect(rows.rows).toHaveLength(0)
  })

  it("acks with 200 and does nothing for an event type that isn't mapped (e.g. product.delete)", async () => {
    const org = await seedOrganization()
    await seedConnectedStore({ ...org, storeId: STORE_ID })

    const response = await authedPost("/v1/integrations/zid/webhook", "product.delete", {
      id: "1",
      store_id: Number(STORE_ID),
    })
    expect(response.status).toBe(200)

    const rows = await database.query(`select 1 from zid_records`)
    expect(rows.rows).toHaveLength(0)
  })

  it("stores an order.create delivery's own body directly, no re-fetch (orders sit on a different API surface)", async () => {
    const org = await seedOrganization()
    const { connectionId } = await seedConnectedStore({ ...org, storeId: STORE_ID })

    const nativeFetch = globalThis.fetch
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (rawInput, init) => nativeFetch(rawInput, init))

    const response = await authedPost("/v1/integrations/zid/webhook", "order.create", {
      id: "900111",
      store_id: Number(STORE_ID),
      status: { code: "new" },
      updated_at: "2026-01-01T00:00:00Z",
    })
    expect(response.status).toBe(200)

    // No outbound call besides the test's own request to our server -- nothing is re-fetched.
    for (const call of fetchSpy.mock.calls) {
      const url = typeof call[0] === "string" ? call[0] : call[0].toString()
      expect(url.startsWith(baseUrl)).toBe(true)
    }

    const rows = await database.query<{ entity_type: string; entity_id: string }>(
      `select entity_type, entity_id from zid_records where connection_id = $1`,
      [connectionId]
    )
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]).toEqual({ entity_type: "orders", entity_id: "900111" })
  })

  it("stores a customer.create delivery's own body directly", async () => {
    const org = await seedOrganization()
    const { connectionId } = await seedConnectedStore({ ...org, storeId: STORE_ID })

    const response = await authedPost("/v1/integrations/zid/webhook", "customer.create", {
      id: "800222",
      store_id: Number(STORE_ID),
      name: "Test Customer",
      updated_at: "2026-01-01T00:00:00Z",
    })
    expect(response.status).toBe(200)

    const rows = await database.query<{ entity_type: string; entity_id: string }>(
      `select entity_type, entity_id from zid_records where connection_id = $1`,
      [connectionId]
    )
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]).toEqual({ entity_type: "customers", entity_id: "800222" })
  })

  it("is idempotent against a duplicated/replayed delivery", async () => {
    const org = await seedOrganization()
    const { connectionId } = await seedConnectedStore({ ...org, storeId: STORE_ID })

    vi.spyOn(ZidOAuthService.prototype, "resolveAccessToken").mockResolvedValue({
      accessToken: "test-access-token",
      authorizationHeader: "Bearer test-access-token",
    })
    const nativeFetch = globalThis.fetch
    vi.spyOn(globalThis, "fetch").mockImplementation(async (rawInput, init) => {
      const url = typeof rawInput === "string" ? rawInput : rawInput.toString()
      if (url.startsWith(baseUrl)) return nativeFetch(rawInput, init)
      return new Response(
        JSON.stringify({ id: "777", name: { en: "Test" }, updated_at: "2026-01-01T00:00:00Z" }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    })

    const body = { id: "777", store_id: Number(STORE_ID) }
    const first = await authedPost("/v1/integrations/zid/webhook", "product.update", body)
    expect(first.status).toBe(200)
    const second = await authedPost("/v1/integrations/zid/webhook", "product.update", body)
    expect(second.status).toBe(200)

    const rows = await database.query<{ entity_type: string; entity_id: string }>(
      `select entity_type, entity_id from zid_records where connection_id = $1`,
      [connectionId]
    )
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]).toEqual({ entity_type: "products", entity_id: "777" })
  })
})

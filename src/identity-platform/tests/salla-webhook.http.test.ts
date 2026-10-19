// @vitest-environment node

import { createHmac } from "node:crypto"
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

const WEBHOOK_SECRET = "test-salla-webhook-secret"
const STORE_ID = "998877"

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
  it("verifies the signature, resolves the store, and upserts a salla_records row", async () => {
    const org = await seedOrganization()
    const { connectionId } = await seedConnectedStore({ ...org, storeId: STORE_ID })

    const response = await signedPost("/v1/integrations/salla/webhook", {
      event: "order.updated",
      merchant: STORE_ID,
      data: { id: 555123, status: { name: "Completed" }, updated_at: "2026-01-01 10:00:00" },
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

  it("is idempotent against a duplicated/replayed delivery", async () => {
    const org = await seedOrganization()
    const { connectionId } = await seedConnectedStore({ ...org, storeId: STORE_ID })

    const payload = {
      event: "product.price.updated",
      merchant: STORE_ID,
      data: { id: 777, price: 50, updated_at: "2026-01-01 10:00:00" },
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

  // Found live in production: product.price.updated's real payload carries only the fields that
  // event actually changed (id/price/sku/tax/cost/...), never `name`. A full-replace upsert wiped
  // the product's name (and every other previously-polled field) out entirely the moment a price
  // changed. upsertPartialRecord's merge is what this guards against regressing.
  it("merges a partial webhook payload into an existing full record instead of replacing it", async () => {
    const org = await seedOrganization()
    const { connectionId } = await seedConnectedStore({ ...org, storeId: STORE_ID })

    // Simulates what a full poll-sync would have already written for this product.
    await database.query(
      `insert into salla_records (id, connection_id, customer_id, entity_type, entity_id, record_date, payload, created_at, updated_at)
       values ($1, $2, 'cust-1', 'products', '1450419203', now()::date, $3::jsonb, now(), now())`,
      [
        randomUUID(),
        connectionId,
        JSON.stringify({ id: 1450419203, name: "قميص قطن أزرق", sku: "SKU-1001", price: 80 }),
      ]
    )

    const response = await signedPost("/v1/integrations/salla/webhook", {
      event: "product.price.updated",
      merchant: STORE_ID,
      data: { id: 1450419203, price: 65, sku: "SKU-1001" },
    })
    expect(response.status).toBe(200)

    const rows = await database.query<{ payload: { name?: string; price?: number; sku?: string } }>(
      `select payload from salla_records where connection_id = $1 and entity_id = '1450419203'`,
      [connectionId]
    )
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0].payload.name).toBe("قميص قطن أزرق")
    expect(rows.rows[0].payload.price).toBe(65)
  })
})

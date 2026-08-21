// @vitest-environment node

import { randomUUID } from "node:crypto"
import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { SallaIntegrationProvider } from "../integrations/salla/provider"
import { createIdentityApiServer } from "../interfaces/rest/server"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>

// The real "Order Details" response shape (confirmed against Salla's published OpenAPI
// schema) -- distinct from the lighter /orders list shape our sync already stores, which has
// no per-item price, SKU, or tax/discount breakdown.
const SALLA_ORDER_DETAIL_RESPONSE = {
  data: {
    amounts: {
      sub_total: { amount: 1390, currency: "SAR" },
      shipping_cost: { amount: 0, currency: "SAR" },
      tax: { percent: "15.00", amount: { amount: 150, currency: "SAR" } },
      total: { amount: 1540, currency: "SAR" },
    },
    items: [
      {
        id: 1,
        name: "فستان",
        sku: "DRS-001",
        quantity: 2,
        amounts: {
          price_without_tax: { amount: 120, currency: "SAR" },
          total_discount: { amount: 10, currency: "SAR" },
          tax: { percent: "15.00", amount: { amount: 36, currency: "SAR" } },
          total: { amount: 240, currency: "SAR" },
        },
        product: { sku: "DRS-001", thumbnail: "https://example.com/dress.jpg" },
      },
      {
        id: 2,
        name: "حقيبة يد",
        sku: null,
        quantity: 1,
        amounts: {
          price_without_tax: { amount: 1100, currency: "SAR" },
          total_discount: { amount: 0, currency: "SAR" },
          tax: { percent: "15.00", amount: { amount: 114, currency: "SAR" } },
          total: { amount: 1300, currency: "SAR" },
        },
        product: { sku: "BAG-configured-elsewhere", thumbnail: null },
      },
    ],
  },
}

function mockSallaFetch(input: { baseUrl: string; accessToken: string; refreshToken: string }) {
  const nativeFetch = globalThis.fetch

  return vi.spyOn(globalThis, "fetch").mockImplementation(async (rawInput, init) => {
    const url = typeof rawInput === "string" ? rawInput : rawInput.toString()

    if (url.startsWith(input.baseUrl)) {
      return nativeFetch(rawInput, init)
    }

    if (url.includes("/oauth2/token")) {
      const body = typeof init?.body === "string" ? init.body : ""
      const params = new URLSearchParams(body)
      const isRefresh = params.get("grant_type") === "refresh_token"
      return new Response(
        JSON.stringify({
          access_token: isRefresh ? `${input.accessToken}-refreshed` : input.accessToken,
          refresh_token: input.refreshToken,
          expires_in: 3600,
          token_type: "Bearer",
          scope: "offline_access",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    if (url.includes("/store/info")) {
      return new Response(JSON.stringify({ data: { id: "778899", name: "Detail Test Store" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }

    if (url.includes("/orders/5001")) {
      return new Response(JSON.stringify(SALLA_ORDER_DETAIL_RESPONSE), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }

    if (url.includes("/orders/does-not-exist")) {
      return new Response("{}", { status: 404 })
    }

    return new Response("{}", { status: 404 })
  })
}

beforeEach(async () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"
  process.env.SALLA_CLIENT_ID = "salla-client-id"
  process.env.SALLA_CLIENT_SECRET = "salla-client-secret"
  process.env.SALLA_REDIRECT_URI = "http://localhost:4000/v1/integrations/salla/oauth/callback"
  process.env.SALLA_SUCCESS_REDIRECT_URI = "http://localhost:3000/integrations/new"

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
  container.infrastructure.integrations?.register(new SallaIntegrationProvider(database))

  server = createIdentityApiServer(container)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const address = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterEach(async () => {
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

async function registerAndProvisionOrg(email: string, orgName: string) {
  const registerResponse = await fetch(`${baseUrl}/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: "VeryStrongPassword123!",
      fullName: "Order Detail Test",
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
     values ($1, $2, 'hash', 'Order Detail Test', now()) on conflict (id) do nothing`,
    [actor.userId, email]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status)
     values ($1, $2, $3, 'active') on conflict (id) do nothing`,
    [actor.organizationId, orgName, actor.userId]
  )

  return { login, actor }
}

async function provisionWorkspaceProject(input: {
  organizationId: string
  ownerUserId: string
  workspaceId: string
  projectId: string
  label: string
}) {
  await database.query(
    `insert into workspaces (id, organization_id, name, status)
     values ($1, $2, $3, 'active') on conflict (id) do nothing`,
    [input.workspaceId, input.organizationId, `${input.label} Workspace`]
  )
  await database.query(
    `insert into projects (id, organization_id, workspace_id, owner_user_id, name, status)
     values ($1, $2, $3, $4, $5, 'active') on conflict (id) do nothing`,
    [
      input.projectId,
      input.organizationId,
      input.workspaceId,
      input.ownerUserId,
      `${input.label} Project`,
    ]
  )
}

async function connectSalla(input: {
  login: { session: { accessToken: string } }
  workspaceId: string
}) {
  const startResponse = await fetch(`${baseUrl}/v1/integrations/salla/oauth/start`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.login.session.accessToken}`,
      "x-workspace-id": input.workspaceId,
    },
    body: JSON.stringify({ workspaceId: input.workspaceId }),
  })
  const started = (await startResponse.json()) as { state: string; connectionId: string }

  await fetch(
    `${baseUrl}/v1/integrations/salla/oauth/callback?state=${encodeURIComponent(started.state)}&code=salla-code`,
    { redirect: "manual" }
  )

  return started
}

function authHeaders(login: { session: { accessToken: string } }, workspaceId: string) {
  return {
    authorization: `Bearer ${login.session.accessToken}`,
    "x-workspace-id": workspaceId,
  }
}

describe("GET /v1/orders/:id/details: real Salla order line items", () => {
  it("fetches live per-item price/SKU/tax/discount from Salla's Order Details endpoint", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "order-detail-full@madar.test",
      "Order Detail Full Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000004600"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000004601",
      label: "Order Detail Full",
    })

    mockSallaFetch({
      baseUrl,
      accessToken: "salla-access-detail",
      refreshToken: "salla-refresh-detail",
    })

    const started = await connectSalla({ login, workspaceId })

    // Insert the order record directly (as our real bulk sync already does) so
    // resolveOrderConnection can find the owning connection without needing a full sync run.
    await database.query(
      `insert into salla_records (
         id, connection_id, customer_id, entity_type, entity_id, record_date, payload, created_at, updated_at
       ) values ($1, $2, '778899', 'orders', '5001', now()::date, '{}'::jsonb, now(), now())`,
      [randomUUID(), started.connectionId]
    )

    const response = await fetch(`${baseUrl}/v1/orders/salla:5001/details`, {
      headers: authHeaders(login, workspaceId),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      currency: string
      subTotal: number
      shippingCost: number
      taxTotal: number
      discountTotal: number
      total: number
      items: Array<{
        name: string
        sku: string | null
        quantity: number
        unitPrice: number | null
        discount: number
        tax: number
        total: number
        thumbnail: string | null
      }>
    }

    expect(body).toMatchObject({
      currency: "SAR",
      subTotal: 1390,
      shippingCost: 0,
      taxTotal: 150,
      total: 1540,
    })
    // Summed from each item's real total_discount (10 + 0), not the ambiguous order-level
    // discounts[] array.
    expect(body.discountTotal).toBe(10)
    expect(body.items).toHaveLength(2)
    expect(body.items[0]).toMatchObject({
      name: "فستان",
      sku: "DRS-001",
      quantity: 2,
      unitPrice: 120,
      discount: 10,
      tax: 36,
      total: 240,
      thumbnail: "https://example.com/dress.jpg",
    })
    // Item without its own sku falls back to product.sku.
    expect(body.items[1].sku).toBe("BAG-configured-elsewhere")
    expect(body.items[1].thumbnail).toBeNull()
  })

  it("returns 404 for an order id that doesn't resolve to any owned connection", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "order-detail-missing@madar.test",
      "Order Detail Missing Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000004610"

    const response = await fetch(`${baseUrl}/v1/orders/salla:no-such-order/details`, {
      headers: authHeaders(login, workspaceId),
    })
    expect(response.status).toBe(404)
  })

  it("scopes order detail lookup to the requesting actor's organization", async () => {
    const { login: ownerLogin, actor: ownerActor } = await registerAndProvisionOrg(
      "order-detail-owner@madar.test",
      "Order Detail Owner Org"
    )
    const ownerWorkspaceId = ownerActor.workspaceId ?? "00000000-0000-4000-8000-000000004620"
    await provisionWorkspaceProject({
      organizationId: ownerActor.organizationId,
      ownerUserId: ownerActor.userId,
      workspaceId: ownerWorkspaceId,
      projectId: "00000000-0000-4000-8000-000000004621",
      label: "Order Detail Owner",
    })

    mockSallaFetch({
      baseUrl,
      accessToken: "salla-access-scope",
      refreshToken: "salla-refresh-scope",
    })
    const started = await connectSalla({ login: ownerLogin, workspaceId: ownerWorkspaceId })
    await database.query(
      `insert into salla_records (
         id, connection_id, customer_id, entity_type, entity_id, record_date, payload, created_at, updated_at
       ) values ($1, $2, '778899', 'orders', '5001', now()::date, '{}'::jsonb, now(), now())`,
      [randomUUID(), started.connectionId]
    )

    const { login: intruderLogin, actor: intruderActor } = await registerAndProvisionOrg(
      "order-detail-intruder@madar.test",
      "Order Detail Intruder Org"
    )
    const intruderWorkspaceId = intruderActor.workspaceId ?? "00000000-0000-4000-8000-000000004630"

    const response = await fetch(`${baseUrl}/v1/orders/salla:5001/details`, {
      headers: authHeaders(intruderLogin, intruderWorkspaceId),
    })
    expect(response.status).toBe(404)
  })

  it("rejects unauthenticated requests", async () => {
    const response = await fetch(`${baseUrl}/v1/orders/salla:5001/details`)
    expect(response.status).toBe(401)
  })
})

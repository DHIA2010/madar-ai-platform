// @vitest-environment node

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
      fullName: "Madar Orders Test",
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
     values ($1, $2, 'hash', 'Madar Orders Test', now()) on conflict (id) do nothing`,
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

  return { login, actor }
}

function authHeaders(login: { session: { accessToken: string } }) {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${login.session.accessToken}`,
  }
}

const ORDER_PAYLOAD = {
  customerName: "سارة أحمد",
  customerPhone: "0501234567",
  isGuestCustomer: true,
  paymentStatus: "paid" as const,
  paymentMethodCode: "cash",
  receiver: { name: "سارة أحمد", phone: "0501234567", countryCode: "SA", notify: true },
  deliveryMethod: "pickup" as const,
  discountAmount: 0,
  shippingDiscountAmount: 0,
  shippingCost: 0,
  items: [{ productName: "فستان", unitPrice: 100, quantity: 2 }],
}

describe("POST /v1/orders: Madar-created orders", () => {
  it("creates a local order with no connected Salla store -- stays local only, still shows up in the orders list", async () => {
    const { login } = await registerAndProvisionOrg("madar-order-local@madar.test", "Local Org")

    const createResponse = await fetch(`${baseUrl}/v1/orders`, {
      method: "POST",
      headers: authHeaders(login),
      body: JSON.stringify(ORDER_PAYLOAD),
    })
    expect(createResponse.status).toBe(201)
    const created = (await createResponse.json()) as {
      id: string
      orderNumber: string
      sallaPushStatus: string
      totalAmount: number
      subtotalAmount: number
    }
    expect(created.orderNumber).toBe("MO-000001")
    expect(created.sallaPushStatus).toBe("not_applicable")
    expect(created.subtotalAmount).toBe(200)

    const listResponse = await fetch(`${baseUrl}/v1/orders`, { headers: authHeaders(login) })
    expect(listResponse.status).toBe(200)
    const list = (await listResponse.json()) as {
      items: Array<{ id: string; platform: string; sallaPushStatus?: string; amount: number }>
    }
    const madarOrder = list.items.find((item) => item.id === `madar:${created.id}`)
    expect(madarOrder).toBeTruthy()
    expect(madarOrder?.platform).toBe("Madar")
    expect(madarOrder?.sallaPushStatus).toBe("not_applicable")

    const detailResponse = await fetch(`${baseUrl}/v1/orders/madar:${created.id}/details`, {
      headers: authHeaders(login),
    })
    expect(detailResponse.status).toBe(200)
    const detail = (await detailResponse.json()) as { total: number; items: unknown[] }
    expect(detail.total).toBe(created.totalAmount)
    expect(detail.items).toHaveLength(1)
  })

  it("decrements a referenced native product's own stock on order creation", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "madar-order-stock@madar.test",
      "Stock Org"
    )
    const productId = "11111111-1111-4111-8111-111111111111"
    await database.query(
      `insert into products (id, organization_id, product_type, name, stock_quantity)
       values ($1, $2, 'simple', 'فستان', 10)`,
      [productId, actor.organizationId]
    )

    const createResponse = await fetch(`${baseUrl}/v1/orders`, {
      method: "POST",
      headers: authHeaders(login),
      body: JSON.stringify({
        ...ORDER_PAYLOAD,
        items: [{ productId, productName: "فستان", unitPrice: 100, quantity: 3 }],
      }),
    })
    expect(createResponse.status).toBe(201)

    const productRow = await database.query<{ stock_quantity: string }>(
      `select stock_quantity from products where id = $1`,
      [productId]
    )
    expect(Number(productRow.rows[0].stock_quantity)).toBe(7)
  })

  // Found live in stage: a barcode-sized number pasted into the unit price field reached
  // Postgres raw and failed with "numeric field overflow" instead of a clean validation error.
  // schemas.ts now caps individual money fields well below that.
  it("rejects a unit price large enough to overflow the database column", async () => {
    const { login } = await registerAndProvisionOrg(
      "madar-order-overflow-field@madar.test",
      "Overflow Field Org"
    )

    const response = await fetch(`${baseUrl}/v1/orders`, {
      method: "POST",
      headers: authHeaders(login),
      body: JSON.stringify({
        ...ORDER_PAYLOAD,
        items: [{ productName: "فستان", unitPrice: 302013937800009, quantity: 10 }],
      }),
    })
    expect(response.status).toBe(400)
  })

  // Individually-valid fields (each under schemas.ts's own per-field cap) can still combine past
  // the numeric(12,2) column ceiling once multiplied together -- MadarOrdersService.create()'s own
  // aggregate guard is what catches that case specifically, as a clean validation error rather
  // than letting the INSERT itself fail.
  it("rejects an order whose computed total overflows even though every individual field is within its own cap", async () => {
    const { login } = await registerAndProvisionOrg(
      "madar-order-overflow-total@madar.test",
      "Overflow Total Org"
    )

    const response = await fetch(`${baseUrl}/v1/orders`, {
      method: "POST",
      headers: authHeaders(login),
      body: JSON.stringify({
        ...ORDER_PAYLOAD,
        items: [{ productName: "فستان", unitPrice: 999_999_999, quantity: 100_000 }],
      }),
    })
    expect(response.status).toBe(400)
    const body = (await response.json()) as { code?: string }
    expect(body.code).toBe("MADAR_ORDER_AMOUNT_TOO_LARGE")
  })
})

describe("POST /v1/orders with a connected Salla store: push + retry", () => {
  function mockSallaExternalOrders(input: {
    baseUrl: string
    accessToken: string
    refreshToken: string
    pushBehavior: "success" | "duplicate" | "failure"
  }) {
    const nativeFetch = globalThis.fetch
    let pushCallCount = 0

    return vi.spyOn(globalThis, "fetch").mockImplementation(async (rawInput, init) => {
      const url = typeof rawInput === "string" ? rawInput : rawInput.toString()

      if (url.startsWith(input.baseUrl)) {
        return nativeFetch(rawInput, init)
      }
      if (url.includes("/oauth2/token")) {
        return new Response(
          JSON.stringify({
            access_token: input.accessToken,
            refresh_token: input.refreshToken,
            expires_in: 3600,
            token_type: "Bearer",
            scope: "offline_access orders.read_write",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }
      if (url.includes("/store/info")) {
        return new Response(
          JSON.stringify({ data: { id: "998877", name: "Madar Test Store", currency: "SAR" } }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }
      if (url.includes("/orders/external")) {
        pushCallCount += 1
        if (
          input.pushBehavior === "success" ||
          (input.pushBehavior === "duplicate" && pushCallCount > 1)
        ) {
          return new Response(
            JSON.stringify({
              status: 201,
              success: true,
              data: { id: 555, reference_id: "REF-555" },
            }),
            { status: 201, headers: { "content-type": "application/json" } }
          )
        }
        if (input.pushBehavior === "duplicate") {
          return new Response(
            JSON.stringify({ error: { fields: { external_order_id: ["already used"] } } }),
            { status: 422, headers: { "content-type": "application/json" } }
          )
        }
        return new Response(JSON.stringify({ error: { message: "boom" } }), { status: 500 })
      }

      return new Response("{}", { status: 404 })
    })
  }

  async function connectSallaStore(
    login: { session: { accessToken: string } },
    workspaceId: string
  ) {
    const startResponse = await fetch(`${baseUrl}/v1/integrations/salla/oauth/start`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${login.session.accessToken}`,
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify({ workspaceId, connectionName: "Salla Store" }),
    })
    expect(startResponse.status).toBe(200)
    const started = (await startResponse.json()) as { state: string; connectionId: string }

    const callbackResponse = await fetch(
      `${baseUrl}/v1/integrations/salla/oauth/callback?state=${encodeURIComponent(started.state)}&code=salla-code`,
      { redirect: "manual" }
    )
    expect(callbackResponse.status).toBe(302)
    return started.connectionId
  }

  it("pushes a newly created order to the connected Salla store", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "madar-order-push@madar.test",
      "Push Org"
    )
    const workspaceId = actor.workspaceId!
    await database.query(
      `insert into projects (id, organization_id, workspace_id, owner_user_id, name, status)
       values ($1, $2, $3, $4, 'Push Project', 'active') on conflict (id) do nothing`,
      ["00000000-0000-4000-8000-000000009001", actor.organizationId, workspaceId, actor.userId]
    )

    mockSallaExternalOrders({
      baseUrl,
      accessToken: "salla-access-token",
      refreshToken: "salla-refresh-token",
      pushBehavior: "success",
    })

    await connectSallaStore(login, workspaceId)

    const createResponse = await fetch(`${baseUrl}/v1/orders`, {
      method: "POST",
      headers: authHeaders(login),
      body: JSON.stringify(ORDER_PAYLOAD),
    })
    expect(createResponse.status).toBe(201)
    const created = (await createResponse.json()) as {
      id: string
      sallaPushStatus: string
      sallaOrderId: string | null
    }
    expect(created.sallaPushStatus).toBe("pushed")
    expect(created.sallaOrderId).toBe("555")
  })

  it("retries a failed push and recovers once Salla accepts it", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "madar-order-retry@madar.test",
      "Retry Org"
    )
    const workspaceId = actor.workspaceId!
    await database.query(
      `insert into projects (id, organization_id, workspace_id, owner_user_id, name, status)
       values ($1, $2, $3, $4, 'Retry Project', 'active') on conflict (id) do nothing`,
      ["00000000-0000-4000-8000-000000009002", actor.organizationId, workspaceId, actor.userId]
    )

    const fetchMock = mockSallaExternalOrders({
      baseUrl,
      accessToken: "salla-access-token",
      refreshToken: "salla-refresh-token",
      pushBehavior: "failure",
    })

    await connectSallaStore(login, workspaceId)

    const createResponse = await fetch(`${baseUrl}/v1/orders`, {
      method: "POST",
      headers: authHeaders(login),
      body: JSON.stringify(ORDER_PAYLOAD),
    })
    const created = (await createResponse.json()) as { id: string; sallaPushStatus: string }
    expect(created.sallaPushStatus).toBe("failed")

    fetchMock.mockRestore()
    mockSallaExternalOrders({
      baseUrl,
      accessToken: "salla-access-token",
      refreshToken: "salla-refresh-token",
      pushBehavior: "success",
    })

    const retryResponse = await fetch(`${baseUrl}/v1/orders/${created.id}/retry-push`, {
      method: "POST",
      headers: authHeaders(login),
    })
    expect(retryResponse.status).toBe(200)
    const retried = (await retryResponse.json()) as {
      sallaPushStatus: string
      sallaOrderId: string
    }
    expect(retried.sallaPushStatus).toBe("pushed")
    expect(retried.sallaOrderId).toBe("555")
  })
})

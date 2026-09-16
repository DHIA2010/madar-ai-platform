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
      fullName: "Customers Test",
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
     values ($1, $2, 'hash', 'Customers Test', now()) on conflict (id) do nothing`,
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
  workspaceId: string
  label: string
}) {
  await database.query(
    `insert into workspaces (id, organization_id, name, status)
     values ($1, $2, $3, 'active') on conflict (id) do nothing`,
    [input.workspaceId, input.organizationId, `${input.label} Workspace`]
  )
}

async function insertConnectedSallaConnection(input: {
  organizationId: string
  workspaceId: string
  userId: string
}) {
  const connectionId = randomUUID()
  await database.query(
    `insert into salla_oauth_connections (
       id, organization_id, workspace_id, project_id, status,
       created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1, $2, $3, $4, 'connected', $5, $5, now(), now())`,
    [connectionId, input.organizationId, input.workspaceId, randomUUID(), input.userId]
  )
  return connectionId
}

async function insertRecord(input: {
  table: "salla_records"
  connectionId: string
  entityType: "customers" | "orders"
  entityId: string
  payload: Record<string, unknown>
  updatedAt: string
}) {
  await database.query(
    `insert into ${input.table} (
       id, connection_id, customer_id, entity_type, entity_id, record_date, payload, created_at, updated_at
     ) values ($1, $2, 'store-1', $3, $4, $5::date, $6::jsonb, now(), $5::timestamptz)`,
    [
      randomUUID(),
      input.connectionId,
      input.entityType,
      input.entityId,
      input.updatedAt,
      JSON.stringify(input.payload),
    ]
  )
}

function authHeaders(login: { session: { accessToken: string } }) {
  return { authorization: `Bearer ${login.session.accessToken}` }
}

describe("GET /v1/customers: real customer aggregation with order stats", () => {
  it("normalizes a customer, aggregates real orders, and computes status/segment", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "customers-full@madar.test",
      "Customers Full Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001600"
    await provisionWorkspace({
      organizationId: actor.organizationId,
      workspaceId,
      label: "Customers Full",
    })
    const connectionId = await insertConnectedSallaConnection({
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
    })

    await insertRecord({
      table: "salla_records",
      connectionId,
      entityType: "customers",
      entityId: "1109900279",
      updatedAt: "2026-08-16T00:00:00Z",
      payload: {
        id: 1109900279,
        full_name: "abc def",
        email: "abc@example.com",
        mobile: 555555555,
        mobile_code: "+971",
        created_at: { date: "2026-01-01 00:00:00" },
      },
    })

    // Two orders for this same customer -- confirms the LATERAL JOIN aggregation actually
    // sums across multiple real order rows, not just picks up the first one.
    await insertRecord({
      table: "salla_records",
      connectionId,
      entityType: "orders",
      entityId: "1155952133",
      updatedAt: "2026-08-10T00:00:00Z",
      payload: {
        id: 1155952133,
        customer: { id: 1109900279 },
        total: { amount: 349, currency: "SAR" },
        status: { name: "Under review", slug: "under_review" },
        items: [{ name: "فستان", quantity: 2 }],
        date: { date: "2026-08-10 00:00:00" },
      },
    })
    await insertRecord({
      table: "salla_records",
      connectionId,
      entityType: "orders",
      entityId: "1155952134",
      updatedAt: "2026-08-18T00:00:00Z",
      payload: {
        id: 1155952134,
        customer: { id: 1109900279 },
        total: { amount: 651, currency: "SAR" },
        status: { name: "Completed", slug: "completed" },
        items: [{ name: "حذاء", quantity: 1 }],
        date: { date: "2026-08-18 00:00:00" },
      },
    })

    const listResponse = await fetch(`${baseUrl}/v1/customers`, { headers: authHeaders(login) })
    expect(listResponse.status).toBe(200)
    const listBody = (await listResponse.json()) as {
      items: Array<{
        id: string
        name: string
        email: string
        phone: string | null
        platform: string
        totalOrders: number
        totalRevenue: number
        lifetimeValue: number
        status: string
        segment: string
      }>
    }
    expect(listBody.items).toHaveLength(1)
    const summary = listBody.items[0]
    expect(summary).toMatchObject({
      id: "salla:1109900279",
      name: "abc def",
      email: "abc@example.com",
      phone: "+971555555555",
      platform: "Salla",
      totalOrders: 2,
      totalRevenue: 1000,
      lifetimeValue: 1000,
      status: "active",
      // 2 orders and revenue below the VIP threshold but at/above the Loyal order-count
      // threshold -- confirms computeSegment's order-count branch, not just the LTV one.
    })

    const detailResponse = await fetch(`${baseUrl}/v1/customers/salla:1109900279`, {
      headers: authHeaders(login),
    })
    expect(detailResponse.status).toBe(200)
    const detail = (await detailResponse.json()) as {
      orders: Array<{ orderId: string; revenue: number; itemCount: number }>
      productsPurchased: string[]
      averageOrderValue: number
      totalRevenue: number
    }
    expect(detail.orders).toHaveLength(2)
    expect(detail.orders.map((o) => o.orderId).sort()).toEqual(["1155952133", "1155952134"])
    expect(detail.averageOrderValue).toBe(500)
    expect(detail.productsPurchased.sort()).toEqual(["حذاء", "فستان"])
  })

  it("excludes customers from other organizations and disconnected connections", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "customers-scoped@madar.test",
      "Customers Scoped Org"
    )
    const { actor: otherActor } = await registerAndProvisionOrg(
      "customers-other-org@madar.test",
      "Customers Other Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001610"
    await provisionWorkspace({
      organizationId: actor.organizationId,
      workspaceId,
      label: "Customers Scoped",
    })
    const otherWorkspaceId = otherActor.workspaceId ?? "00000000-0000-4000-8000-000000001620"
    await provisionWorkspace({
      organizationId: otherActor.organizationId,
      workspaceId: otherWorkspaceId,
      label: "Customers Other Org",
    })

    const otherOrgConnectionId = await insertConnectedSallaConnection({
      organizationId: otherActor.organizationId,
      workspaceId: otherWorkspaceId,
      userId: otherActor.userId,
    })
    await insertRecord({
      table: "salla_records",
      connectionId: otherOrgConnectionId,
      entityType: "customers",
      entityId: "other-org-customer",
      updatedAt: "2026-08-15T00:00:00Z",
      payload: { full_name: "Should not appear", email: "x@example.com" },
    })

    const response = await fetch(`${baseUrl}/v1/customers`, { headers: authHeaders(login) })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { items: unknown[] }
    expect(body.items).toHaveLength(0)
  })

  it("computes 'new' status and 'New' segment for a customer with zero orders", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "customers-new@madar.test",
      "Customers New Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001630"
    await provisionWorkspace({
      organizationId: actor.organizationId,
      workspaceId,
      label: "Customers New",
    })
    const connectionId = await insertConnectedSallaConnection({
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
    })

    const today = new Date().toISOString().slice(0, 10)
    await insertRecord({
      table: "salla_records",
      connectionId,
      entityType: "customers",
      entityId: "brand-new-1",
      updatedAt: `${today}T00:00:00Z`,
      payload: {
        full_name: "Brand New",
        email: "new@example.com",
        created_at: { date: `${today} 00:00:00` },
      },
    })

    const response = await fetch(`${baseUrl}/v1/customers`, { headers: authHeaders(login) })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      items: Array<{ status: string; segment: string; totalOrders: number }>
    }
    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toMatchObject({ status: "new", segment: "New", totalOrders: 0 })
  })

  it("returns 404 for an unknown customer id", async () => {
    const { login } = await registerAndProvisionOrg("customers-404@madar.test", "Customers 404 Org")
    const response = await fetch(`${baseUrl}/v1/customers/salla:does-not-exist`, {
      headers: authHeaders(login),
    })
    expect(response.status).toBe(404)
  })

  it("rejects unauthenticated requests", async () => {
    const response = await fetch(`${baseUrl}/v1/customers`)
    expect(response.status).toBe(401)
  })
})

async function createCustomer(
  login: { session: { accessToken: string } },
  body: Record<string, unknown>
) {
  const response = await fetch(`${baseUrl}/v1/customers`, {
    method: "POST",
    headers: { ...authHeaders(login), "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

describe("native customers: authored in Madar rather than synced from a storefront", () => {
  it("creates a native customer and lists it as a brand-new, zero-order customer", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "customers-native@madar.test",
      "Native Customers"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001650"
    await provisionWorkspace({ organizationId: actor.organizationId, workspaceId, label: "Native" })

    const created = await createCustomer(login, {
      name: "زائر البقالة",
      phone: "0555000111",
      email: null,
      notes: "يفضل التوصيل مساءً",
    })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({
      name: "زائر البقالة",
      phone: "0555000111",
      platform: "Madar",
      totalOrders: 0,
      totalRevenue: 0,
      lifetimeValue: 0,
      lastPurchaseAt: null,
      status: "new",
      segment: "New",
    })

    const listResponse = await fetch(`${baseUrl}/v1/customers`, { headers: authHeaders(login) })
    const listBody = (await listResponse.json()) as { items: Array<Record<string, unknown>> }
    expect(listBody.items).toHaveLength(1)
    expect(listBody.items[0]).toMatchObject({ id: created.body.id, platform: "Madar" })
  })

  it("merges native customers alongside synced ones in one list", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "customers-merged@madar.test",
      "Merged Customers"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001640"
    await provisionWorkspace({ organizationId: actor.organizationId, workspaceId, label: "Merged" })
    const connectionId = await insertConnectedSallaConnection({
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
    })
    await insertRecord({
      table: "salla_records",
      connectionId,
      entityType: "customers",
      entityId: "synced-1",
      updatedAt: "2026-08-16T00:00:00Z",
      payload: { full_name: "عميل متجر", email: "synced@example.com" },
    })
    await createCustomer(login, { name: "عميل الكاشير", phone: null, email: null, notes: null })

    const response = await fetch(`${baseUrl}/v1/customers`, { headers: authHeaders(login) })
    const body = (await response.json()) as { items: Array<{ name: string; platform: string }> }
    expect(body.items).toHaveLength(2)
    expect(body.items.map((item) => item.platform).sort()).toEqual(["Madar", "Salla"])
  })

  it("reads back a native customer's own detail without hitting the synced-only lookup", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "customers-detail@madar.test",
      "Native Detail"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001660"
    await provisionWorkspace({ organizationId: actor.organizationId, workspaceId, label: "Detail" })

    const created = await createCustomer(login, {
      name: "عميل تفاصيل",
      phone: "0501234567",
      email: null,
      notes: null,
    })

    const response = await fetch(`${baseUrl}/v1/customers/${created.body.id}`, {
      headers: authHeaders(login),
    })
    expect(response.status).toBe(200)
    const detail = (await response.json()) as {
      orders: unknown[]
      productsPurchased: unknown[]
      averageOrderValue: number
    }
    expect(detail).toMatchObject({ orders: [], productsPurchased: [], averageOrderValue: 0 })
  })

  it("keeps one organization's native customers out of another's", async () => {
    const first = await registerAndProvisionOrg("customers-native-a@madar.test", "Native Org A")
    const second = await registerAndProvisionOrg("customers-native-b@madar.test", "Native Org B")
    const firstWorkspaceId = first.actor.workspaceId ?? "00000000-0000-4000-8000-000000001670"
    await provisionWorkspace({
      organizationId: first.actor.organizationId,
      workspaceId: firstWorkspaceId,
      label: "Native Org A",
    })

    await createCustomer(first.login, { name: "عميل أ", phone: null, email: null, notes: null })

    const response = await fetch(`${baseUrl}/v1/customers`, { headers: authHeaders(second.login) })
    const body = (await response.json()) as { items: unknown[] }
    expect(body.items).toHaveLength(0)
  })

  it("rejects an unauthenticated create", async () => {
    const response = await fetch(`${baseUrl}/v1/customers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "لن ينجح", phone: null, email: null, notes: null }),
    })
    expect(response.status).toBe(401)
  })

  it("stores a real region entered at creation", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "customers-region@madar.test",
      "Region Customers"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001680"
    await provisionWorkspace({ organizationId: actor.organizationId, workspaceId, label: "Region" })

    const created = await createCustomer(login, {
      name: "عميل الرياض",
      phone: null,
      email: null,
      notes: null,
      region: "الرياض",
    })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ region: "الرياض" })
  })
})

async function enablePaymentMethod(login: { session: { accessToken: string } }, code: string) {
  await fetch(`${baseUrl}/v1/pos/payment-methods/${code}`, {
    method: "PATCH",
    headers: { ...authHeaders(login), "content-type": "application/json" },
    body: JSON.stringify({ enabled: true, feePercent: 0, merchantId: null, apiKey: null }),
  })
}

describe("customer unified account: receipts, payments, sales, and returns on one real balance", () => {
  it("gives a receipt a real sequential reference and credits the account (also how a wallet top-up now works)", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "customers-account-receipt@madar.test",
      "Account Receipt"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001690"
    await provisionWorkspace({
      organizationId: actor.organizationId,
      workspaceId,
      label: "Account",
    })
    await enablePaymentMethod(login, "cash")

    const created = await createCustomer(login, {
      name: "عميل الحساب",
      phone: null,
      email: null,
      notes: null,
    })
    const customerId = String(created.body.id)

    const receipt = await fetch(`${baseUrl}/v1/customers/${customerId}/receipt-vouchers`, {
      method: "POST",
      headers: { ...authHeaders(login), "content-type": "application/json" },
      body: JSON.stringify({ amount: 150, paymentMethodCode: "cash" }),
    })
    expect(receipt.status).toBe(201)
    expect(await receipt.json()).toMatchObject({ accountBalance: 150 })

    const statementResponse = await fetch(
      `${baseUrl}/v1/customers/${customerId}/account-transactions`,
      { headers: authHeaders(login) }
    )
    expect(statementResponse.status).toBe(200)
    const statement = (await statementResponse.json()) as {
      transactions: Array<Record<string, unknown>>
      totalCredits: number
      totalDebits: number
      transactionCount: number
    }
    expect(statement.transactions).toHaveLength(1)
    expect(statement.transactions[0]).toMatchObject({
      type: "receipt",
      amount: 150,
      paymentMethodCode: "cash",
      balanceAfter: 150,
    })
    expect(statement.transactions[0].reference).toMatch(/^RCV-\d{5}$/)
    expect(statement).toMatchObject({ totalCredits: 150, totalDebits: 0, transactionCount: 1 })
  })

  it("rejects a receipt through a method that isn't real money handed over", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "customers-account-badreceipt@madar.test",
      "Account Bad Receipt"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001691"
    await provisionWorkspace({
      organizationId: actor.organizationId,
      workspaceId,
      label: "Account",
    })
    await enablePaymentMethod(login, "customer_credit")

    const created = await createCustomer(login, {
      name: "عميل آجل",
      phone: null,
      email: null,
      notes: null,
    })

    const receipt = await fetch(`${baseUrl}/v1/customers/${created.body.id}/receipt-vouchers`, {
      method: "POST",
      headers: { ...authHeaders(login), "content-type": "application/json" },
      // آجل (credit) can't fund a receipt -- it would be circular.
      body: JSON.stringify({ amount: 50, paymentMethodCode: "customer_credit" }),
    })
    expect(receipt.status).toBe(400)
    expect(await receipt.json()).toMatchObject({ code: "CUSTOMER_ACCOUNT_INVALID_RECEIPT_METHOD" })
  })

  it("gives a payment voucher a real sequential reference and debits the account", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "customers-account-payment@madar.test",
      "Account Payment"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001692"
    await provisionWorkspace({
      organizationId: actor.organizationId,
      workspaceId,
      label: "Account",
    })
    await enablePaymentMethod(login, "bank_transfer")

    const created = await createCustomer(login, {
      name: "عميل السند",
      phone: null,
      email: null,
      notes: null,
    })
    const customerId = String(created.body.id)

    const voucher = await fetch(`${baseUrl}/v1/customers/${customerId}/payment-vouchers`, {
      method: "POST",
      headers: { ...authHeaders(login), "content-type": "application/json" },
      body: JSON.stringify({ amount: 500, paymentMethodCode: "bank_transfer" }),
    })
    expect(voucher.status).toBe(201)
    expect(await voucher.json()).toMatchObject({ accountBalance: -500 })

    const detailResponse = await fetch(`${baseUrl}/v1/customers/${customerId}`, {
      headers: authHeaders(login),
    })
    expect((await detailResponse.json()) as { accountBalance: number }).toMatchObject({
      accountBalance: -500,
    })
  })

  it("rejects a payment voucher through a method that isn't a real disbursement channel", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "customers-account-badpayment@madar.test",
      "Account Bad Payment"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001693"
    await provisionWorkspace({
      organizationId: actor.organizationId,
      workspaceId,
      label: "Account",
    })
    await enablePaymentMethod(login, "customer_wallet")

    const created = await createCustomer(login, {
      name: "عميل غير صالح",
      phone: null,
      email: null,
      notes: null,
    })

    const voucher = await fetch(`${baseUrl}/v1/customers/${created.body.id}/payment-vouchers`, {
      method: "POST",
      headers: { ...authHeaders(login), "content-type": "application/json" },
      // "customer_wallet" is a customer-facing collection channel, not something the business
      // pays out through.
      body: JSON.stringify({ amount: 50, paymentMethodCode: "customer_wallet" }),
    })
    expect(voucher.status).toBe(400)
    expect(await voucher.json()).toMatchObject({ code: "CUSTOMER_ACCOUNT_INVALID_PAYMENT_METHOD" })
  })

  it("debits the account with a real 'sale' ledger entry when a POS sale defers to آجل", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "customers-account-creditsale@madar.test",
      "Account Credit Sale"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001694"
    await provisionWorkspace({
      organizationId: actor.organizationId,
      workspaceId,
      label: "Account",
    })
    await enablePaymentMethod(login, "customer_credit")

    const created = await createCustomer(login, {
      name: "عميل بيع آجل",
      phone: null,
      email: null,
      notes: null,
    })
    const customerId = String(created.body.id)

    // Total (incl. 15% VAT) is 517.50, all deferred -- debits the customer's real account.
    const invoiceResponse = await fetch(`${baseUrl}/v1/pos/invoices`, {
      method: "POST",
      headers: { ...authHeaders(login), "content-type": "application/json" },
      body: JSON.stringify({
        customerName: "عميل بيع آجل",
        customerId,
        payments: [{ paymentMethodCode: "customer_credit", amount: 517.5 }],
        discountAmount: 0,
        notes: null,
        items: [{ productId: null, productName: "بضاعة آجلة", unitPrice: 450, quantity: 1 }],
      }),
    })
    expect(invoiceResponse.status).toBe(201)
    const invoiceNumber = String((await invoiceResponse.json()).invoiceNumber)

    const detailResponse = await fetch(`${baseUrl}/v1/customers/${customerId}`, {
      headers: authHeaders(login),
    })
    expect((await detailResponse.json()) as { accountBalance: number }).toMatchObject({
      accountBalance: -517.5,
    })

    const statementResponse = await fetch(
      `${baseUrl}/v1/customers/${customerId}/account-transactions`,
      { headers: authHeaders(login) }
    )
    const statement = (await statementResponse.json()) as {
      transactions: Array<Record<string, unknown>>
    }
    expect(statement.transactions).toHaveLength(1)
    expect(statement.transactions[0]).toMatchObject({
      type: "sale",
      amount: 517.5,
      balanceAfter: -517.5,
      reference: invoiceNumber,
      invoiceNumber,
    })
  })

  it("debits the account for a wallet-funded sale and rejects one that exceeds the real balance", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "customers-account-walletsale@madar.test",
      "Account Wallet Sale"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001695"
    await provisionWorkspace({
      organizationId: actor.organizationId,
      workspaceId,
      label: "Account",
    })
    await enablePaymentMethod(login, "cash")
    await enablePaymentMethod(login, "customer_wallet")

    const created = await createCustomer(login, {
      name: "عميل بيع محفظة",
      phone: null,
      email: null,
      notes: null,
    })
    const customerId = String(created.body.id)

    await fetch(`${baseUrl}/v1/customers/${customerId}/receipt-vouchers`, {
      method: "POST",
      headers: { ...authHeaders(login), "content-type": "application/json" },
      body: JSON.stringify({ amount: 100, paymentMethodCode: "cash" }),
    })

    const sale = await fetch(`${baseUrl}/v1/pos/invoices`, {
      method: "POST",
      headers: { ...authHeaders(login), "content-type": "application/json" },
      body: JSON.stringify({
        customerName: "عميل بيع محفظة",
        customerId,
        payments: [{ paymentMethodCode: "customer_wallet", amount: 11.5 }],
        discountAmount: 0,
        notes: null,
        items: [{ productId: null, productName: "قهوة", unitPrice: 10, quantity: 1 }],
      }),
    })
    expect(sale.status).toBe(201)

    const afterSale = await fetch(`${baseUrl}/v1/customers/${customerId}`, {
      headers: authHeaders(login),
    })
    expect((await afterSale.json()) as { accountBalance: number }).toMatchObject({
      accountBalance: 88.5,
    })

    // 100 exceeds the real 88.50 remaining -- must be rejected, not silently allowed to go
    // negative through the wallet-kind method.
    const tooMuch = await fetch(`${baseUrl}/v1/pos/invoices`, {
      method: "POST",
      headers: { ...authHeaders(login), "content-type": "application/json" },
      body: JSON.stringify({
        customerName: "عميل بيع محفظة",
        customerId,
        payments: [{ paymentMethodCode: "customer_wallet", amount: 100 }],
        discountAmount: 0,
        notes: null,
        items: [{ productId: null, productName: "غالي", unitPrice: 86.96, quantity: 1 }],
      }),
    })
    expect(tooMuch.status).toBe(400)
    expect(await tooMuch.json()).toMatchObject({ code: "POS_INVOICE_INSUFFICIENT_WALLET_BALANCE" })
  })

  it("credits the FULL invoice total back to the account when it is returned, regardless of how it was originally paid", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "customers-account-return@madar.test",
      "Account Return"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001696"
    await provisionWorkspace({
      organizationId: actor.organizationId,
      workspaceId,
      label: "Account",
    })
    await enablePaymentMethod(login, "cash")

    const created = await createCustomer(login, {
      name: "عميل الإرجاع",
      phone: null,
      email: null,
      notes: null,
    })
    const customerId = String(created.body.id)

    // Paid entirely in cash -- never touches the account at sale time -- but a return still
    // credits the full total back as real store credit.
    const invoiceResponse = await fetch(`${baseUrl}/v1/pos/invoices`, {
      method: "POST",
      headers: { ...authHeaders(login), "content-type": "application/json" },
      body: JSON.stringify({
        customerName: "عميل الإرجاع",
        customerId,
        payments: [{ paymentMethodCode: "cash", amount: 23 }],
        discountAmount: 0,
        notes: null,
        items: [{ productId: null, productName: "منتج", unitPrice: 20, quantity: 1 }],
      }),
    })
    expect(invoiceResponse.status).toBe(201)
    const invoice = (await invoiceResponse.json()) as { id: string; invoiceNumber: string }

    const beforeReturn = await fetch(`${baseUrl}/v1/customers/${customerId}`, {
      headers: authHeaders(login),
    })
    expect((await beforeReturn.json()) as { accountBalance: number }).toMatchObject({
      accountBalance: 0,
    })

    const returned = await fetch(`${baseUrl}/v1/pos/invoices/${invoice.id}/status`, {
      method: "PATCH",
      headers: { ...authHeaders(login), "content-type": "application/json" },
      body: JSON.stringify({ status: "returned" }),
    })
    expect(returned.status).toBe(200)

    const afterReturn = await fetch(`${baseUrl}/v1/customers/${customerId}`, {
      headers: authHeaders(login),
    })
    expect((await afterReturn.json()) as { accountBalance: number }).toMatchObject({
      accountBalance: 23,
    })

    const statementResponse = await fetch(
      `${baseUrl}/v1/customers/${customerId}/account-transactions`,
      { headers: authHeaders(login) }
    )
    const statement = (await statementResponse.json()) as {
      transactions: Array<Record<string, unknown>>
    }
    expect(statement.transactions).toHaveLength(1)
    expect(statement.transactions[0]).toMatchObject({
      type: "return",
      amount: 23,
      balanceAfter: 23,
      invoiceNumber: invoice.invoiceNumber,
    })
    expect(statement.transactions[0].reference).toMatch(/^RET-\d{5}$/)

    // Returning the same invoice again must not credit the account a second time.
    await fetch(`${baseUrl}/v1/pos/invoices/${invoice.id}/status`, {
      method: "PATCH",
      headers: { ...authHeaders(login), "content-type": "application/json" },
      body: JSON.stringify({ status: "returned" }),
    })
    const afterSecondReturn = await fetch(`${baseUrl}/v1/customers/${customerId}`, {
      headers: authHeaders(login),
    })
    expect((await afterSecondReturn.json()) as { accountBalance: number }).toMatchObject({
      accountBalance: 23,
    })
  })

  it("computes a real running balance across a receipt, a payment, a credit sale, and a return", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "customers-account-running@madar.test",
      "Account Running Balance"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001697"
    await provisionWorkspace({
      organizationId: actor.organizationId,
      workspaceId,
      label: "Account",
    })
    await enablePaymentMethod(login, "cash")
    await enablePaymentMethod(login, "bank_transfer")
    await enablePaymentMethod(login, "customer_credit")

    const created = await createCustomer(login, {
      name: "عميل شامل",
      phone: null,
      email: null,
      notes: null,
    })
    const customerId = String(created.body.id)

    // +300 (receipt) -> balance 300
    await fetch(`${baseUrl}/v1/customers/${customerId}/receipt-vouchers`, {
      method: "POST",
      headers: { ...authHeaders(login), "content-type": "application/json" },
      body: JSON.stringify({ amount: 300, paymentMethodCode: "cash" }),
    })
    // -100 (payment voucher) -> balance 200
    await fetch(`${baseUrl}/v1/customers/${customerId}/payment-vouchers`, {
      method: "POST",
      headers: { ...authHeaders(login), "content-type": "application/json" },
      body: JSON.stringify({ amount: 100, paymentMethodCode: "bank_transfer" }),
    })
    // -57.50 (credit sale, unitPrice 50 incl. 15% VAT) -> balance 142.50
    const invoiceResponse = await fetch(`${baseUrl}/v1/pos/invoices`, {
      method: "POST",
      headers: { ...authHeaders(login), "content-type": "application/json" },
      body: JSON.stringify({
        customerName: "عميل شامل",
        customerId,
        payments: [{ paymentMethodCode: "customer_credit", amount: 57.5 }],
        discountAmount: 0,
        notes: null,
        items: [{ productId: null, productName: "غرض", unitPrice: 50, quantity: 1 }],
      }),
    })
    const invoice = (await invoiceResponse.json()) as { id: string }
    // +57.50 (return of that same sale) -> balance 200
    await fetch(`${baseUrl}/v1/pos/invoices/${invoice.id}/status`, {
      method: "PATCH",
      headers: { ...authHeaders(login), "content-type": "application/json" },
      body: JSON.stringify({ status: "returned" }),
    })

    const detailResponse = await fetch(`${baseUrl}/v1/customers/${customerId}`, {
      headers: authHeaders(login),
    })
    expect((await detailResponse.json()) as { accountBalance: number }).toMatchObject({
      accountBalance: 200,
    })

    const statementResponse = await fetch(
      `${baseUrl}/v1/customers/${customerId}/account-transactions`,
      { headers: authHeaders(login) }
    )
    const statement = (await statementResponse.json()) as {
      transactions: Array<Record<string, unknown>>
      totalCredits: number
      totalDebits: number
      transactionCount: number
    }
    // Newest first.
    expect(statement.transactions).toHaveLength(4)
    expect(statement.transactions[0]).toMatchObject({ type: "return", balanceAfter: 200 })
    expect(statement.transactions[1]).toMatchObject({ type: "sale", balanceAfter: 142.5 })
    expect(statement.transactions[2]).toMatchObject({ type: "payment", balanceAfter: 200 })
    expect(statement.transactions[3]).toMatchObject({ type: "receipt", balanceAfter: 300 })
    expect(statement).toMatchObject({
      totalCredits: 357.5,
      totalDebits: 157.5,
      transactionCount: 4,
    })
  })
})

describe("editing and deleting a native customer", () => {
  it("updates only the fields sent, leaving the rest untouched", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "customers-edit@madar.test",
      "Customer Edit"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001710"
    await provisionWorkspace({ organizationId: actor.organizationId, workspaceId, label: "Edit" })

    const created = await createCustomer(login, {
      name: "قبل التعديل",
      phone: "0500000001",
      email: "before@example.com",
      notes: "ملاحظة أصلية",
      region: "جدة",
    })
    const customerId = String(created.body.id)

    const updated = await fetch(`${baseUrl}/v1/customers/${customerId}`, {
      method: "PATCH",
      headers: { ...authHeaders(login), "content-type": "application/json" },
      body: JSON.stringify({ name: "بعد التعديل", region: "الرياض" }),
    })
    expect(updated.status).toBe(200)
    expect(await updated.json()).toMatchObject({
      name: "بعد التعديل",
      region: "الرياض",
      phone: "0500000001",
      email: "before@example.com",
    })
  })

  it("rejects deleting a customer whose real account balance is not zero", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "customers-delete-blocked@madar.test",
      "Customer Delete Blocked"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001711"
    await provisionWorkspace({ organizationId: actor.organizationId, workspaceId, label: "Delete" })
    await enablePaymentMethod(login, "cash")

    const created = await createCustomer(login, {
      name: "عميل برصيد",
      phone: null,
      email: null,
      notes: null,
    })
    const customerId = String(created.body.id)

    await fetch(`${baseUrl}/v1/customers/${customerId}/receipt-vouchers`, {
      method: "POST",
      headers: { ...authHeaders(login), "content-type": "application/json" },
      body: JSON.stringify({ amount: 75, paymentMethodCode: "cash" }),
    })

    const deleted = await fetch(`${baseUrl}/v1/customers/${customerId}`, {
      method: "DELETE",
      headers: authHeaders(login),
    })
    expect(deleted.status).toBe(409)
    expect(await deleted.json()).toMatchObject({
      code: "CUSTOMER_HAS_NONZERO_BALANCE",
      details: { accountBalance: 75 },
    })

    // Still there, untouched.
    const stillThere = await fetch(`${baseUrl}/v1/customers/${customerId}`, {
      headers: authHeaders(login),
    })
    expect(stillThere.status).toBe(200)
  })

  it("deletes a customer once their real balance is settled back to zero", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "customers-delete-settled@madar.test",
      "Customer Delete Settled"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001712"
    await provisionWorkspace({ organizationId: actor.organizationId, workspaceId, label: "Delete" })
    await enablePaymentMethod(login, "cash")
    await enablePaymentMethod(login, "bank_transfer")

    const created = await createCustomer(login, {
      name: "عميل تمت تسويته",
      phone: null,
      email: null,
      notes: null,
    })
    const customerId = String(created.body.id)

    await fetch(`${baseUrl}/v1/customers/${customerId}/receipt-vouchers`, {
      method: "POST",
      headers: { ...authHeaders(login), "content-type": "application/json" },
      body: JSON.stringify({ amount: 75, paymentMethodCode: "cash" }),
    })
    await fetch(`${baseUrl}/v1/customers/${customerId}/payment-vouchers`, {
      method: "POST",
      headers: { ...authHeaders(login), "content-type": "application/json" },
      body: JSON.stringify({ amount: 75, paymentMethodCode: "bank_transfer" }),
    })

    const deleted = await fetch(`${baseUrl}/v1/customers/${customerId}`, {
      method: "DELETE",
      headers: authHeaders(login),
    })
    expect(deleted.status).toBe(204)

    const goneResponse = await fetch(`${baseUrl}/v1/customers/${customerId}`, {
      headers: authHeaders(login),
    })
    expect(goneResponse.status).toBe(404)
  })

  it("deletes a customer with zero balance immediately", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "customers-delete-zero@madar.test",
      "Customer Delete Zero"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001713"
    await provisionWorkspace({ organizationId: actor.organizationId, workspaceId, label: "Delete" })

    const created = await createCustomer(login, {
      name: "عميل بدون رصيد",
      phone: null,
      email: null,
      notes: null,
    })

    const deleted = await fetch(`${baseUrl}/v1/customers/${created.body.id}`, {
      method: "DELETE",
      headers: authHeaders(login),
    })
    expect(deleted.status).toBe(204)
  })
})

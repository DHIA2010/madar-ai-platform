// @vitest-environment node
//
// Covers point-of-sale cashier shifts (migration 054): POST /v1/pos/shifts (open),
// PATCH /v1/pos/shifts/:id/close, and GET /v1/pos/shifts (history).

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
      fullName: "Shift Test",
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
     values ($1, $2, 'hash', 'Shift Test', now()) on conflict (id) do nothing`,
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

async function openShift(token: string, body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/v1/pos/shifts`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

async function closeShift(token: string, id: string, body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/v1/pos/shifts/${id}/close`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

async function listShifts(token: string) {
  const response = await fetch(`${baseUrl}/v1/pos/shifts`, { headers: authHeaders(token) })
  return {
    status: response.status,
    body: (await response.json()) as { items: Array<Record<string, unknown>> },
  }
}

async function recordCashMovement(token: string, shiftId: string, body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/v1/pos/shifts/${shiftId}/cash-movements`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

async function listCashMovements(token: string, shiftId: string) {
  const response = await fetch(`${baseUrl}/v1/pos/shifts/${shiftId}/cash-movements`, {
    headers: authHeaders(token),
  })
  return {
    status: response.status,
    body: (await response.json()) as { items: Array<Record<string, unknown>> },
  }
}

async function getShiftDetail(token: string, shiftId: string) {
  const response = await fetch(`${baseUrl}/v1/pos/shifts/${shiftId}/detail`, {
    headers: authHeaders(token),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

async function createInvoice(token: string, body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/v1/pos/invoices`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

async function enablePaymentMethod(token: string, code: string) {
  await fetch(`${baseUrl}/v1/pos/payment-methods/${code}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ enabled: true, feePercent: 0, merchantId: null, apiKey: null }),
  })
}

describe("point-of-sale cashier shifts", () => {
  it("opens a shift with a counted starting float", async () => {
    const { token, actor } = await signIn("shift-open@example.com", "Shift Open")

    const opened = await openShift(token, {
      workspaceId: actor.workspaceId,
      cashierUserId: actor.userId,
      openingCashAmount: 500,
      openingNotes: "بداية الوردية الصباحية",
    })

    expect(opened.status).toBe(201)
    expect(opened.body).toMatchObject({
      workspaceId: actor.workspaceId,
      cashierUserId: actor.userId,
      status: "open",
      openingCashAmount: 500,
      openingNotes: "بداية الوردية الصباحية",
      closingCashAmount: null,
      closedAt: null,
    })
    expect(opened.body.openedAt).not.toBeNull()
  })

  it("refuses a second open shift for the same cashier", async () => {
    const { token, actor } = await signIn("shift-double@example.com", "Shift Double")

    const first = await openShift(token, {
      workspaceId: actor.workspaceId,
      cashierUserId: actor.userId,
      openingCashAmount: 300,
    })
    expect(first.status).toBe(201)

    const second = await openShift(token, {
      workspaceId: actor.workspaceId,
      cashierUserId: actor.userId,
      openingCashAmount: 300,
    })
    expect(second.status).toBe(409)
    expect(second.body).toMatchObject({ code: "POS_SHIFT_ALREADY_OPEN" })
  })

  it("closes an open shift with a counted ending float", async () => {
    const { token, actor } = await signIn("shift-close@example.com", "Shift Close")

    const opened = await openShift(token, {
      workspaceId: actor.workspaceId,
      cashierUserId: actor.userId,
      openingCashAmount: 400,
    })

    const closed = await closeShift(token, String(opened.body.id), {
      closingCashAmount: 650,
      closingNotes: "تسليم الوردية",
    })

    expect(closed.status).toBe(200)
    expect(closed.body).toMatchObject({
      status: "closed",
      closingCashAmount: 650,
      closingNotes: "تسليم الوردية",
    })
    expect(closed.body.closedAt).not.toBeNull()

    // Closing frees the cashier up to open another one.
    const reopened = await openShift(token, {
      workspaceId: actor.workspaceId,
      cashierUserId: actor.userId,
      openingCashAmount: 100,
    })
    expect(reopened.status).toBe(201)
  })

  it("refuses to close an already-closed shift", async () => {
    const { token, actor } = await signIn("shift-reclose@example.com", "Shift Reclose")

    const opened = await openShift(token, {
      workspaceId: actor.workspaceId,
      cashierUserId: actor.userId,
      openingCashAmount: 200,
    })
    await closeShift(token, String(opened.body.id), { closingCashAmount: 200 })

    const secondClose = await closeShift(token, String(opened.body.id), { closingCashAmount: 200 })
    expect(secondClose.status).toBe(409)
    expect(secondClose.body).toMatchObject({ code: "POS_SHIFT_ALREADY_CLOSED" })
  })

  it("lists shifts across every branch, most recent first", async () => {
    const { token, actor } = await signIn("shift-list@example.com", "Shift List")

    const otherWorkspaceId = "22222222-2222-4222-8222-222222222222"
    await database.query(
      `insert into workspaces (id, organization_id, name, status)
       values ($1, $2, 'Second Branch', 'active')`,
      [otherWorkspaceId, actor.organizationId]
    )

    await openShift(token, {
      workspaceId: actor.workspaceId,
      cashierUserId: actor.userId,
      openingCashAmount: 100,
    })
    await database.query(`update pos_shifts set status = 'closed'`)
    const second = await openShift(token, {
      workspaceId: otherWorkspaceId,
      cashierUserId: actor.userId,
      openingCashAmount: 200,
    })

    const list = await listShifts(token)
    expect(list.body.items).toHaveLength(2)
    expect(list.body.items[0]).toMatchObject({ id: second.body.id, workspaceId: otherWorkspaceId })
  })

  it("keeps one organization's shifts out of another's", async () => {
    const first = await signIn("shift-org-a@example.com", "Shift Org A")
    const second = await signIn("shift-org-b@example.com", "Shift Org B")

    await openShift(first.token, {
      workspaceId: first.actor.workspaceId,
      cashierUserId: first.actor.userId,
      openingCashAmount: 100,
    })

    expect((await listShifts(second.token)).body.items).toHaveLength(0)
  })

  it("records a cash withdrawal and deposit against an open shift", async () => {
    const { token, actor } = await signIn("shift-cash-movement@example.com", "Shift Cash Movement")

    const opened = await openShift(token, {
      workspaceId: actor.workspaceId,
      cashierUserId: actor.userId,
      openingCashAmount: 200,
    })
    const shiftId = String(opened.body.id)

    const withdrawal = await recordCashMovement(token, shiftId, {
      type: "withdrawal",
      amount: 50,
      note: "سحب للبنك",
    })
    expect(withdrawal.status).toBe(201)
    expect(withdrawal.body).toMatchObject({ type: "withdrawal", amount: 50, note: "سحب للبنك" })

    const deposit = await recordCashMovement(token, shiftId, { type: "deposit", amount: 20 })
    expect(deposit.status).toBe(201)
    expect(deposit.body).toMatchObject({ type: "deposit", amount: 20, note: null })

    const list = await listCashMovements(token, shiftId)
    expect(list.body.items).toHaveLength(2)
  })

  it("refuses a cash movement against a closed shift", async () => {
    const { token, actor } = await signIn("shift-cash-closed@example.com", "Shift Cash Closed")

    const opened = await openShift(token, {
      workspaceId: actor.workspaceId,
      cashierUserId: actor.userId,
      openingCashAmount: 100,
    })
    await closeShift(token, String(opened.body.id), { closingCashAmount: 100 })

    const movement = await recordCashMovement(token, String(opened.body.id), {
      type: "withdrawal",
      amount: 10,
    })
    expect(movement.status).toBe(409)
    expect(movement.body).toMatchObject({ code: "POS_SHIFT_NOT_OPEN" })
  })

  it("assigns a real sequential shift number", async () => {
    const { token, actor } = await signIn("shift-number@example.com", "Shift Number")

    const first = await openShift(token, {
      workspaceId: actor.workspaceId,
      cashierUserId: actor.userId,
      openingCashAmount: 100,
    })
    expect(typeof first.body.shiftNumber).toBe("number")
    expect(first.body.shiftNumber).toBeGreaterThan(0)
  })

  it("builds a real shift detail: payment breakdown, cash summary, and activity log", async () => {
    const { token, actor } = await signIn("shift-detail@example.com", "Shift Detail")
    await enablePaymentMethod(token, "mada")

    const opened = await openShift(token, {
      workspaceId: actor.workspaceId,
      cashierUserId: actor.userId,
      openingCashAmount: 100,
    })
    const shiftId = String(opened.body.id)

    // Cash sale (115 total), card sale (230 total), and a cash sale later returned (46 total) --
    // the same numbers already proven correct against the real API for the close dialog.
    await createInvoice(token, {
      customerName: null,
      payments: [{ paymentMethodCode: "cash", amount: 115 }],
      discountAmount: 0,
      items: [{ productId: null, productName: "قهوة", unitPrice: 100, quantity: 1 }],
    })
    await createInvoice(token, {
      customerName: null,
      payments: [{ paymentMethodCode: "mada", amount: 230 }],
      discountAmount: 0,
      items: [{ productId: null, productName: "كيك", unitPrice: 200, quantity: 1 }],
    })
    const toReturn = await createInvoice(token, {
      customerName: null,
      payments: [{ paymentMethodCode: "cash", amount: 46 }],
      discountAmount: 0,
      items: [{ productId: null, productName: "شاي", unitPrice: 40, quantity: 1 }],
    })
    // A real, itemized return event (see PosInvoicesService.createReturn()) -- returning the
    // line's own full quantity is what makes the invoice end up "returned" exactly the way the
    // old blunt status PATCH used to, so this shift-detail math is otherwise unaffected.
    const toReturnItem = (toReturn.body.items as Array<{ id: string; quantity: number }>)[0]
    await fetch(`${baseUrl}/v1/pos/invoices/${toReturn.body.id}/returns`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        items: [{ invoiceItemId: toReturnItem.id, quantity: toReturnItem.quantity }],
        paymentMethodCode: "cash",
        notes: null,
      }),
    })

    await recordCashMovement(token, shiftId, { type: "withdrawal", amount: 25, note: null })
    await recordCashMovement(token, shiftId, { type: "deposit", amount: 10, note: null })

    const detail = await getShiftDetail(token, shiftId)
    expect(detail.status).toBe(200)
    expect(detail.body).toMatchObject({
      totalSales: 345, // 115 + 230, the returned invoice excluded
      invoiceCount: 3, // includes the returned one -- it is still a real invoice that happened
      cashSummary: {
        openingCashAmount: 100,
        cashSales: 115,
        otherSales: 230,
        cashReturns: 46,
        withdrawals: 25,
        deposits: 10,
        // 100 + 115 - 46 - 25 + 10
        expectedCashAmount: 154,
      },
    })

    const breakdown = detail.body.paymentBreakdown as Array<Record<string, unknown>>
    expect(breakdown).toHaveLength(2)
    const cashEntry = breakdown.find((entry) => entry.code === "cash")
    const madaEntry = breakdown.find((entry) => entry.code === "mada")
    expect(cashEntry).toMatchObject({ amount: 115 })
    expect(madaEntry).toMatchObject({ amount: 230 })

    // Activity: opening float, both cash movements, and every real invoice (sale or return),
    // most recent first (no close yet).
    const activity = detail.body.activity as Array<Record<string, unknown>>
    expect(activity.map((entry) => entry.type)).toEqual([
      "deposit",
      "withdrawal",
      "return",
      "sale",
      "sale",
      "open",
    ])

    const returnEntry = activity.find((entry) => entry.type === "return")
    expect(returnEntry).toMatchObject({
      amount: 46,
      reference: String(toReturn.body.invoiceNumber),
    })
  })

  it("refuses an unauthenticated read", async () => {
    expect((await fetch(`${baseUrl}/v1/pos/shifts`)).status).toBe(401)
  })
})

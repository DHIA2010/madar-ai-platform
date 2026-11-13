// @vitest-environment node
//
// The Invoicing app (migration 164): quotations, converting them to invoices in full, by line or
// by progress claim, advance payments deducted later, retention, issuing (without a ZATCA device),
// credit notes, payments, the customer's public link, and the app's subscription gate.

import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
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
      fullName: "Invoicing Test",
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
     values ($1, $2, 'hash', 'Invoicing Test', now()) on conflict (id) do nothing`,
    [actor.userId, email]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status, settings)
     values ($1, $2, $3, 'active', '{"posEnabled": true, "ecommerceEnabled": true, "advertisingEnabled": true}'::jsonb) on conflict (id) do nothing`,
    [actor.organizationId, orgName, actor.userId]
  )
  if (actor.workspaceId) {
    await database.query(
      `insert into workspaces (id, organization_id, name, status)
       values ($1, $2, $3, 'active') on conflict (id) do nothing`,
      [actor.workspaceId, actor.organizationId, `${orgName} Workspace`]
    )
  }

  await mergeOrgSettings(actor.organizationId, { invoicingEnabled: true })

  return { token: login.session.accessToken, actor }
}

// pg-mem's jsonb `||` doesn't handle a cast parameter -- read, merge in JS and overwrite.
async function mergeOrgSettings(organizationId: string, patch: Record<string, unknown>) {
  const existing = await database.query<{ settings: Record<string, unknown> }>(
    "select settings from organizations where id = $1",
    [organizationId]
  )
  const merged = { ...(existing.rows[0]?.settings ?? {}), ...patch }
  await database.query("update organizations set settings = $2::jsonb where id = $1", [
    organizationId,
    JSON.stringify(merged),
  ])
}

function authHeaders(token: string) {
  return { "content-type": "application/json", authorization: `Bearer ${token}` }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- bodies are asserted field by field
async function call<T = any>(method: string, path: string, token: string | null, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: token ? authHeaders(token) : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as T }
}

const BUYER = {
  name: "شركة البناء المتقدم",
  vatNumber: "300000000000003",
  address: {
    street: "طريق الملك فهد",
    buildingNumber: "1234",
    secondaryNumber: "5678",
    district: "العليا",
    city: "الرياض",
    postalCode: "12345",
    countryCode: "SA",
  },
}

const line = (description: string, quantity: number, unitPrice: number, extra = {}) => ({
  lineType: "item",
  description,
  unit: "م²",
  quantity,
  unitPrice,
  ...extra,
})

function quotation(extra: Record<string, unknown> = {}) {
  return {
    sector: "contracting",
    customer: BUYER,
    title: "أعمال الهيكل الخرساني",
    issueDate: "2026-11-01",
    validUntil: "2099-12-31",
    retentionPercent: 10,
    advancePercent: 20,
    lines: [
      { lineType: "section", description: "الأعمال الإنشائية" },
      line("صب خرسانة", 100, 200),
      line("حديد تسليح", 10, 1000, { discountPercent: 10 }),
      { lineType: "note", description: "الأسعار تشمل التوريد والتركيب" },
    ],
    ...extra,
  }
}

describe("invoicing: quotations and B2B invoices", () => {
  it("computes a quotation's totals, revises it and answers it from the customer's link", async () => {
    const { token } = await signIn("q@shop.test", "Builders")
    const created = await call("POST", "/v1/invoicing/quotations", token, {
      ...quotation(),
      discountType: "amount",
      discountValue: 1000,
    })
    expect(created.status).toBe(201)
    expect(created.body.number).toBe("QT-000001")
    // 100×200 + 10×1000×0.9 = 29,000; less 1,000 = 28,000; VAT 4,200.
    expect(created.body.subtotal).toBe(29000)
    expect(created.body.taxableAmount).toBe(28000)
    expect(created.body.taxAmount).toBe(4200)
    expect(created.body.totalAmount).toBe(32200)
    expect(created.body.lines).toHaveLength(4)

    // A draft isn't on the customer's link yet.
    const hidden = await call("GET", `/v1/public/quotations/${created.body.publicToken}`, null)
    expect(hidden.status).toBe(404)

    await call("POST", `/v1/invoicing/quotations/${created.body.id}/status`, token, {
      status: "sent",
    })
    const revised = await call("POST", `/v1/invoicing/quotations/${created.body.id}/revise`, token)
    expect(revised.status).toBe(201)
    expect(revised.body.number).toBe("QT-000001")
    expect(revised.body.revision).toBe(2)
    expect(revised.body.revisions.map((r: { status: string }) => r.status)).toEqual([
      "superseded",
      "draft",
    ])
    const list = await call("GET", "/v1/invoicing/quotations", token)
    expect(list.body.items).toHaveLength(1)

    await call("POST", `/v1/invoicing/quotations/${revised.body.id}/status`, token, {
      status: "sent",
    })
    const accepted = await call(
      "POST",
      `/v1/public/quotations/${revised.body.publicToken}/respond`,
      null,
      {
        action: "accept",
        name: "م. خالد",
      }
    )
    expect(accepted.status).toBe(200)
    expect(accepted.body.status).toBe("accepted")
    expect(accepted.body.respondedBy).toBe("م. خالد")
    expect(accepted.body.canRespond).toBe(false)

    // Accepted: changes go into a revision.
    const locked = await call(
      "PUT",
      `/v1/invoicing/quotations/${revised.body.id}`,
      token,
      quotation()
    )
    expect(locked.status).toBe(409)
  })

  it("bills a contract by advance, progress claims and retention, then credits and collects it", async () => {
    const { token } = await signIn("c@shop.test", "Contractor")
    const q = (await call("POST", "/v1/invoicing/quotations", token, quotation())).body
    const [, concrete, steel] = q.lines

    // Advance payment: 20% of the contract before VAT.
    const advance = await call("POST", "/v1/invoicing/invoices", token, {
      sector: "contracting",
      invoiceKind: "advance",
      quotationId: q.id,
      customer: BUYER,
      issueDate: "2026-11-02",
      lines: [line("دفعة مقدمة 20%", 1, 5800)],
    })
    expect(advance.status).toBe(201)
    const issuedAdvance = await call(
      "POST",
      `/v1/invoicing/invoices/${advance.body.id}/issue`,
      token
    )
    expect(issuedAdvance.status).toBe(200)
    expect(issuedAdvance.body.status).toBe("issued")
    expect(issuedAdvance.body.number).toBe("SI-000001")
    expect(issuedAdvance.body.zatca.status).toBeNull()

    // Claim 1: 40% of the works, deducting 40% of the advance, holding 10% back.
    const claim = await call("POST", "/v1/invoicing/invoices", token, {
      sector: "contracting",
      invoiceKind: "progress",
      quotationId: q.id,
      customer: BUYER,
      issueDate: "2026-11-10",
      retentionPercent: 10,
      dueDate: "2026-12-10",
      lines: [
        line("صب خرسانة", 40, 200, {
          quotationLineId: concrete.id,
          progressPrevious: 0,
          progressCurrent: 40,
        }),
        line("حديد تسليح", 4, 1000, {
          discountPercent: 10,
          quotationLineId: steel.id,
          progressPrevious: 0,
          progressCurrent: 40,
        }),
      ],
      prepayments: [{ advanceInvoiceId: advance.body.id, netAmount: 2320 }],
    })
    expect(claim.status).toBe(201)
    // 8,000 + 3,600 = 11,600; VAT 1,740 = 13,340; advance 2,320 + 348 = 2,668; retention 1,160.
    expect(claim.body.claimNumber).toBe(1)
    expect(claim.body.totalAmount).toBe(13340)
    expect(claim.body.prepaidAmount).toBe(2668)
    expect(claim.body.retentionAmount).toBe(1160)
    expect(claim.body.amountDue).toBe(9512)

    const detail = await call("GET", `/v1/invoicing/quotations/${q.id}`, token)
    expect(detail.body.billedPercent).toBe(40)
    expect(detail.body.billingStatus).toBe("partial")
    expect(detail.body.advanceBilledAmount).toBe(5800)
    expect(detail.body.lines[1].billedPercent).toBe(40)

    // More than the contract's quantity is refused.
    const over = await call("POST", "/v1/invoicing/invoices", token, {
      quotationId: q.id,
      customer: BUYER,
      issueDate: "2026-11-11",
      lines: [line("صب خرسانة", 61, 200, { quotationLineId: concrete.id })],
    })
    expect(over.status).toBe(422)
    expect(over.body.code).toBe("QUOTATION_OVERBILLED")

    const issued = await call("POST", `/v1/invoicing/invoices/${claim.body.id}/issue`, token)
    expect(issued.body.status).toBe("issued")
    expect(issued.body.balance).toBe(9512)
    expect(issued.body.paymentStatus).toBe("unpaid")

    // An issued invoice is locked: corrections are notes.
    const edit = await call("PUT", `/v1/invoicing/invoices/${claim.body.id}`, token, {
      customer: BUYER,
      issueDate: "2026-11-10",
      lines: [line("x", 1, 1)],
    })
    expect(edit.status).toBe(409)

    const note = await call("POST", `/v1/invoicing/invoices/${claim.body.id}/notes`, token, {
      documentType: "credit_note",
      reasonCode: "price_amendment",
      reason: "خصم متفق عليه",
      lines: [line("تعديل سعر الخرسانة", 1, 1000)],
    })
    expect(note.status).toBe(201)
    // The note lives in its invoice's workspace, so that workspace's ZATCA device signs it.
    const homes = await database.query<{ workspace_id: string | null }>(
      "select workspace_id from sales_invoices where id = $1 or id = $2",
      [claim.body.id, note.body.id]
    )
    expect(homes.rows).toHaveLength(2)
    expect(homes.rows[0].workspace_id).not.toBeNull()
    expect(homes.rows[1].workspace_id).toBe(homes.rows[0].workspace_id)
    const issuedNote = await call("POST", `/v1/invoicing/invoices/${note.body.id}/issue`, token)
    expect(issuedNote.body.number).toBe("CN-000001")
    expect(issuedNote.body.originalInvoiceNumber).toBe("SI-000002")

    const paid = await call("POST", `/v1/invoicing/invoices/${claim.body.id}/payments`, token, {
      amount: 5000,
      paidOn: "2026-11-15",
      method: "bank_transfer",
    })
    expect(paid.status).toBe(201)
    // 9,512 - credit 1,150 - paid 5,000.
    expect(paid.body.balance).toBe(3362)
    expect(paid.body.paymentStatus).toBe("partial")
    const tooMuch = await call("POST", `/v1/invoicing/invoices/${claim.body.id}/payments`, token, {
      amount: 4000,
      paidOn: "2026-11-16",
    })
    expect(tooMuch.status).toBe(422)

    const advances = await call("GET", "/v1/invoicing/invoices/advances", token)
    expect(advances.body.items[0].remainingNet).toBe(3480)

    const publicView = await call(
      "GET",
      `/v1/public/sales-invoices/${claim.body.publicToken}`,
      null
    )
    expect(publicView.status).toBe(200)
    expect(publicView.body.number).toBe("SI-000002")

    const summary = await call("GET", "/v1/invoicing/invoices/summary", token)
    expect(summary.body.outstanding).toBe(3362 + 6670)
  })

  it("refuses a standard invoice to a buyer without VAT number or national address", async () => {
    const { token } = await signIn("b@shop.test", "Services")
    const draft = await call("POST", "/v1/invoicing/invoices", token, {
      sector: "services",
      customer: { name: "عميل", address: { city: "الرياض" } },
      issueDate: "2026-11-10",
      lines: [line("استشارات", 10, 500, { unit: "ساعة" })],
    })
    expect(draft.status).toBe(201)
    const refused = await call("POST", `/v1/invoicing/invoices/${draft.body.id}/issue`, token)
    expect(refused.status).toBe(422)
    expect(refused.body.code).toBe("SALES_INVOICE_BUYER_INCOMPLETE")
    expect(refused.body.details.fields).toEqual(
      expect.arrayContaining([
        "vatNumberOrId",
        "street",
        "buildingNumber",
        "district",
        "postalCode",
      ])
    )
    const still = await call("GET", `/v1/invoicing/invoices/${draft.body.id}`, token)
    expect(still.body.status).toBe("draft")
    expect(still.body.number).toBeNull()

    // A simplified invoice to an individual needs none of it.
    const simplified = await call("POST", "/v1/invoicing/invoices", token, {
      taxType: "simplified",
      customer: { name: "" },
      issueDate: "2026-11-10",
      lines: [
        line("استشارات", 2, 500),
        line("رسوم حكومية", 1, 100, {
          taxCategory: "O",
          exemptionCode: "VATEX-SA-OOS",
          exemptionReason: "خارج النطاق",
        }),
      ],
    })
    expect(simplified.body.taxAmount).toBe(150)
    expect(simplified.body.totalAmount).toBe(1250)
    const issued = await call("POST", `/v1/invoicing/invoices/${simplified.body.id}/issue`, token)
    expect(issued.body.status).toBe("issued")

    const missingReason = await call("POST", "/v1/invoicing/invoices", token, {
      customer: BUYER,
      issueDate: "2026-11-10",
      lines: [line("تصدير", 1, 100, { taxCategory: "Z" })],
    })
    expect(missingReason.status).toBe(422)
    expect(missingReason.body.code).toBe("INVOICING_EXEMPTION_REASON_REQUIRED")
  })

  it("answers only for an organization subscribed to the app", async () => {
    const { token, actor } = await signIn("g@shop.test", "NoApp")
    await mergeOrgSettings(actor.organizationId, { invoicingEnabled: false })
    const refused = await call("GET", "/v1/invoicing/quotations", token)
    expect(refused.status).toBe(403)
    expect(refused.body.code).toBe("APPLICATION_NOT_SUBSCRIBED")
  })
})

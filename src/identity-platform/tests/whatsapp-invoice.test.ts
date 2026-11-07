// @vitest-environment node

// Covers sending a POS invoice on WhatsApp (whatsapp/invoice-sender.ts): the phone number forms,
// the PDF, the Cloud API calls (template check, media upload, template message -- stubbed), the
// record of each send and its status from Meta's webhook, the daily cap, and submitting the
// template for review.
import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { renderInvoicePdf } from "../pdf/invoice-pdf"
import type { InvoiceView, PosInvoicesService } from "../pos/invoices-service"
import type { PosPaymentMethodsService } from "../pos/payment-methods-service"
import {
  applyWhatsAppStatuses,
  DAILY_INVOICE_MESSAGES_PER_ORGANIZATION,
  toWhatsAppNumber,
  WhatsAppInvoiceSender,
} from "../whatsapp/invoice-sender"
import { WhatsAppPlatformService } from "../whatsapp/platform-config"
import { WhatsAppTemplatesService } from "../whatsapp/templates"

const organizationId = "20000000-0000-0000-0000-000000000001"
const invoiceId = "40000000-0000-0000-0000-000000000001"
let database: PostgresDatabase
let sender: WhatsAppInvoiceSender
let templates: WhatsAppTemplatesService

const invoice = {
  id: invoiceId,
  workspaceId: "30000000-0000-0000-0000-000000000001",
  invoiceNumber: "INV-000068",
  orderNumber: null,
  createdAt: "2026-11-07T10:00:00.000Z",
  customerName: "عبدالله",
  customerPhone: "0501234567",
  customerVatNumber: null,
  items: [
    {
      productName: "قهوة",
      quantity: 2,
      unitPrice: 25,
      lineTotal: 57.5,
      netAmount: 50,
      taxAmount: 7.5,
    },
  ],
  subtotalAmount: 50,
  discountAmount: 0,
  taxAmount: 7.5,
  totalAmount: 57.5,
  payments: [{ paymentMethodCode: "mada", amount: 57.5 }],
  qrCode: "AQZNYWRhcg==",
  sellerName: "متجر الريم",
  sellerVatNumber: "300000000000003",
  sellerAddress: "الرياض",
  notes: null,
} as unknown as InvoiceView

interface Call {
  path: string
  body: unknown
}

// Meta's Graph API: template status, media upload, message send (and the template submit flow).
function stubMeta(options: { templateStatus?: string; sendFails?: boolean } = {}) {
  const calls: Call[] = []
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const body = init?.body instanceof FormData ? "form" : init?.body ? String(init.body) : null
    calls.push({ path: url.pathname, body })
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
    if (url.pathname.endsWith("/message_templates") && (init?.method ?? "GET") === "GET") {
      return json({
        data: [
          {
            name: "madar_pos_invoice",
            language: "ar",
            status: options.templateStatus ?? "APPROVED",
          },
        ],
      })
    }
    if (url.pathname.endsWith("/media")) return json({ id: "media-1" })
    if (url.pathname.endsWith("/messages")) {
      return options.sendFails
        ? json({ error: { message: "Recipient phone number not on WhatsApp" } }, 400)
        : json({ messages: [{ id: "wamid.1" }] })
    }
    if (url.pathname.endsWith("/uploads")) return json({ id: "upload:abc" })
    if (url.pathname.endsWith("/upload:abc")) return json({ h: "handle-1" })
    if (url.pathname.endsWith("/message_templates")) return json({ id: "t1", status: "PENDING" })
    return json({})
  })
  return calls
}

beforeEach(async () => {
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"
  const mem = newDb({ autoCreateForeignKeyIndices: true })
  database = new PostgresDatabase(new (mem.adapters.createPg().Pool)())
  await runIdentityMigrations(database, process.cwd())
  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ('10000000-0000-0000-0000-000000000001', 'o@x.com', 'h', 'Owner', now())`
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id)
     values ($1, 'Org', '10000000-0000-0000-0000-000000000001')`,
    [organizationId]
  )
  const platform = new WhatsAppPlatformService(database, {
    load: async () => ({
      appId: "1592",
      appSecret: "secret",
      accessToken: "EAAG-token",
      wabaId: "4569",
      phoneNumberId: "1390",
      apiVersion: "v26.0",
    }),
  })
  templates = new WhatsAppTemplatesService(platform)
  sender = new WhatsAppInvoiceSender(
    database,
    platform,
    templates,
    {
      get: async (_org: string, id: string) => (id === invoiceId ? invoice : null),
    } as unknown as PosInvoicesService,
    { list: async () => [{ code: "mada", name: "مدى" }] } as unknown as PosPaymentMethodsService
  )
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.end()
})

describe("toWhatsAppNumber", () => {
  it("turns Saudi local and international forms into digits with the country code", () => {
    expect(toWhatsAppNumber("0501234567")).toBe("966501234567")
    expect(toWhatsAppNumber("501234567")).toBe("966501234567")
    expect(toWhatsAppNumber("+966 50 123 4567")).toBe("966501234567")
    expect(toWhatsAppNumber("00966501234567")).toBe("966501234567")
    expect(toWhatsAppNumber("9660501234567")).toBe("966501234567")
    expect(toWhatsAppNumber("+201001234567")).toBe("201001234567")
    expect(toWhatsAppNumber("12345")).toBeNull()
    expect(toWhatsAppNumber("966112345678")).toBeNull()
  })
})

describe("renderInvoicePdf", () => {
  it("produces a PDF", () => {
    const pdf = renderInvoicePdf({
      ...invoice,
      payments: [{ label: "مدى", amount: 57.5 }],
    })
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-")
    expect(pdf.length).toBeGreaterThan(10_000)
  })
})

describe("WhatsAppInvoiceSender", () => {
  it("uploads the PDF, sends the approved template and records the send", async () => {
    const calls = stubMeta()
    const sent = await sender.sendInvoice({
      organizationId,
      invoiceId,
      phone: "0501234567",
      actorUserId: null,
    })
    expect(sent).toMatchObject({ toPhone: "966501234567", status: "sent", error: null })
    expect(calls.map((call) => call.path)).toEqual([
      "/v26.0/4569/message_templates",
      "/v26.0/1390/media",
      "/v26.0/1390/messages",
    ])
    const message = JSON.parse(String(calls[2].body))
    expect(message).toMatchObject({
      to: "966501234567",
      type: "template",
      template: { name: "madar_pos_invoice", language: { code: "ar" } },
    })
    expect(message.template.components[0].parameters[0].document).toEqual({
      id: "media-1",
      filename: "INV-000068.pdf",
    })
    expect(message.template.components[1].parameters.map((p: { text: string }) => p.text)).toEqual([
      "عبدالله",
      "متجر الريم",
      "INV-000068",
      "57.50 ر.س",
    ])

    // Meta's webhook: delivered, then read; a late "delivered" doesn't undo "read".
    const status = (value: string) => ({
      entry: [{ changes: [{ value: { statuses: [{ id: "wamid.1", status: value }] } }] }],
    })
    await applyWhatsAppStatuses(database, status("delivered"))
    await applyWhatsAppStatuses(database, status("read"))
    await applyWhatsAppStatuses(database, status("delivered"))
    expect((await sender.listSends(organizationId, invoiceId))[0].status).toBe("read")
  })

  it("keeps a refused send as failed with Meta's reason", async () => {
    stubMeta({ sendFails: true })
    await expect(
      sender.sendInvoice({ organizationId, invoiceId, phone: "0501234567", actorUserId: null })
    ).rejects.toMatchObject({ code: "WHATSAPP_REJECTED" })
    const [failed] = await sender.listSends(organizationId, invoiceId)
    expect(failed).toMatchObject({
      status: "failed",
      error: "Recipient phone number not on WhatsApp",
    })
  })

  it("refuses a bad number, an unapproved template and going over the daily cap", async () => {
    stubMeta({ templateStatus: "PENDING" })
    await expect(
      sender.sendInvoice({ organizationId, invoiceId, phone: "123", actorUserId: null })
    ).rejects.toMatchObject({ code: "WHATSAPP_INVALID_PHONE" })
    await expect(
      sender.sendInvoice({ organizationId, invoiceId, phone: "0501234567", actorUserId: null })
    ).rejects.toMatchObject({ code: "WHATSAPP_TEMPLATE_NOT_READY" })

    for (let index = 0; index < DAILY_INVOICE_MESSAGES_PER_ORGANIZATION; index++) {
      await database.query(
        `insert into whatsapp_messages (id, organization_id, kind, to_phone, template_name, status)
         values ($2, $1, 'pos_invoice', '966500000000', 'madar_pos_invoice', 'sent')`,
        [organizationId, randomUUID()]
      )
    }
    await expect(
      sender.sendInvoice({ organizationId, invoiceId, phone: "0501234567", actorUserId: null })
    ).rejects.toMatchObject({ code: "WHATSAPP_DAILY_LIMIT" })
  })
})

describe("WhatsAppTemplatesService.submit", () => {
  it("uploads a sample PDF and submits the template with it", async () => {
    const calls = stubMeta({ templateStatus: "PENDING" })
    const status = await templates.submit("madar_pos_invoice")
    expect(status.status).toBe("PENDING")
    const create = calls.find((call) => call.path === "/v26.0/4569/message_templates" && call.body)
    const body = JSON.parse(String(create?.body))
    expect(body).toMatchObject({ name: "madar_pos_invoice", language: "ar", category: "UTILITY" })
    expect(body.components[0]).toEqual({
      type: "HEADER",
      format: "DOCUMENT",
      example: { header_handle: ["handle-1"] },
    })
    expect(calls.some((call) => call.path === "/v26.0/1592/uploads")).toBe(true)
  })
})

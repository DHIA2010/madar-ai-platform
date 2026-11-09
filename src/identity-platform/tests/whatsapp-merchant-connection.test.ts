// @vitest-environment node

// Covers how an organization sends WhatsApp to its customers (whatsapp/merchant-connection.ts):
// WhatsApp Web by default, or its own business number connected through Meta's Embedded Signup --
// the code exchange, webhook subscription, number registration and invoice template on the
// merchant's own account (Meta stubbed), and invoices then going out from that number.
import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import type { PosInvoicesService } from "../pos/invoices-service"
import type { PosPaymentMethodsService } from "../pos/payment-methods-service"
import { WhatsAppInvoiceSender } from "../whatsapp/invoice-sender"
import { WhatsAppMerchantConnectionService } from "../whatsapp/merchant-connection"
import { WhatsAppPlatformService } from "../whatsapp/platform-config"
import { WhatsAppTemplatesService } from "../whatsapp/templates"

const organizationId = "20000000-0000-0000-0000-000000000001"
const userId = "10000000-0000-0000-0000-000000000001"
const invoiceId = "40000000-0000-0000-0000-000000000001"
let database: PostgresDatabase
let platform: WhatsAppPlatformService
let connections: WhatsAppMerchantConnectionService

interface Call {
  method: string
  path: string
  search: string
  authorization: string | null
}

function stubMeta(options: { registerFails?: boolean } = {}) {
  const calls: Call[] = []
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const method = init?.method ?? "GET"
    const headers = (init?.headers ?? {}) as Record<string, string>
    calls.push({
      method,
      path: url.pathname,
      search: url.search,
      authorization: headers.Authorization ?? headers.authorization ?? null,
    })
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
    if (url.pathname.endsWith("/oauth/access_token")) {
      return json({ access_token: "EAAB-merchant-token", token_type: "bearer" })
    }
    if (url.pathname.endsWith("/register")) {
      return options.registerFails
        ? json({ error: { message: "Two-step verification PIN mismatch" } }, 400)
        : json({ success: true })
    }
    if (url.pathname.endsWith("/subscribed_apps")) return json({ success: true })
    if (url.pathname.endsWith("/8800") && method === "GET") {
      return json({
        id: "8800",
        display_phone_number: "+966 50 111 2222",
        verified_name: "متجر الورد",
        quality_rating: "GREEN",
      })
    }
    if (url.pathname.endsWith("/message_templates") && method === "GET") {
      return json({ data: [{ name: "madar_pos_invoice", language: "ar", status: "APPROVED" }] })
    }
    if (url.pathname.endsWith("/uploads")) return json({ id: "upload:abc" })
    if (url.pathname.endsWith("/upload:abc")) return json({ h: "handle-1" })
    if (url.pathname.endsWith("/message_templates")) return json({ id: "t1", status: "PENDING" })
    if (url.pathname.endsWith("/media")) return json({ id: "media-1" })
    if (url.pathname.endsWith("/messages")) return json({ messages: [{ id: "wamid.1" }] })
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
     values ($1, 'o@x.com', 'h', 'Owner', now())`,
    [userId]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id) values ($1, 'Org', $2)`,
    [organizationId, userId]
  )
  platform = new WhatsAppPlatformService(database, {
    load: async () => ({
      appId: "1592",
      appSecret: "secret",
      accessToken: "EAAG-madar-token",
      wabaId: "4569",
      phoneNumberId: "1390",
      apiVersion: "v26.0",
    }),
  })
  connections = new WhatsAppMerchantConnectionService(database, platform)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.end()
})

const signup = () =>
  connections.completeEmbeddedSignup({
    organizationId,
    actorUserId: userId,
    code: "signup-code",
    wabaId: "7700",
    phoneNumberId: "8800",
  })

describe("WhatsAppMerchantConnectionService", () => {
  it("sends through WhatsApp Web until a business number is connected", async () => {
    const view = await connections.get(organizationId)
    expect(view).toEqual({ sendMode: "web", connection: null, embeddedSignup: null })

    await expect(connections.setMode(organizationId, "business")).rejects.toMatchObject({
      code: "WHATSAPP_NOT_CONNECTED",
    })
  })

  it("offers Meta's signup once Madar's Embedded Signup configuration is set", async () => {
    await platform.update({ embeddedSignupConfigId: "cfg-42" }, userId)
    expect((await connections.get(organizationId)).embeddedSignup).toEqual({
      appId: "1592",
      configId: "cfg-42",
      apiVersion: "v26.0",
    })
  })

  it("connects the merchant's number: token, webhook, registration, invoice template", async () => {
    await platform.update({ embeddedSignupConfigId: "cfg-42" }, userId)
    const calls = stubMeta()

    const view = await signup()

    expect(view.sendMode).toBe("business")
    expect(view.connection).toMatchObject({
      status: "connected",
      wabaId: "7700",
      phoneNumberId: "8800",
      displayPhoneNumber: "+966 50 111 2222",
      verifiedName: "متجر الورد",
      lastError: null,
    })
    const exchange = calls.find((call) => call.path.endsWith("/oauth/access_token"))
    expect(exchange?.search).toContain("code=signup-code")
    expect(exchange?.search).toContain("client_id=1592")
    // Everything after the exchange acts with the merchant's own token, on their own account.
    for (const path of ["/v26.0/7700/subscribed_apps", "/v26.0/8800/register"]) {
      expect(calls.find((call) => call.path === path)?.authorization).toBe(
        "Bearer EAAB-merchant-token"
      )
    }
    expect(
      calls.some((call) => call.path === "/v26.0/7700/message_templates" && call.method === "POST")
    ).toBe(true)

    const stored = await database.query<{ business_token_encrypted: string }>(
      "select business_token_encrypted from whatsapp_merchant_connections"
    )
    expect(stored.rows[0].business_token_encrypted).toMatch(/^v1:/)
    expect(stored.rows[0].business_token_encrypted).not.toContain("EAAB-merchant-token")
  })

  it("keeps the connection when a later step fails, noting what's left to fix", async () => {
    await platform.update({ embeddedSignupConfigId: "cfg-42" }, userId)
    stubMeta({ registerFails: true })

    const view = await signup()

    expect(view.connection?.status).toBe("connected")
    expect(view.connection?.lastError).toContain("number registration")
    expect(view.connection?.lastError).toContain("PIN mismatch")
  })

  it("refuses to connect while the signup isn't set up on Madar's side", async () => {
    stubMeta()
    await expect(signup()).rejects.toMatchObject({ code: "WHATSAPP_SIGNUP_UNAVAILABLE" })
  })

  it("goes back to WhatsApp Web and drops the token on disconnect", async () => {
    await platform.update({ embeddedSignupConfigId: "cfg-42" }, userId)
    stubMeta()
    await signup()

    const view = await connections.disconnect(organizationId)

    expect(view.sendMode).toBe("web")
    expect(view.connection?.status).toBe("disconnected")
    expect(await connections.sendingContext(organizationId)).toBeNull()
  })

  it("sends a POS invoice from the merchant's own number once connected", async () => {
    await platform.update({ embeddedSignupConfigId: "cfg-42" }, userId)
    const calls = stubMeta()
    await signup()
    calls.length = 0

    const sender = new WhatsAppInvoiceSender(
      database,
      platform,
      new WhatsAppTemplatesService(platform),
      {
        get: async (_org: string, id: string) =>
          id === invoiceId
            ? {
                id: invoiceId,
                workspaceId: "30000000-0000-0000-0000-000000000001",
                invoiceNumber: "INV-1",
                orderNumber: null,
                createdAt: "2026-11-09T10:00:00.000Z",
                customerName: "عبدالله",
                customerPhone: "0501234567",
                customerVatNumber: null,
                items: [],
                subtotalAmount: 50,
                discountAmount: 0,
                taxAmount: 7.5,
                totalAmount: 57.5,
                payments: [],
              }
            : null,
      } as unknown as PosInvoicesService,
      { list: async () => [] } as unknown as PosPaymentMethodsService,
      null,
      connections
    )
    await sender.sendInvoice({
      organizationId,
      invoiceId,
      phone: "0501234567",
      actorUserId: null,
    })

    expect(calls.map((call) => call.path)).toEqual([
      "/v26.0/7700/message_templates",
      "/v26.0/8800/media",
      "/v26.0/8800/messages",
    ])
    expect(calls.every((call) => call.authorization === "Bearer EAAB-merchant-token")).toBe(true)
  })
})

// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- Meta's request bodies are read loosely here */

// WhatsApp marketing campaigns (whatsapp/campaigns.ts): offers submitted to Meta as the business's
// own marketing templates, the group of customers, sending from the business's number with a
// tracked button, and what comes back -- statuses, clicks, replies and opt-outs (Meta stubbed).
import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { WhatsAppCampaignsService } from "../whatsapp/campaigns"
import { WhatsAppMerchantConnectionService } from "../whatsapp/merchant-connection"
import { WhatsAppPlatformService } from "../whatsapp/platform-config"

const organizationId = "20000000-0000-0000-0000-000000000001"
const userId = "10000000-0000-0000-0000-000000000001"
let database: PostgresDatabase
let connections: WhatsAppMerchantConnectionService
let campaigns: WhatsAppCampaignsService
let platform: WhatsAppPlatformService

interface Sent {
  path: string
  body: Record<string, any>
}

function stubMeta(options: { templateStatus?: string; sendError?: { code: number } } = {}) {
  const sent: Sent[] = []
  let message = 0
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const method = init?.method ?? "GET"
    const body =
      typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, any>) : {}
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
    if (url.pathname.endsWith("/oauth/access_token")) {
      return json({ access_token: "EAAB-merchant-token", token_type: "bearer" })
    }
    if (url.pathname.endsWith("/register")) return json({ success: true })
    if (url.pathname.endsWith("/subscribed_apps")) return json({ success: true })
    if (url.pathname.endsWith("/8800") && method === "GET") {
      return json({ id: "8800", display_phone_number: "+966 50 111 2222", verified_name: "ورد" })
    }
    if (url.pathname.endsWith("/message_templates") && method === "GET") {
      const name = url.searchParams.get("name")
      return json({
        data: [{ name, language: "ar", status: options.templateStatus ?? "APPROVED" }],
      })
    }
    if (url.pathname.endsWith("/message_templates") && method === "POST") {
      sent.push({ path: url.pathname, body })
      return json({ id: "t1", status: "PENDING" })
    }
    if (url.pathname.endsWith("/messages")) {
      if (options.sendError) {
        return json({ error: { code: options.sendError.code, message: "Rate limit hit" } }, 400)
      }
      sent.push({ path: url.pathname, body })
      message += 1
      return json({ messages: [{ id: `wamid.${message}` }] })
    }
    return json({})
  })
  return sent
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
  campaigns = new WhatsAppCampaignsService(database, connections)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.end()
})

async function connect() {
  await platform.update({ embeddedSignupConfigId: "cfg-42" }, userId)
  await connections.completeEmbeddedSignup({
    organizationId,
    actorUserId: userId,
    code: "signup-code",
    wabaId: "7700",
    phoneNumberId: "8800",
  })
}

let customerCount = 0
async function customer(name: string, phone: string | null) {
  customerCount += 1
  const id = `30000000-0000-0000-0000-${String(customerCount).padStart(12, "0")}`
  await database.query(
    `insert into customers (id, organization_id, name, phone) values ($1, $2, $3, $4)`,
    [id, organizationId, name, phone]
  )
  return id
}

const offerInput = {
  title: "عرض الجمعة",
  body: "أهلاً {الاسم}، خصم 20% على كل المنتجات حتى نهاية الأسبوع!",
  buttonText: "تسوق الآن",
  buttonUrl: "https://shop.example.com/sale",
}

describe("WhatsAppCampaignsService", () => {
  it("needs the business's own number connected", async () => {
    stubMeta()
    await expect(campaigns.createOffer(organizationId, offerInput, userId)).rejects.toMatchObject({
      code: "WHATSAPP_NOT_CONNECTED",
    })
  })

  it("submits an offer as a marketing template with a tracked button and an opt-out button", async () => {
    const sent = stubMeta()
    await connect()
    const offer = await campaigns.createOffer(organizationId, offerInput, userId)
    expect(offer.status).toBe("PENDING")
    expect(offer.templateName).toMatch(/^promo_\d{8}_[a-z0-9]+$/)
    const template = sent.find((call) => call.path.endsWith("/7700/message_templates"))!.body
    expect(template).toMatchObject({ language: "ar", category: "MARKETING" })
    const body = template.components.find((part: any) => part.type === "BODY")
    expect(body.text).toBe("أهلاً {{1}}، خصم 20% على كل المنتجات حتى نهاية الأسبوع!")
    const buttons = template.components.find((part: any) => part.type === "BUTTONS").buttons
    expect(buttons[0]).toMatchObject({ type: "URL", url: "https://api.madar.my/v1/public/w/{{1}}" })
    expect(buttons[1]).toEqual({ type: "QUICK_REPLY", text: "إيقاف العروض" })

    await expect(
      campaigns.createOffer(organizationId, { ...offerInput, body: "{الاسم} عندنا عرض" }, userId)
    ).rejects.toMatchObject({ code: "WHATSAPP_OFFER_NAME_EDGE" })

    // Meta's answer is asked for again on the list.
    const [listed] = await campaigns.listOffers(organizationId)
    expect(listed.status).toBe("PENDING")
  })

  it("sends to the group from the business number, then counts statuses, clicks, replies and opt-outs", async () => {
    const sent = stubMeta()
    await connect()
    const offer = await campaigns.createOffer(organizationId, offerInput, userId)
    await database.query(`update whatsapp_offers set status = 'APPROVED' where id = $1`, [offer.id])
    await customer("نورة العتيبي", "0551230001")
    await customer("خالد", "+966 55 123 0002")
    // The same number twice gets one message, and no mobile means no message.
    await customer("خالد (مكرر)", "0551230002")
    await customer("بدون جوال", null)

    expect(await campaigns.preview(organizationId, { kind: "all" })).toMatchObject({ count: 2 })
    await expect(
      campaigns.createCampaign(
        organizationId,
        { name: "حملة", offerId: offer.id, audience: { kind: "all" }, consentConfirmed: false },
        userId
      )
    ).rejects.toMatchObject({ code: "WHATSAPP_CAMPAIGN_CONSENT" })

    const created = await campaigns.createCampaign(
      organizationId,
      {
        name: "حملة الجمعة",
        offerId: offer.id,
        audience: { kind: "all" },
        scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
        consentConfirmed: true,
      },
      userId
    )
    expect(created).toMatchObject({ status: "scheduled", stats: { recipients: 2, queued: 2 } })
    // Not due yet.
    expect(await campaigns.runDue()).toMatchObject({ sent: 0 })
    await database.query(
      `update whatsapp_campaigns set scheduled_at = now() - interval '1 minute' where id = $1`,
      [created.id]
    )
    expect(await campaigns.runDue()).toMatchObject({ sent: 2, failed: 0 })

    const messages = sent.filter((call) => call.path.endsWith("/8800/messages"))
    expect(messages).toHaveLength(2)
    expect(messages[0].body.template.name).toBe(offer.templateName)
    const bodyPart = messages[0].body.template.components.find((part: any) => part.type === "body")
    expect(bodyPart.parameters[0].text).toBe("نورة")
    const buttonPart = messages[0].body.template.components.find(
      (part: any) => part.type === "button"
    )
    const linkToken = buttonPart.parameters[0].text as string
    expect(linkToken).toMatch(/^[A-Za-z0-9]{6,16}$/)

    let detail = await campaigns.getCampaign(organizationId, created.id)
    expect(detail.status).toBe("sent")
    expect(detail.stats).toMatchObject({ sent: 2, delivered: 0 })

    // Meta's statuses, a tap on the button, a reply and an opt-out.
    await campaigns.handleWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "8800" },
                statuses: [
                  { id: "wamid.1", status: "read" },
                  { id: "wamid.2", status: "delivered" },
                ],
                messages: [
                  { from: "966551230002", type: "button", button: { text: "إيقاف العروض" } },
                ],
              },
            },
          ],
        },
      ],
    })
    expect(await campaigns.click(linkToken)).toBe("https://shop.example.com/sale")
    expect(await campaigns.click("unknowntoken")).toBeNull()

    detail = await campaigns.getCampaign(organizationId, created.id)
    expect(detail.stats).toMatchObject({
      sent: 2,
      delivered: 2,
      read: 1,
      clicked: 1,
      replied: 1,
      optedOut: 1,
    })
    // The customer who opted out (both records with that number) is left out of the next one.
    expect(await campaigns.preview(organizationId, { kind: "all" })).toMatchObject({
      count: 1,
      optedOut: 2,
    })
  })

  it("waits for the next pass when Meta says to slow down", async () => {
    stubMeta({ sendError: { code: 130429 } })
    await connect()
    const offer = (
      await database.query<{ id: string }>(
        `insert into whatsapp_offers (id, organization_id, title, template_name, body, status)
         values ('50000000-0000-0000-0000-000000000001', $1, 'عرض', 'promo_x', 'نص العرض', 'APPROVED')
         returning id`,
        [organizationId]
      )
    ).rows[0]
    await customer("سارة", "0551230009")
    const created = await campaigns.createCampaign(
      organizationId,
      {
        name: "حملة",
        offerId: offer.id,
        audience: { kind: "never" },
        scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
        consentConfirmed: true,
      },
      userId
    )
    await database.query(
      `update whatsapp_campaigns set scheduled_at = now() - interval '1 minute' where id = $1`,
      [created.id]
    )
    await campaigns.runDue()
    const detail = await campaigns.getCampaign(organizationId, created.id)
    expect(detail.status).toBe("sending")
    expect(detail.stats).toMatchObject({ queued: 1, failed: 0 })
  })
})

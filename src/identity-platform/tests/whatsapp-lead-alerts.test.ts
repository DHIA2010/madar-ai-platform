// @vitest-environment node

// The WhatsApp alert Madar's own team gets on a new lead (whatsapp/lead-alerts.ts): the numbers
// saved in Madar Admin, the template's parameters (Meta's rules: no empty values or line breaks),
// and that a lead is never lost or held up when the alert can't be sent. And the way around Meta's
// cap on these templates: a number that wrote to Madar's number in the last 24 hours gets the alert
// as a direct message instead.
import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { EmailGateway } from "../application/ports"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { SalesLeadService } from "../sales-leads/service"
import { leadAlertParameters, WhatsAppLeadAlertsService } from "../whatsapp/lead-alerts"
import { WhatsAppPlatformService } from "../whatsapp/platform-config"
import {
  LEAD_ALERT_TEMPLATE,
  SIGNUP_ALERT_TEMPLATE,
  WhatsAppTemplatesService,
} from "../whatsapp/templates"

const USER = "10000000-0000-0000-0000-000000000001"
let database: PostgresDatabase
let platform: WhatsAppPlatformService
let alerts: WhatsAppLeadAlertsService

type SentMessage = {
  to: string
  type: string
  template: { name: string; components: Array<{ parameters: Array<{ text: string }> }> }
  interactive?: {
    body: { text: string }
    action: { buttons: Array<{ reply: { id: string; title: string } }> }
  }
  text?: { body: string }
}

// Meta's webhook event for a message someone sent to a business number ("1390" is Madar's): text
// they typed, or a tap on a reply button.
const inbound = (
  from: string,
  options: { phoneNumberId?: string; buttonId?: string; at?: Date } = {}
) => ({
  entry: [
    {
      changes: [
        {
          value: {
            metadata: { phone_number_id: options.phoneNumberId ?? "1390" },
            messages: [
              {
                from,
                timestamp: String(Math.floor((options.at ?? new Date()).getTime() / 1000)),
                ...(options.buttonId
                  ? { type: "interactive", interactive: { button_reply: { id: options.buttonId } } }
                  : { type: "text", text: { body: "مرحبا" } }),
              },
            ],
          },
        },
      ],
    },
  ],
})

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60_000)
// A given hour of today in Riyadh (UTC+3).
const riyadhHour = (hour: number) => {
  const day = new Date(Date.now() + 3 * 60 * 60_000).toISOString().slice(0, 10)
  return new Date(`${day}T${String(hour).padStart(2, "0")}:00:00+03:00`)
}

// Meta, stubbed: each template's review status (the new-account alert can stand apart from the
// rest through `signupAlert`) and the sends.
function stubMeta(status = "APPROVED", signupAlert?: { status: string; category: string }) {
  const sent: SentMessage[] = []
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 })
    if (url.pathname.endsWith("/message_templates")) {
      const name = url.searchParams.get("name")
      if (name === SIGNUP_ALERT_TEMPLATE.name && signupAlert) {
        return json({ data: [{ name, language: "ar", ...signupAlert }] })
      }
      return json({ data: [{ name, language: "ar", status, category: "UTILITY" }] })
    }
    if (url.pathname.endsWith("/messages")) {
      sent.push(JSON.parse(String(init?.body)))
      return json({ messages: [{ id: `wamid.${sent.length}` }] })
    }
    return json({})
  })
  return sent
}

const messages = async () =>
  (
    await database.query<{ kind: string; to_phone: string; status: string; organization_id: null }>(
      "select kind, to_phone, status, organization_id from whatsapp_messages order by to_phone"
    )
  ).rows

beforeEach(async () => {
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"
  const mem = newDb({ autoCreateForeignKeyIndices: true })
  database = new PostgresDatabase(new (mem.adapters.createPg().Pool)())
  await runIdentityMigrations(database, process.cwd())
  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, 'staff@madar.my', 'h', 'Staff', now())`,
    [USER]
  )
  platform = new WhatsAppPlatformService(database, {
    load: async () => ({
      appId: "1592",
      appSecret: "secret",
      accessToken: "EAAG-token",
      wabaId: "4569",
      phoneNumberId: "1390",
      apiVersion: "v26.0",
    }),
  })
  alerts = new WhatsAppLeadAlertsService(database, platform, new WhatsAppTemplatesService(platform))
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.end()
})

describe("lead alert numbers", () => {
  it("keeps the numbers in WhatsApp's form, without repeats, and leaves the rest alone", async () => {
    const saved = await platform.update(
      { embeddedSignupConfigId: "777", leadAlertPhones: ["055 123 4567", "+966551234567"] },
      USER
    )
    expect(saved.leadAlertPhones).toEqual(["966551234567"])

    // Saving something else keeps the numbers; saving the numbers keeps everything else.
    await platform.update({ embeddedSignupConfigId: "888" }, USER)
    expect((await platform.get()).leadAlertPhones).toEqual(["966551234567"])
    const both = await platform.update({ leadAlertPhones: ["0551234567", "0509876543"] }, USER)
    expect(both.leadAlertPhones).toEqual(["966551234567", "966509876543"])
    expect(both.embeddedSignupConfigId).toBe("888")

    expect((await platform.update({ leadAlertPhones: [] }, USER)).leadAlertPhones).toEqual([])
  })

  it("refuses a number that can't be a WhatsApp number", async () => {
    await expect(platform.update({ leadAlertPhones: ["12345"] }, USER)).rejects.toMatchObject({
      code: "WHATSAPP_INVALID_PHONE",
    })
    expect((await platform.get()).leadAlertPhones).toEqual([])
  })
})

describe("leadAlertParameters", () => {
  it("fills every value, on one line each", () => {
    expect(
      leadAlertParameters({
        kind: "website",
        name: "مؤسسة\nالريم",
        phone: "0551234567",
        email: null,
        attribution: null,
      })
    ).toEqual(["طلب تواصل مع المبيعات", "مؤسسة الريم", "0551234567", "—", "مباشر"])

    const touch = {
      source: "snapchat",
      medium: "paid_social",
      campaign: "sales_leads",
      content: null,
      term: null,
      clickId: null,
      clickIdType: null,
      referrer: null,
      landingPage: null,
      at: "2026-11-13T10:00:00+03:00",
    }
    const signup = leadAlertParameters({
      kind: "signup",
      name: "Reem Trading",
      email: "owner@reem.sa",
      attribution: { first: { ...touch, source: "google", campaign: null }, last: touch },
    })
    expect(signup).toEqual([
      "تسجيل حساب جديد",
      "Reem Trading",
      "—",
      "owner@reem.sa",
      "snapchat / sales_leads",
    ])
    expect(signup).toHaveLength(SIGNUP_ALERT_TEMPLATE.bodyExamples.length)
    expect(signup).toHaveLength(LEAD_ALERT_TEMPLATE.bodyExamples.length)
  })
})

describe("WhatsAppLeadAlertsService", () => {
  it("sends the alert to every saved number and keeps a record of each", async () => {
    const sent = stubMeta()
    await platform.update({ leadAlertPhones: ["0551234567", "0509876543"] }, USER)

    await alerts.notify({ kind: "website", name: "مؤسسة الريم", phone: "0551112222", email: null })

    expect(sent.map((message) => message.to)).toEqual(["966551234567", "966509876543"])
    expect(sent[0].template.name).toBe("madar_new_lead")
    expect(sent[0].template.components[0].parameters.map((parameter) => parameter.text)).toEqual([
      "طلب تواصل مع المبيعات",
      "مؤسسة الريم",
      "0551112222",
      "—",
      "مباشر",
    ])
    expect(await messages()).toEqual([
      { kind: "lead_alert", to_phone: "966509876543", status: "sent", organization_id: null },
      { kind: "lead_alert", to_phone: "966551234567", status: "sent", organization_id: null },
    ])
  })

  it("sends nothing, and asks Meta nothing, while no number is saved", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    await alerts.notify({ kind: "signup", name: "Reem", email: "owner@reem.sa" })
    expect(fetchSpy).not.toHaveBeenCalled()
    await expect(alerts.sendTest()).rejects.toMatchObject({ code: "LEAD_ALERT_NO_NUMBERS" })
  })

  it("stays quiet until Meta approves the template, but the test send says why", async () => {
    const sent = stubMeta("PENDING")
    vi.spyOn(console, "error").mockImplementation(() => {})
    await platform.update({ leadAlertPhones: ["0551234567"] }, USER)

    await expect(alerts.notify({ kind: "signup", name: "Reem" })).resolves.toBeUndefined()
    expect(sent).toHaveLength(0)
    await expect(alerts.sendTest()).rejects.toMatchObject({ code: "WHATSAPP_TEMPLATE_NOT_READY" })
  })

  it("sends a new account its own message, and a sales request the lead alert", async () => {
    const sent = stubMeta()
    await platform.update({ leadAlertPhones: ["0551234567"] }, USER)

    await alerts.notify({ kind: "signup", name: "Reem", email: "owner@reem.sa" })
    await alerts.notify({ kind: "website", name: "مؤسسة الريم", phone: "0551112222" })
    await alerts.sendTest()

    // The test send is both alerts, each with its own message.
    expect(sent.map((message) => message.template.name)).toEqual([
      "madar_account_alert",
      "madar_new_lead",
      "madar_new_lead",
      "madar_account_alert",
    ])
    expect(sent[0].template.components[0].parameters[0].text).toBe("تسجيل حساب جديد")
  })

  it("sends a new account with the lead alert until Meta approves its own message", async () => {
    const sent = stubMeta("APPROVED", { status: "PENDING", category: "UTILITY" })
    await platform.update({ leadAlertPhones: ["0551234567"] }, USER)

    await alerts.notify({ kind: "signup", name: "Reem", email: "owner@reem.sa" })

    expect(sent.map((message) => message.template.name)).toEqual(["madar_new_lead"])
    expect(sent[0].template.components[0].parameters[0].text).toBe("تسجيل حساب جديد")
  })

  it("lists both alerts, with how Meta itself filed each", async () => {
    stubMeta("APPROVED", { status: "PENDING", category: "MARKETING" })
    const statuses = await new WhatsAppTemplatesService(platform).statuses()
    expect(statuses.map((entry) => entry.name)).toEqual([
      "madar_pos_invoice",
      "madar_daily_report",
      "madar_new_lead",
      "madar_account_alert",
    ])
    expect(statuses.find((entry) => entry.name === "madar_new_lead")).toMatchObject({
      status: "APPROVED",
      category: "UTILITY",
      metaCategory: "UTILITY",
    })
    expect(statuses.find((entry) => entry.name === "madar_account_alert")).toMatchObject({
      status: "PENDING",
      category: "UTILITY",
      metaCategory: "MARKETING",
    })
  })

  it("keeps a failed send on record and still reaches the other numbers", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith("/message_templates")) {
        return new Response(
          JSON.stringify({
            data: [{ name: LEAD_ALERT_TEMPLATE.name, language: "ar", status: "APPROVED" }],
          })
        )
      }
      const { to } = JSON.parse(String(init?.body)) as { to: string }
      return to === "966551234567"
        ? new Response(JSON.stringify({ error: { message: "Recipient not on WhatsApp" } }), {
            status: 400,
          })
        : new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }))
    })
    await platform.update({ leadAlertPhones: ["0551234567", "0509876543"] }, USER)

    // Two alerts (lead and new account) to each of the two numbers.
    expect(await alerts.sendTest()).toEqual({ sent: 2, failed: 2, direct: 0 })
    expect((await messages()).map((row) => row.status)).toEqual([
      "sent",
      "sent",
      "failed",
      "failed",
    ])
  })
})

describe("direct alerts in the 24 hours after a number wrote to Madar", () => {
  const sentWith = async () =>
    (
      await database.query<{ to_phone: string; template_name: string; kind: string }>(
        "select to_phone, template_name, kind from whatsapp_messages order by created_at, to_phone"
      )
    ).rows.map((row) => `${row.kind}:${row.to_phone}:${row.template_name}`)
  const setLastReply = (phone: string, at: Date) =>
    database.query(
      "update whatsapp_lead_alert_replies set last_reply_at = $2::timestamptz where phone = $1",
      [phone, at.toISOString()]
    )

  it("sends the alert directly, with a button, to a number that wrote; the template to the rest", async () => {
    const sent = stubMeta()
    await platform.update({ leadAlertPhones: ["0551234567", "0509876543"] }, USER)

    expect(await alerts.recordReplies(inbound("966509876543"))).toBe(1)
    // The number is told it worked.
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ to: "966509876543", type: "text" })
    expect(sent[0].text?.body).toContain("تم تفعيل التنبيهات الفورية")

    await alerts.notify({ kind: "website", name: "مؤسسة الريم", phone: "0551112222" })
    const [, direct, template] = sent
    expect(direct).toMatchObject({ to: "966509876543", type: "interactive" })
    // The same words as the template, and one button to tap.
    expect(direct.interactive?.body.text).toBe(
      [
        "🔔 *عميل محتمل جديد في مدار*",
        "النوع: طلب تواصل مع المبيعات",
        "",
        "• الاسم: مؤسسة الريم",
        "• الجوال: 0551112222",
        "• البريد: —",
        "• المصدر: مباشر",
        "",
        "افتح لوحة إدارة مدار لمتابعة العميل.",
      ].join("\n")
    )
    expect(direct.interactive?.action.buttons.map((button) => button.reply.title)).toEqual([
      "تم الاستلام",
    ])
    expect(template).toMatchObject({ to: "966551234567", type: "template" })
    expect(template.template.name).toBe("madar_new_lead")
    expect(await sentWith()).toEqual([
      "lead_alert:966509876543:direct",
      "lead_alert:966551234567:madar_new_lead",
    ])

    // A new account goes the same way, in its own words.
    await alerts.notify({ kind: "signup", name: "Reem", email: "owner@reem.sa" })
    expect(sent[3].interactive?.body.text).toContain("تنبيه من حسابك في مدار")
    expect(sent[3].interactive?.body.text).toContain("• النوع: تسجيل حساب جديد")
    expect(sent[4].template.name).toBe("madar_account_alert")
  })

  it("needs no approved template for a number that wrote", async () => {
    const sent = stubMeta("PENDING")
    vi.spyOn(console, "error").mockImplementation(() => {})
    await platform.update({ leadAlertPhones: ["0551234567", "0509876543"] }, USER)
    await alerts.recordReplies(inbound("966509876543"))
    sent.length = 0

    await alerts.notify({ kind: "website", name: "مؤسسة الريم" })
    expect(sent.map((message) => `${message.to}:${message.type}`)).toEqual([
      "966509876543:interactive",
    ])
  })

  it("sends both test alerts, and says how many went directly", async () => {
    const sent = stubMeta()
    await platform.update({ leadAlertPhones: ["0551234567"] }, USER)
    expect(await alerts.sendTest()).toEqual({ sent: 2, failed: 0, direct: 0 })

    await alerts.recordReplies(inbound("966551234567"))
    sent.length = 0
    expect(await alerts.sendTest()).toEqual({ sent: 2, failed: 0, direct: 2 })
    expect(sent.map((message) => message.interactive?.body.text.split("\n")[0])).toEqual([
      "🔔 *عميل محتمل جديد في مدار*",
      "تنبيه من حسابك في مدار",
    ])
  })

  it("only counts a team number writing to Madar's own number", async () => {
    const sent = stubMeta()
    await platform.update({ leadAlertPhones: ["0551234567"] }, USER)

    // A stranger; a team number writing to a merchant's number; an event with no message.
    expect(await alerts.recordReplies(inbound("966500000001"))).toBe(0)
    expect(await alerts.recordReplies(inbound("966551234567", { phoneNumberId: "9999" }))).toBe(0)
    expect(
      await alerts.recordReplies({
        entry: [{ changes: [{ value: { statuses: [{ id: "wamid.1", status: "delivered" }] } }] }],
      })
    ).toBe(0)
    expect(sent).toHaveLength(0)

    await alerts.notify({ kind: "website", name: "مؤسسة الريم" })
    expect(sent.map((message) => message.type)).toEqual(["template"])
  })

  it("goes back to the template once the 24 hours are over, and opens again on a new message", async () => {
    const sent = stubMeta()
    await platform.update({ leadAlertPhones: ["0551234567"] }, USER)
    await alerts.recordReplies(inbound("966551234567"))
    await setLastReply("966551234567", hoursAgo(23.6))
    expect((await alerts.status()).numbers).toEqual([{ phone: "966551234567", directUntil: null }])
    sent.length = 0

    await alerts.notify({ kind: "website", name: "مؤسسة الريم" })
    expect(sent.map((message) => message.type)).toEqual(["template"])

    // An event Meta delivers late counts from when the message was sent.
    await alerts.recordReplies(inbound("966551234567", { at: hoursAgo(30) }))
    await alerts.notify({ kind: "website", name: "مؤسسة الريم" })
    expect(sent.map((message) => message.type)).toEqual(["template", "template"])

    // A tap on a button is a message too.
    await alerts.recordReplies(inbound("966551234567", { buttonId: "lead_alert_received" }))
    await alerts.notify({ kind: "website", name: "مؤسسة الريم" })
    expect(sent.map((message) => message.type)).toEqual([
      "template",
      "template",
      "text",
      "interactive",
    ])
    const { numbers } = await alerts.status()
    expect(new Date(numbers[0].directUntil ?? 0).getTime()).toBeGreaterThan(
      Date.now() + 23 * 60 * 60_000
    )
  })

  it("answers a first message and a tap on the reminder, not a tap on an alert", async () => {
    const sent = stubMeta()
    await platform.update({ leadAlertPhones: ["0551234567"] }, USER)

    await alerts.recordReplies(inbound("966551234567", { at: hoursAgo(2) }))
    expect(sent.map((message) => message.text?.body.split("\n")[0])).toEqual([
      "✅ تم تفعيل التنبيهات الفورية على هذا الرقم لمدة 24 ساعة.",
    ])
    await alerts.recordReplies(
      inbound("966551234567", { buttonId: "lead_alert_received", at: hoursAgo(1) })
    )
    expect(sent).toHaveLength(1)
    await alerts.recordReplies(inbound("966551234567", { buttonId: "lead_alert_keep" }))
    expect(sent[1].text?.body).toBe("✅ تم. التنبيهات الفورية مستمرة لمدة 24 ساعة.")
  })

  it("falls back to the template when Meta refuses the direct message", async () => {
    const sent: SentMessage[] = []
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith("/message_templates")) {
        const name = url.searchParams.get("name")
        return new Response(
          JSON.stringify({ data: [{ name, language: "ar", status: "APPROVED" }] })
        )
      }
      const message = JSON.parse(String(init?.body)) as SentMessage
      if (message.type !== "template") {
        return new Response(JSON.stringify({ error: { message: "Re-engagement message" } }), {
          status: 400,
        })
      }
      sent.push(message)
      return new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }))
    })
    vi.spyOn(console, "error").mockImplementation(() => {})
    await platform.update({ leadAlertPhones: ["0551234567"] }, USER)
    await alerts.recordReplies(inbound("966551234567"))

    expect(await alerts.sendTest()).toEqual({ sent: 2, failed: 0, direct: 0 })
    expect(sent.map((message) => message.template.name)).toEqual([
      "madar_new_lead",
      "madar_account_alert",
    ])
  })

  it("asks a number to tap again before its 24 hours run out: once, and not at night", async () => {
    const sent = stubMeta()
    await platform.update({ leadAlertPhones: ["0551234567", "0509876543"] }, USER)
    const noon = riyadhHour(12)
    const before = (hours: number) => new Date(noon.getTime() - hours * 60 * 60_000)
    await alerts.recordReplies(inbound("966551234567"))
    await alerts.recordReplies(inbound("966509876543"))
    sent.length = 0

    // One wrote 15 hours ago, the other 3 hours ago: only the first is due.
    await setLastReply("966551234567", before(15))
    await setLastReply("966509876543", before(3))
    expect(await alerts.remindDue(riyadhHour(3))).toBe(0)
    expect(await alerts.remindDue(riyadhHour(23))).toBe(0)
    expect(await alerts.remindDue(noon)).toBe(1)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ to: "966551234567", type: "interactive" })
    expect(sent[0].interactive?.action.buttons[0].reply).toEqual({
      id: "lead_alert_keep",
      title: "استمرار التنبيهات",
    })
    expect(await sentWith()).toEqual(["lead_alert_reminder:966551234567:direct"])

    // Not twice for the same 24 hours -- from this task or another.
    expect(await alerts.remindDue(noon)).toBe(0)
    expect(await alerts.remindDue(new Date(noon.getTime() + 5 * 60_000))).toBe(0)
    expect(sent).toHaveLength(1)

    // A number whose 24 hours are already over isn't asked, nor one taken off the list.
    await setLastReply("966509876543", before(30))
    expect(await alerts.remindDue(noon)).toBe(0)
    await setLastReply("966509876543", before(15))
    await platform.update({ leadAlertPhones: ["0551234567"] }, USER)
    expect(await alerts.remindDue(noon)).toBe(0)
    await platform.update({ leadAlertPhones: ["0551234567", "0509876543"] }, USER)
    expect(await alerts.remindDue(noon)).toBe(1)
    expect(sent[1]).toMatchObject({ to: "966509876543", type: "interactive" })

    // After a tap the 24 hours start again, and so does the reminder -- held over the night.
    await setLastReply("966551234567", new Date(noon.getTime() + 60 * 60_000))
    const later = (hours: number) => new Date(noon.getTime() + hours * 60 * 60_000)
    expect(await alerts.remindDue(later(6))).toBe(0)
    expect(await alerts.remindDue(later(15.5))).toBe(0)
    expect(await alerts.remindDue(later(19.5))).toBe(1)
    expect(sent[2]).toMatchObject({ to: "966551234567", type: "interactive" })
  })
})

describe("a talk-to-sales request", () => {
  it("alerts the team, and is stored even when WhatsApp is down", async () => {
    const emailed: string[] = []
    const emailGateway = {
      sendSalesLeadEmail: async ({ to }: { to: string }) => {
        if (to === "bounces@madar.my") throw new Error("mailbox unavailable")
        emailed.push(to)
      },
    } as unknown as EmailGateway
    vi.spyOn(console, "error").mockImplementation(() => {})
    const service = new SalesLeadService(
      database,
      emailGateway,
      "bounces@madar.my, sales@madar.my",
      alerts
    )
    await platform.update({ leadAlertPhones: ["0551234567"] }, USER)

    const sent = stubMeta()
    await service.submit({ companyName: "مؤسسة الريم", phone: "0551112222", email: null }, {})
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].template.components[0].parameters[1].text).toBe("مؤسسة الريم")
    // One inbox failing doesn't cost the other its email.
    expect(emailed).toEqual(["sales@madar.my"])

    // A new account reaches the team the same way.
    await service.notifySignup({ name: "Reem Trading", email: "owner@reem.sa" })
    await vi.waitFor(() => expect(sent).toHaveLength(2))
    expect(sent[1].template.components[0].parameters[0].text).toBe("تسجيل حساب جديد")
    expect(emailed).toEqual(["sales@madar.my", "sales@madar.my"])

    vi.restoreAllMocks()
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"))
    const id = await service.submit({ companyName: "Second", phone: "0553334444", email: null }, {})
    const stored = await database.query("select id from sales_leads where id = $1", [id])
    expect(stored.rows).toHaveLength(1)
  })
})

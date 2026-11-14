// @vitest-environment node

// The WhatsApp alert Madar's own team gets on a new lead (whatsapp/lead-alerts.ts): the numbers
// saved in Madar Admin, the template's parameters (Meta's rules: no empty values or line breaks),
// and that a lead is never lost or held up when the alert can't be sent.
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
  template: { name: string; components: Array<{ parameters: Array<{ text: string }> }> }
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

    expect(sent.map((message) => message.template.name)).toEqual([
      "madar_account_alert",
      "madar_new_lead",
      "madar_new_lead",
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

    expect(await alerts.sendTest()).toEqual({ sent: 1, failed: 1 })
    expect((await messages()).map((row) => row.status)).toEqual(["sent", "failed"])
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

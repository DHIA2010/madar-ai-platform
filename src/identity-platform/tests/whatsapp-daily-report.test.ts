// @vitest-environment node

// The daily store report on WhatsApp (whatsapp/daily-report.ts): the day's figures, the template's
// parameters (Meta's rules: no empty values or line breaks), the merchant's settings, and the
// scheduled pass sending each organization's report once a day at its chosen time.
import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import {
  dailyReportParameters,
  renderDailyReport,
  reportDayFor,
  reportWindow,
  WhatsAppDailyReportService,
} from "../whatsapp/daily-report"
import { AddonsService } from "../subscriptions/addons"
import { WhatsAppPlatformService } from "../whatsapp/platform-config"
import { DAILY_REPORT_TEMPLATE, WhatsAppTemplatesService } from "../whatsapp/templates"

const ORG = "20000000-0000-0000-0000-000000000001"
const WS = "30000000-0000-0000-0000-000000000001"
const USER = "10000000-0000-0000-0000-000000000001"
let database: PostgresDatabase
let service: WhatsAppDailyReportService
let addons: AddonsService

beforeEach(async () => {
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"
  const mem = newDb({ autoCreateForeignKeyIndices: true })
  database = new PostgresDatabase(new (mem.adapters.createPg().Pool)())
  await runIdentityMigrations(database, process.cwd())
  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, 'o@x.com', 'h', 'Owner', now())`,
    [USER]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id) values ($1, 'Org', $2)`,
    [ORG, USER]
  )
  await database.query(
    `insert into workspaces (id, organization_id, name) values ($1, $2, 'Main')`,
    [WS, ORG]
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
  addons = new AddonsService(database)
  service = new WhatsAppDailyReportService(
    database,
    platform,
    new WhatsAppTemplatesService(platform),
    null,
    addons
  )
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.end()
})

// A sale on 2026-01-14 at 10:00 Riyadh (07:00 UTC).
async function sale(
  total: number,
  items: Array<[string, number]>,
  payments: Array<[string, number]>
) {
  const id = randomUUID()
  await database.query(
    `insert into pos_invoices (id, organization_id, workspace_id, invoice_number, payment_method_code,
       subtotal_amount, tax_amount, total_amount, created_at)
     values ($1, $2, $3, $4, $5, $6, 0, $6, '2026-01-14T07:00:00Z')`,
    [id, ORG, WS, `INV-${id.slice(0, 6)}`, payments[0][0], total]
  )
  for (const [name, quantity] of items) {
    await database.query(
      `insert into pos_invoice_items (id, invoice_id, product_name, unit_price, quantity, line_total)
       values ($1, $2, $3, 1, $4, $4)`,
      [randomUUID(), id, name, quantity]
    )
  }
  for (const [code, value] of payments) {
    await database.query(
      `insert into pos_invoice_payments (id, invoice_id, payment_method_code, amount)
       values ($1, $2, $3, $4)`,
      [randomUUID(), id, code, value]
    )
  }
}

describe("WhatsAppDailyReportService", () => {
  it("builds the day's figures across branches and fills every template line", async () => {
    await sale(
      1000,
      [["هيل أمريكي 1", 8]],
      [
        ["cash", 600],
        ["mada", 400],
      ]
    )
    await sale(170, [["فستان سهرة راقٍ", 2]], [["bank_transfer", 170]])
    // Another day doesn't count.
    await database.query(
      `insert into pos_invoices (id, organization_id, workspace_id, invoice_number, payment_method_code,
         subtotal_amount, tax_amount, total_amount, created_at)
       values ($1, $2, $3, 'INV-OLD', 'cash', 999, 0, 999, '2026-01-13T07:00:00Z')`,
      [randomUUID(), ORG, WS]
    )
    await database.query(
      `insert into products (id, organization_id, product_type, name, stock_quantity)
       values ($1, $2, 'simple', 'باب ألمنيوم', -8.3), ($3, $2, 'simple', 'منتج متوفر', 50)`,
      [randomUUID(), ORG, randomUUID()]
    )

    const report = await service.build(ORG, "2026-01-14")
    expect(report).toMatchObject({
      sales: 1170,
      payments: { cash: 600, card: 400, transfer: 170, other: 0 },
      shifts: { total: 0 },
      bestSellers: [
        { name: "هيل أمريكي 1", quantity: 8 },
        { name: "فستان سهرة راقٍ", quantity: 2 },
      ],
      lowStock: [{ name: "باب ألمنيوم", stock: -8.3 }],
    })

    const parameters = dailyReportParameters(report)
    expect(parameters).toHaveLength(20)
    // Meta refuses an empty parameter or one with a line break.
    for (const value of parameters) {
      expect(value.length).toBeGreaterThan(0)
      expect(value).not.toMatch(/[\n\t]/)
    }
    expect(parameters.slice(0, 2)).toEqual(["2026-01-14", "1,170"])
    expect(parameters[5]).toBe("—")
    expect(parameters.slice(14, 17)).toEqual(["هيل أمريكي 1: 8", "فستان سهرة راقٍ: 2", "—"])
    expect(parameters[17]).toBe("باب ألمنيوم: -8.3")

    const text = renderDailyReport(report)
    expect(text).toContain("ملخص أداء متجرك ليوم *2026-01-14*")
    expect(text).not.toMatch(/\{\{\d+\}\}/)
    expect(text.trim().endsWith("💙 *مدار، شريكك التقني في عالم التجزئة.*")).toBe(true)
  })

  it("reports yesterday for a morning send and today for a later one", () => {
    // 06:00 UTC = 09:00 Riyadh; 20:00 UTC = 23:00 Riyadh.
    expect(reportDayFor(new Date("2026-01-15T06:00:00Z"))).toBe("2026-01-14")
    expect(reportDayFor(new Date("2026-01-15T20:00:00Z"))).toBe("2026-01-15")
  })

  it("keeps the organization's time and numbers, and refuses bad ones", async () => {
    const saved = await service.updateSettings(ORG, USER, {
      enabled: true,
      sendTime: "09:30",
      recipients: [
        { phone: "0501234567", name: "المالك" },
        { phone: "+966 50 123 4567", name: "مكرر" },
      ],
    })
    expect(saved).toMatchObject({
      enabled: true,
      sendTime: "09:30",
      recipients: [{ phone: "966501234567", name: "المالك" }],
    })
    await expect(
      service.updateSettings(ORG, USER, { enabled: true, sendTime: "9:30", recipients: [] })
    ).rejects.toMatchObject({ code: "DAILY_REPORT_INVALID_TIME" })
    await expect(
      service.updateSettings(ORG, USER, { enabled: true, sendTime: "09:30", recipients: [] })
    ).rejects.toMatchObject({ code: "DAILY_REPORT_NO_RECIPIENTS" })
    await expect(
      service.updateSettings(ORG, USER, {
        enabled: true,
        sendTime: "09:30",
        recipients: [{ phone: "123", name: "" }],
      })
    ).rejects.toMatchObject({ code: "WHATSAPP_INVALID_PHONE" })
  })

  it("sends each organization's report once a day, once its time has come", async () => {
    const sent: unknown[] = []
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = new URL(String(input))
      const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 })
      if (url.pathname.endsWith("/message_templates")) {
        return json({
          data: [{ name: DAILY_REPORT_TEMPLATE.name, language: "ar", status: "APPROVED" }],
        })
      }
      if (url.pathname.endsWith("/messages")) {
        sent.push(JSON.parse(String(init?.body)))
        return json({ messages: [{ id: `wamid.${sent.length}` }] })
      }
      return json({})
    })
    // Two numbers need the paid plan.
    await addons.extend(ORG, "whatsapp_daily_report", "yearly", "grant")
    await service.updateSettings(ORG, USER, {
      enabled: true,
      sendTime: "09:00",
      recipients: [
        { phone: "0501234567", name: "المالك" },
        { phone: "0559876543", name: "المدير" },
      ],
    })

    // 08:30 Riyadh: not yet.
    expect((await service.runDue(new Date("2026-01-15T05:30:00Z"))).organizations).toBe(0)
    // 09:05 Riyadh: sent to both numbers, with the template's 20 values.
    expect(await service.runDue(new Date("2026-01-15T06:05:00Z"))).toEqual({
      organizations: 1,
      sent: 2,
      failed: 0,
    })
    const message = sent[0] as {
      to: string
      template: { name: string; components: Array<{ parameters: unknown[] }> }
    }
    expect(message.to).toBe("966501234567")
    expect(message.template.name).toBe("madar_daily_report")
    expect(message.template.components[0].parameters).toHaveLength(20)
    // Later the same day: not again.
    expect((await service.runDue(new Date("2026-01-15T10:00:00Z"))).organizations).toBe(0)
    // The next day: again.
    expect((await service.runDue(new Date("2026-01-16T06:05:00Z"))).organizations).toBe(1)
  })

  it("works out each send's period: the default, a chosen from-to, overnight and a full day", () => {
    const at = (iso: string) => new Date(iso)
    // 16:00 Riyadh = 13:00 UTC.
    expect(reportWindow(at("2026-01-15T13:00:00Z"), { from: "08:00", to: "16:00" })).toEqual({
      start: "2026-01-15T05:00:00.000Z",
      end: "2026-01-15T13:00:00.000Z",
      label: "2026-01-15 من 08:00 إلى 16:00",
    })
    // Sent at 00:05 Riyadh, covering 16:00-24:00 the evening before.
    expect(reportWindow(at("2026-01-15T21:05:00Z"), { from: "16:00", to: "00:00" })).toEqual({
      start: "2026-01-15T13:00:00.000Z",
      end: "2026-01-15T21:00:00.000Z",
      label: "2026-01-15 من 16:00 إلى 24:00",
    })
    // Crossing midnight: 20:00 the day before to 08:00.
    expect(reportWindow(at("2026-01-16T05:00:00Z"), { from: "20:00", to: "08:00" }).label).toBe(
      "2026-01-15 20:00 إلى 2026-01-16 08:00"
    )
    // A whole day when from and to are both midnight.
    expect(reportWindow(at("2026-01-16T06:00:00Z"), { from: "00:00", to: "00:00" }).label).toBe(
      "2026-01-15"
    )
    // The default: the whole day before for a morning send, today so far for a later one.
    expect(reportWindow(at("2026-01-16T06:00:00Z"), { from: null, to: null }).label).toBe(
      "2026-01-15"
    )
    expect(reportWindow(at("2026-01-16T17:00:00Z"), { from: null, to: null }).label).toBe(
      "2026-01-16 من 00:00 إلى 20:00"
    )
  })

  it("keeps the free plan to one number, one send and the default period", async () => {
    const settings = await service.getSettings(ORG)
    expect(settings.plan).toEqual({
      paid: false,
      until: null,
      limits: { recipients: 1, schedules: 1, customPeriod: false },
    })
    const twoNumbers = {
      enabled: true,
      sendTime: "09:00",
      recipients: [
        { phone: "0501234567", name: "" },
        { phone: "0559876543", name: "" },
      ],
    }
    await expect(service.updateSettings(ORG, USER, twoNumbers)).rejects.toMatchObject({
      code: "DAILY_REPORT_PLAN_LIMIT",
    })
    const one = [{ phone: "0501234567", name: "" }]
    await expect(
      service.updateSettings(ORG, USER, {
        enabled: true,
        schedules: [{ sendTime: "09:00" }, { sendTime: "16:00" }],
        recipients: one,
      })
    ).rejects.toMatchObject({ code: "DAILY_REPORT_PLAN_LIMIT" })
    await expect(
      service.updateSettings(ORG, USER, {
        enabled: true,
        schedules: [{ sendTime: "16:00", from: "08:00", to: "16:00" }],
        recipients: one,
      })
    ).rejects.toMatchObject({ code: "DAILY_REPORT_PLAN_LIMIT" })
  })

  it("on the paid plan sends up to three reports a day, each covering its own period", async () => {
    const sent: Array<{
      template: { components: Array<{ parameters: Array<{ text: string }> }> }
    }> = []
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = new URL(String(input))
      const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 })
      if (url.pathname.endsWith("/message_templates")) {
        return json({
          data: [{ name: DAILY_REPORT_TEMPLATE.name, language: "ar", status: "APPROVED" }],
        })
      }
      if (url.pathname.endsWith("/messages")) {
        sent.push(JSON.parse(String(init?.body)))
        return json({ messages: [{ id: `wamid.${sent.length}` }] })
      }
      return json({})
    })
    await addons.extend(ORG, "whatsapp_daily_report", "monthly", "payment")
    const saved = await service.updateSettings(ORG, USER, {
      enabled: true,
      schedules: [
        { sendTime: "16:00", from: "08:00", to: "16:00" },
        { sendTime: "00:05", from: "16:00", to: "00:00" },
        { sendTime: "12:00" },
      ],
      recipients: [{ phone: "0501234567", name: "" }],
    })
    expect(saved.schedules.map((schedule) => schedule.sendTime)).toEqual([
      "00:05",
      "12:00",
      "16:00",
    ])
    expect(saved.coverage).toHaveLength(3)

    // 00:10 Riyadh on the 15th: only the 00:05 send is due, covering the 14th 16:00-24:00.
    expect(await service.runDue(new Date("2026-01-14T21:10:00Z"))).toEqual({
      organizations: 1,
      sent: 1,
      failed: 0,
    })
    const firstLine = (index: number) => sent[index].template.components[0].parameters[0].text
    expect(firstLine(0)).toBe("2026-01-14 من 16:00 إلى 24:00")
    // 16:30: the 12:00 and 16:00 sends go out, each once.
    expect((await service.runDue(new Date("2026-01-15T13:30:00Z"))).sent).toBe(2)
    expect(firstLine(2)).toBe("2026-01-15 من 08:00 إلى 16:00")
    expect((await service.runDue(new Date("2026-01-15T14:00:00Z"))).sent).toBe(0)
  })

  it("goes back to the free plan when the add-on lapses, keeping the settings", async () => {
    await addons.extend(ORG, "whatsapp_daily_report", "monthly", "payment")
    await service.updateSettings(ORG, USER, {
      enabled: true,
      schedules: [{ sendTime: "09:00", from: "08:00", to: "09:00" }, { sendTime: "21:00" }],
      recipients: [
        { phone: "0501234567", name: "" },
        { phone: "0559876543", name: "" },
      ],
    })
    await addons.revoke(ORG, "whatsapp_daily_report")
    const settings = await service.getSettings(ORG)
    expect(settings.plan.paid).toBe(false)
    expect(settings.schedules).toHaveLength(2)
    expect(settings.coverage).toHaveLength(1)
  })

  it("doesn't resend a report already sent today before per-send claims existed", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input))
      const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 })
      if (url.pathname.endsWith("/message_templates")) {
        return json({
          data: [{ name: DAILY_REPORT_TEMPLATE.name, language: "ar", status: "APPROVED" }],
        })
      }
      return json({ messages: [{ id: "wamid.1" }] })
    })
    await database.query(
      `insert into whatsapp_daily_report_settings (organization_id, enabled, send_time, recipients, last_sent_on)
       values ($1, true, '00:00', $2::jsonb, '2026-01-15')`,
      [ORG, JSON.stringify([{ phone: "966501234567", name: "" }])]
    )
    expect((await service.runDue(new Date("2026-01-15T07:00:00Z"))).organizations).toBe(0)
    expect((await service.runDue(new Date("2026-01-16T07:00:00Z"))).organizations).toBe(1)
  })

  it("runs a chosen period past midnight when each end names its day", async () => {
    // Sent at 03:00 Riyadh on the 16th (00:00 UTC): yesterday 00:00 to today 02:00 -- 26 hours.
    const window = reportWindow(new Date("2026-01-16T00:00:00Z"), {
      from: "00:00",
      fromDay: -1,
      to: "02:00",
      toDay: 0,
    })
    expect(window).toEqual({
      start: "2026-01-14T21:00:00.000Z",
      end: "2026-01-15T23:00:00.000Z",
      label: "2026-01-15 00:00 إلى 2026-01-16 02:00",
    })

    await addons.extend(ORG, "whatsapp_daily_report", "monthly", "payment")
    const recipients = [{ phone: "0501234567", name: "" }]
    const saved = await service.updateSettings(ORG, USER, {
      enabled: true,
      schedules: [{ sendTime: "03:00", from: "00:00", fromDay: -1, to: "02:00", toDay: 0 }],
      recipients,
    })
    expect(saved.schedules[0]).toMatchObject({ fromDay: -1, toDay: 0 })
    // Ending after the send, or starting after the end, is refused.
    await expect(
      service.updateSettings(ORG, USER, {
        enabled: true,
        schedules: [{ sendTime: "03:00", from: "00:00", fromDay: -1, to: "04:00", toDay: 0 }],
        recipients,
      })
    ).rejects.toMatchObject({ code: "DAILY_REPORT_INVALID_PERIOD" })
    await expect(
      service.updateSettings(ORG, USER, {
        enabled: true,
        schedules: [{ sendTime: "03:00", from: "02:00", fromDay: 0, to: "01:00", toDay: 0 }],
        recipients,
      })
    ).rejects.toMatchObject({ code: "DAILY_REPORT_INVALID_PERIOD" })
  })
})

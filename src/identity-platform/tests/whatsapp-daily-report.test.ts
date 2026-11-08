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
  WhatsAppDailyReportService,
} from "../whatsapp/daily-report"
import { WhatsAppPlatformService } from "../whatsapp/platform-config"
import { DAILY_REPORT_TEMPLATE, WhatsAppTemplatesService } from "../whatsapp/templates"

const ORG = "20000000-0000-0000-0000-000000000001"
const WS = "30000000-0000-0000-0000-000000000001"
const USER = "10000000-0000-0000-0000-000000000001"
let database: PostgresDatabase
let service: WhatsAppDailyReportService

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
  service = new WhatsAppDailyReportService(
    database,
    platform,
    new WhatsAppTemplatesService(platform),
    null
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
})

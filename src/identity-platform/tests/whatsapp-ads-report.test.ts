// @vitest-environment node

// The daily ads report on WhatsApp (whatsapp/ads-report.ts): the day's figures and the week's
// findings as the template's parameters (Meta's rules: no empty values or line breaks), the
// organization's settings, and the scheduled pass sending each report once a day.
import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CheckupResult } from "../campaigns/checkup"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import {
  adsReportHasNews,
  adsReportParameters,
  buildAdsReport,
  renderAdsReport,
  WhatsAppAdsReportService,
} from "../whatsapp/ads-report"
import { WhatsAppPlatformService } from "../whatsapp/platform-config"
import { ADS_REPORT_TEMPLATE, WhatsAppTemplatesService } from "../whatsapp/templates"

const ORG = "20000000-0000-0000-0000-000000000001"
const USER = "10000000-0000-0000-0000-000000000001"

function checkup(overrides: Partial<CheckupResult> = {}): CheckupResult {
  return {
    range: { startDate: "2026-01-14", endDate: "2026-01-14", days: 1 },
    funnel: {
      currency: "SAR",
      spend: 150,
      impressions: 12400,
      clicks: 310,
      pageViews: 120,
      conversions: 4,
      cpa: 37.5,
    },
    campaigns: [
      {
        id: "c1",
        platform: "Snapchat",
        name: "عروض الشتاء",
        status: "ACTIVE",
        state: "running",
        currency: "SAR",
        dailyBudget: 100,
        spendToday: 0,
        spend: 100,
        impressions: 9000,
        clicks: 210,
        pageViews: 120,
        conversions: 3,
        cpa: 33.33,
      },
      {
        id: "c2",
        platform: "TikTok",
        name: "فيديو الكاشير",
        status: "ACTIVE",
        state: "running",
        currency: "SAR",
        dailyBudget: 75,
        spendToday: 0,
        spend: 50,
        impressions: 3400,
        clicks: 100,
        pageViews: null,
        conversions: 1,
        cpa: 50,
      },
      {
        id: "c3",
        platform: "Meta",
        name: "متوقفة",
        status: "PAUSED",
        state: "paused",
        currency: "SAR",
        dailyBudget: null,
        spendToday: 0,
        spend: 0,
        impressions: 0,
        clicks: 0,
        pageViews: null,
        conversions: 0,
        cpa: 0,
      },
    ],
    findings: [],
    ads: [],
    ...overrides,
  }
}

const week = checkup({
  findings: [
    {
      kind: "budget_reached",
      severity: "medium",
      platform: "Snapchat",
      campaignId: "c1",
      campaignName: "عروض الشتاء",
      adName: null,
      currency: "SAR",
      values: { spendToday: 100, dailyBudget: 100 },
    },
    {
      kind: "spend_no_result",
      severity: "high",
      platform: "TikTok",
      campaignId: "c2",
      campaignName: "فيديو الكاشير",
      adName: "إعلان\nبسطرين",
      currency: "SAR",
      values: { spend: 80, usualCpa: 37.5 },
    },
  ],
})

describe("the ads report's message", () => {
  it("fills the template's 12 values with no empty value or line break", () => {
    const report = buildAdsReport(checkup(), week)
    const values = adsReportParameters(report)
    expect(values).toHaveLength(12)
    expect(ADS_REPORT_TEMPLATE.bodyExamples).toHaveLength(12)
    for (const value of values) {
      expect(value.length).toBeGreaterThan(0)
      expect(value).not.toMatch(/\n/)
    }
    expect(values[0]).toBe("2026-01-14")
    expect(values[1]).toBe("150 ر.س")
    expect(values[5]).toBe("37.5 ر.س")
    // A platform with nothing shown that day is left out; the busiest comes first.
    expect(values[6]).toBe("سناب شات: 100 ر.س · نقرات 210 · نتائج 3")
    expect(values[7]).toBe("تيك توك: 50 ر.س · نقرات 100 · نتائج 1")
    expect(values[8]).toBe("—")
    expect(values[9]).toBe("حملة «عروض الشتاء» وصلت ميزانيتها اليومية")
    expect(values[10]).toBe("إعلان «إعلان بسطرين» صرف 80 ر.س بلا نتيجة")
    expect(values[11]).toBe("—")
    expect(renderAdsReport(report)).not.toMatch(/\{\{/)
  })

  it("says so when there is nothing to flag, and when currencies are mixed", () => {
    const mixed = checkup({
      funnel: { ...checkup().funnel, currency: null, spend: null, cpa: null },
    })
    const values = adsReportParameters(buildAdsReport(mixed, checkup()))
    expect(values[1]).toBe("بأكثر من عملة")
    expect(values[5]).toBe("—")
    expect(values[9]).toBe("لا توجد ملاحظات، حملاتك تعمل بشكل طبيعي")
  })

  it("has no news when nothing was shown and nothing was found", () => {
    const quiet = checkup({
      funnel: {
        currency: "SAR",
        spend: 0,
        impressions: 0,
        clicks: 0,
        pageViews: null,
        conversions: 0,
        cpa: null,
      },
      campaigns: [],
    })
    expect(adsReportHasNews(buildAdsReport(quiet, quiet))).toBe(false)
    expect(adsReportHasNews(buildAdsReport(quiet, week))).toBe(true)
  })
})

describe("the ads report's settings and schedule", () => {
  let database: PostgresDatabase
  let service: WhatsAppAdsReportService
  let dayResult: CheckupResult
  const asked: Array<{ startDate?: string; endDate?: string }> = []

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
    dayResult = checkup()
    asked.length = 0
    service = new WhatsAppAdsReportService(
      database,
      platform,
      new WhatsAppTemplatesService(platform),
      {
        run: async (actor, query) => {
          expect(actor.organizationId).toBe(ORG)
          asked.push(query)
          return query.startDate === query.endDate ? dayResult : week
        },
      }
    )
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await database.end()
  })

  function fakeWhatsApp() {
    const sent: Array<{
      to: string
      template: { name: string; components: Array<{ parameters: Array<{ text: string }> }> }
    }> = []
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = new URL(String(input))
      const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 })
      if (url.pathname.endsWith("/message_templates")) {
        return json({
          data: [{ name: ADS_REPORT_TEMPLATE.name, language: "ar", status: "APPROVED" }],
        })
      }
      if (url.pathname.endsWith("/messages")) {
        sent.push(JSON.parse(String(init?.body)))
        return json({ messages: [{ id: `wamid.${sent.length}` }] })
      }
      return json({})
    })
    return sent
  }

  it("starts off, at 09:00, and checks what is saved", async () => {
    expect(await service.getSettings(ORG)).toMatchObject({
      enabled: false,
      sendTime: "09:00",
      recipients: [],
      maxRecipients: 2,
    })
    await expect(
      service.updateSettings(ORG, USER, { enabled: true, sendTime: "09:00", recipients: [] })
    ).rejects.toMatchObject({ code: "ADS_REPORT_NO_RECIPIENTS" })
    await expect(
      service.updateSettings(ORG, USER, {
        enabled: true,
        sendTime: "09:00",
        recipients: [{ phone: "123", name: "" }],
      })
    ).rejects.toMatchObject({ code: "WHATSAPP_INVALID_PHONE" })
    const saved = await service.updateSettings(ORG, USER, {
      enabled: true,
      sendTime: "08:30",
      recipients: [
        { phone: "0501234567", name: "المالك" },
        { phone: "+966501234567", name: "مكرر" },
      ],
    })
    expect(saved.recipients).toEqual([{ phone: "966501234567", name: "المالك" }])
    expect(saved.sendTime).toBe("08:30")
  })

  it("sends yesterday's report once a day, once its time has come", async () => {
    const sent = fakeWhatsApp()
    await service.updateSettings(ORG, USER, {
      enabled: true,
      sendTime: "09:00",
      recipients: [{ phone: "0501234567", name: "المالك" }],
    })

    // 08:30 Riyadh: not yet.
    expect((await service.runDue(new Date("2026-01-15T05:30:00Z"))).organizations).toBe(0)
    // 09:05 Riyadh on the 15th: the 14th's figures, the week up to the 14th for findings.
    expect(await service.runDue(new Date("2026-01-15T06:05:00Z"))).toEqual({
      organizations: 1,
      sent: 1,
      failed: 0,
    })
    expect(asked).toEqual(
      expect.arrayContaining([
        { startDate: "2026-01-14", endDate: "2026-01-14" },
        { startDate: "2026-01-08", endDate: "2026-01-14" },
      ])
    )
    expect(sent[0].to).toBe("966501234567")
    expect(sent[0].template.name).toBe("madar_ads_report")
    expect(sent[0].template.components[0].parameters).toHaveLength(12)
    // Later the same day: not again. The next day: again.
    expect((await service.runDue(new Date("2026-01-15T10:00:00Z"))).organizations).toBe(0)
    expect((await service.runDue(new Date("2026-01-16T06:05:00Z"))).organizations).toBe(1)

    const log = await database.query<{ kind: string; status: string }>(
      `select kind, status from whatsapp_messages where organization_id = $1`,
      [ORG]
    )
    expect(log.rows).toEqual([
      { kind: "ads_report", status: "sent" },
      { kind: "ads_report", status: "sent" },
    ])
  })

  it("sends nothing on a morning with nothing to say", async () => {
    const sent = fakeWhatsApp()
    await service.updateSettings(ORG, USER, {
      enabled: true,
      sendTime: "09:00",
      recipients: [{ phone: "0501234567", name: "" }],
    })
    dayResult = checkup({
      funnel: {
        currency: "SAR",
        spend: 0,
        impressions: 0,
        clicks: 0,
        pageViews: null,
        conversions: 0,
        cpa: null,
      },
      campaigns: [],
      findings: [],
    })
    const quietWeek = week.findings.splice(0)
    try {
      expect((await service.runDue(new Date("2026-01-15T06:05:00Z"))).organizations).toBe(0)
      expect(sent).toHaveLength(0)
    } finally {
      week.findings.push(...quietWeek)
    }
  })
})

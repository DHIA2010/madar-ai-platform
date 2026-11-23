import { randomUUID } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import type { CheckupFinding, CheckupResult } from "../campaigns/checkup"
import type { CampaignPerformanceQuery } from "../campaigns/performance-service"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { sendTemplateMessage } from "./messaging"
import { toWhatsAppNumber } from "./phone"
import type { WhatsAppPlatformService } from "./platform-config"
import type { AddonsService } from "../subscriptions/addons"

import { DAILY_REPORT_ADDON } from "./daily-report"
import { ADS_REPORT_TEMPLATE, type WhatsAppTemplatesService } from "./templates"

// The daily ads report on WhatsApp: every morning, at the time the organization picks (Riyadh
// time), Madar sends its approved "madar_ads_report" template from Madar's number -- what the ads
// spent and brought the day before on every connected ad platform, and the check-up's most
// important findings (campaigns/checkup.ts) so the merchant knows what needs a look without
// opening the app.
//
// The figures are the day before the send (the last full day); the findings come from the last
// seven days, because one day is too little to judge an ad by. A morning with nothing to say --
// no ad shown yesterday and no finding -- sends nothing.

export interface AdsReportRecipient {
  phone: string
  name: string
}

export interface AdsReportSettings {
  enabled: boolean
  // "HH:MM", Riyadh.
  sendTime: string
  recipients: AdsReportRecipient[]
  lastSentOn: string | null
  // How many numbers the organization's plan sends to.
  maxRecipients: number
  // The same plan as the cashier's daily report: the paid add-on while it runs, free otherwise.
  plan: { paid: boolean; until: string | null }
  // On the free plan an account has one scheduled report across all its apps. "pos" says that
  // one is in use by the cashier's daily report, so this report waits for the paid plan.
  freeUsedBy: "pos" | null
}

export interface AdsReportSettingsInput {
  enabled: boolean
  sendTime: string
  recipients: AdsReportRecipient[]
}

// The plans, the same way the cashier's daily report has them (daily-report.ts): the free report
// goes to one number, which stays fixed once saved; the paid add-on sends to up to five.
export const FREE_ADS_REPORT_RECIPIENTS = 1
export const PAID_ADS_REPORT_RECIPIENTS = 5
export const MAX_ADS_REPORT_RECIPIENTS = PAID_ADS_REPORT_RECIPIENTS
const needsPaidPlan = (code: string, message: string) =>
  new IdentityError(code, 403, "business", message)
const DEFAULT_SEND_TIME = "09:00"
const FINDINGS_DAYS = 7

export interface AdsReport {
  day: string
  // Null when the day's campaigns are billed in more than one currency.
  currency: string | null
  spend: number | null
  impressions: number
  clicks: number
  conversions: number
  cpa: number | null
  platforms: Array<{
    platform: string
    currency: string | null
    spend: number
    clicks: number
    conversions: number
  }>
  notes: string[]
}

// Saudi Arabia has no daylight saving: Riyadh is always UTC+3.
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000
const toRiyadh = (date: Date) => new Date(date.getTime() + RIYADH_OFFSET_MS)
const riyadhDay = (date: Date) => toRiyadh(date).toISOString().slice(0, 10)
const riyadhTime = (date: Date) => toRiyadh(date).toISOString().slice(11, 16)

function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const isValidTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)

const amount = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Math.round(value * 100) / 100)

const money = (value: number, currency: string | null) =>
  `${amount(value)} ${!currency || currency === "SAR" ? "ر.س" : currency}`

// A template parameter can't be empty or hold a line break, and is kept short.
function param(value: string, max = 80): string {
  const clean = value.replace(/\s+/g, " ").trim()
  if (!clean) return "—"
  return clean.length > max ? `${clean.slice(0, max - 3)}...` : clean
}

const PLATFORM_NAMES: Record<string, string> = {
  Snapchat: "سناب شات",
  TikTok: "تيك توك",
  Meta: "ميتا",
  "Google Search": "بحث قوقل",
  "Google Display": "شبكة قوقل الإعلانية",
  YouTube: "يوتيوب",
}

const shortName = (name: string) => {
  const clean = name.replace(/\s+/g, " ").trim()
  return clean.length > 26 ? `${clean.slice(0, 25)}…` : clean
}

// One finding as one short line, the way the check-up screen words it.
export function findingNote(finding: CheckupFinding): string {
  const campaign = `«${shortName(finding.campaignName)}»`
  const ad = `«${shortName(finding.adName ?? finding.campaignName)}»`
  const number = (key: string) => {
    const value = finding.values[key]
    return typeof value === "number" ? value : 0
  }
  switch (finding.kind) {
    case "not_delivering":
      return `حملة ${campaign} مفعّلة لكنها لا تظهر للناس`
    case "budget_reached":
      return `حملة ${campaign} وصلت ميزانيتها اليومية`
    case "budget_unspent":
      return `حملة ${campaign} لم تصرف نصف ميزانيتها أمس`
    case "clicks_no_result":
      return `حملة ${campaign}: ${amount(number("clicks"))} نقرة بلا أي نتيجة`
    case "budget_hog":
      return `إعلان ${ad} يأخذ ${amount(number("share"))}% من الميزانية بنتائج أضعف`
    case "spend_no_result":
      return `إعلان ${ad} صرف ${money(number("spend"), finding.currency)} بلا نتيجة`
    case "low_ctr":
      return `إعلان ${ad} نقراته أقل من بقية الإعلانات`
  }
}

// The day's figures and the week's findings as one report.
export function buildAdsReport(day: CheckupResult, week: CheckupResult): AdsReport {
  const byPlatform = new Map<string, AdsReport["platforms"][number]>()
  for (const campaign of day.campaigns) {
    if (campaign.spend <= 0 && campaign.impressions <= 0) continue
    const key = `${campaign.platform}|${campaign.currency ?? ""}`
    const row = byPlatform.get(key) ?? {
      platform: campaign.platform,
      currency: campaign.currency,
      spend: 0,
      clicks: 0,
      conversions: 0,
    }
    row.spend += campaign.spend
    row.clicks += campaign.clicks
    row.conversions += campaign.conversions
    byPlatform.set(key, row)
  }
  return {
    day: day.range.endDate,
    currency: day.funnel.currency,
    spend: day.funnel.spend,
    impressions: day.funnel.impressions,
    clicks: day.funnel.clicks,
    conversions: day.funnel.conversions,
    cpa: day.funnel.cpa,
    platforms: [...byPlatform.values()].sort((a, b) => b.spend - a.spend),
    notes: week.findings.map(findingNote),
  }
}

// Whether the report says anything: an ad was shown that day, or the check-up found something.
export const adsReportHasNews = (report: AdsReport) =>
  report.impressions > 0 || (report.spend ?? 0) > 0 || report.notes.length > 0

// The template's 12 body parameters, in order.
export function adsReportParameters(report: AdsReport): string[] {
  const platforms = [0, 1, 2].map((index) => {
    const row = report.platforms[index]
    if (!row) return "—"
    const name = PLATFORM_NAMES[row.platform] ?? row.platform
    return param(
      `${name}: ${money(row.spend, row.currency)} · نقرات ${amount(row.clicks)} · نتائج ${amount(row.conversions)}`
    )
  })
  const notes =
    report.notes.length > 0
      ? [0, 1, 2].map((index) => param(report.notes[index] ?? "—"))
      : ["لا توجد ملاحظات، حملاتك تعمل بشكل طبيعي", "—", "—"]
  return [
    param(report.day),
    param(report.spend === null ? "بأكثر من عملة" : money(report.spend, report.currency)),
    param(amount(report.impressions)),
    param(amount(report.clicks)),
    param(amount(report.conversions)),
    param(report.cpa && report.cpa > 0 ? money(report.cpa, report.currency) : "—"),
    ...platforms,
    ...notes,
  ]
}

// The message as the recipient sees it -- for the preview in settings.
export function renderAdsReport(report: AdsReport): string {
  const values = adsReportParameters(report)
  return ADS_REPORT_TEMPLATE.body.replace(/\{\{(\d+)\}\}/g, (_, index) => values[Number(index) - 1])
}

// The part of the check-up this report needs (campaigns/checkup.ts).
export interface AdsReportCheckup {
  run(actor: AuthenticatedActor, query: CampaignPerformanceQuery): Promise<CheckupResult>
}

export class WhatsAppAdsReportService {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly platform: WhatsAppPlatformService,
    private readonly templates: WhatsAppTemplatesService,
    private readonly checkup: AdsReportCheckup,
    // Optional: without it every organization is on the free plan.
    private readonly addons: AddonsService | null = null
  ) {}

  // The organization's plan: the paid add-on for scheduled reports while it runs.
  private async plan(organizationId: string): Promise<AdsReportSettings["plan"]> {
    const active = this.addons
      ? await this.addons.active(organizationId, DAILY_REPORT_ADDON).catch(() => null)
      : null
    return active ? { paid: true, until: active.currentPeriodEnd } : { paid: false, until: null }
  }

  // Whether the cashier's daily report is switched on: on the free plan it holds the account's
  // one free report.
  private async posReportEnabled(organizationId: string): Promise<boolean> {
    const result = await this.db.query<{ enabled: boolean }>(
      `SELECT enabled FROM whatsapp_daily_report_settings WHERE organization_id = $1`,
      [organizationId]
    )
    return result.rows[0]?.enabled === true
  }

  private async stored(organizationId: string) {
    const result = await this.db.query<{
      enabled: boolean
      send_time: string
      recipients: unknown
      last_sent_on: unknown
    }>(
      `SELECT enabled, send_time, recipients, last_sent_on
         FROM whatsapp_ads_report_settings WHERE organization_id = $1`,
      [organizationId]
    )
    const row = result.rows[0]
    if (!row) {
      return {
        enabled: false,
        sendTime: DEFAULT_SEND_TIME,
        recipients: [] as AdsReportRecipient[],
        lastSentOn: null as string | null,
      }
    }
    const recipients =
      typeof row.recipients === "string" ? JSON.parse(row.recipients) : row.recipients
    const lastSent = row.last_sent_on
    return {
      enabled: row.enabled,
      sendTime: isValidTime(row.send_time) ? row.send_time : DEFAULT_SEND_TIME,
      recipients: Array.isArray(recipients) ? (recipients as AdsReportRecipient[]) : [],
      lastSentOn: lastSent
        ? (lastSent instanceof Date
            ? new Date(lastSent.getTime() - lastSent.getTimezoneOffset() * 60_000)
            : new Date(String(lastSent))
          )
            .toISOString()
            .slice(0, 10)
        : null,
    }
  }

  async getSettings(organizationId: string): Promise<AdsReportSettings> {
    const [stored, plan, posEnabled] = await Promise.all([
      this.stored(organizationId),
      this.plan(organizationId),
      this.posReportEnabled(organizationId),
    ])
    return {
      ...stored,
      maxRecipients: plan.paid ? PAID_ADS_REPORT_RECIPIENTS : FREE_ADS_REPORT_RECIPIENTS,
      plan,
      freeUsedBy: !plan.paid && posEnabled ? "pos" : null,
    }
  }

  async updateSettings(
    organizationId: string,
    actorUserId: string | null,
    input: AdsReportSettingsInput
  ): Promise<AdsReportSettings> {
    if (!isValidTime(input.sendTime)) {
      throw new IdentityError("ADS_REPORT_INVALID_TIME", 400, "validation", "Pick a valid time.")
    }
    const recipients: AdsReportRecipient[] = []
    for (const recipient of input.recipients) {
      const phone = toWhatsAppNumber(recipient.phone)
      if (!phone) {
        throw new IdentityError(
          "WHATSAPP_INVALID_PHONE",
          400,
          "validation",
          `"${recipient.phone}" isn't a valid mobile number.`
        )
      }
      if (!recipients.some((entry) => entry.phone === phone)) {
        recipients.push({ phone, name: recipient.name.trim().slice(0, 80) })
      }
    }
    const plan = await this.plan(organizationId)
    if (plan.paid && recipients.length > PAID_ADS_REPORT_RECIPIENTS) {
      throw new IdentityError(
        "ADS_REPORT_TOO_MANY_RECIPIENTS",
        400,
        "validation",
        `Up to ${PAID_ADS_REPORT_RECIPIENTS} numbers.`
      )
    }
    if (!plan.paid) {
      if (recipients.length > FREE_ADS_REPORT_RECIPIENTS) {
        throw needsPaidPlan(
          "ADS_REPORT_PLAN_LIMIT",
          "The free report goes to one number -- more need the paid plan."
        )
      }
      // One free report for the whole account: while the cashier's is on, this one is paid.
      if (input.enabled && (await this.posReportEnabled(organizationId))) {
        throw needsPaidPlan(
          "REPORT_FREE_SLOT_USED",
          "The account's free report is in use by the cashier's daily report."
        )
      }
      // The free report's number is fixed once saved (otherwise one free number could be
      // rotated between any number of people).
      const savedPhone = (await this.stored(organizationId)).recipients[0]?.phone
      if (savedPhone && recipients[0]?.phone !== savedPhone) {
        throw needsPaidPlan(
          "ADS_REPORT_NUMBER_LOCKED",
          "The free report's number can't be changed -- changing it needs the paid plan."
        )
      }
    }
    if (input.enabled && recipients.length === 0) {
      throw new IdentityError(
        "ADS_REPORT_NO_RECIPIENTS",
        400,
        "validation",
        "Add at least one number to receive the report."
      )
    }
    await this.db.query(
      `INSERT INTO whatsapp_ads_report_settings
         (organization_id, enabled, send_time, recipients, updated_by, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, now())
       ON CONFLICT (organization_id) DO UPDATE SET
         enabled = EXCLUDED.enabled, send_time = EXCLUDED.send_time,
         recipients = EXCLUDED.recipients, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [organizationId, input.enabled, input.sendTime, JSON.stringify(recipients), actorUserId]
    )
    return this.getSettings(organizationId)
  }

  // The report for one day (the day before `now` by default), across all the organization's
  // connected ad platforms.
  async build(organizationId: string, now = new Date(), day?: string): Promise<AdsReport> {
    const reportDay = day ?? shiftDay(riyadhDay(now), -1)
    // The check-up reads by organization only, so the scheduled pass needs no signed-in user.
    const actor: AuthenticatedActor = {
      userId: "system",
      sessionId: "system",
      organizationId,
      workspaceId: null,
      roles: [],
      modulePermissions: [],
    }
    const [dayResult, weekResult] = await Promise.all([
      this.checkup.run(actor, { startDate: reportDay, endDate: reportDay }),
      this.checkup.run(actor, {
        startDate: shiftDay(reportDay, -(FINDINGS_DAYS - 1)),
        endDate: reportDay,
      }),
    ])
    return buildAdsReport(dayResult, weekResult)
  }

  // The report as it would be sent now, and whether WhatsApp has approved its template yet.
  async preview(
    organizationId: string,
    now = new Date()
  ): Promise<{ day: string; text: string; ready: boolean }> {
    const report = await this.build(organizationId, now)
    const ready = await this.templates
      .requireApproved(ADS_REPORT_TEMPLATE)
      .then(() => true)
      .catch(() => false)
    return { day: report.day, text: renderAdsReport(report), ready }
  }

  // Sends a report to the organization's numbers; each send is kept in whatsapp_messages.
  async send(
    organizationId: string,
    report: AdsReport,
    recipients?: AdsReportRecipient[]
  ): Promise<{ sent: number; failed: number }> {
    const to = recipients ?? (await this.stored(organizationId)).recipients
    if (to.length === 0) {
      throw new IdentityError(
        "ADS_REPORT_NO_RECIPIENTS",
        400,
        "validation",
        "Add at least one number to receive the report."
      )
    }
    await this.templates.requireApproved(ADS_REPORT_TEMPLATE)
    const context = await this.platform.sendingContext()
    const parameters = adsReportParameters(report)
    let sent = 0
    let failed = 0
    const limit = (await this.plan(organizationId)).paid
      ? PAID_ADS_REPORT_RECIPIENTS
      : FREE_ADS_REPORT_RECIPIENTS
    for (const recipient of to.slice(0, limit)) {
      let waMessageId: string | null = null
      let error: string | null = null
      try {
        waMessageId = await sendTemplateMessage(context.auth, context.phoneNumberId, {
          to: recipient.phone,
          templateName: ADS_REPORT_TEMPLATE.name,
          language: ADS_REPORT_TEMPLATE.language,
          bodyParameters: parameters,
        })
        sent += 1
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught)
        failed += 1
      }
      await this.db.query(
        `INSERT INTO whatsapp_messages
           (id, organization_id, kind, reference_id, to_phone, template_name, wa_message_id, status,
            error)
         VALUES ($1, $2, 'ads_report', NULL, $3, $4, $5, $6, $7)`,
        [
          randomUUID(),
          organizationId,
          recipient.phone,
          ADS_REPORT_TEMPLATE.name,
          waMessageId,
          waMessageId ? "sent" : "failed",
          error,
        ]
      )
    }
    return { sent, failed }
  }

  // The scheduled pass: every organization whose time has come today and whose report hasn't gone
  // out yet. The day is claimed before sending, so several backend tasks never send it twice.
  async runDue(now = new Date()): Promise<{ organizations: number; sent: number; failed: number }> {
    const today = riyadhDay(now)
    const nowTime = riyadhTime(now)
    const rows = await this.db.query<{ organization_id: string }>(
      `SELECT organization_id FROM whatsapp_ads_report_settings
        WHERE enabled = true AND send_time <= $1
          AND (last_sent_on IS NULL OR last_sent_on < $2::date)`,
      [nowTime, today]
    )
    let organizations = 0
    let sent = 0
    let failed = 0
    for (const { organization_id: organizationId } of rows.rows) {
      const claim = await this.db.query(
        `UPDATE whatsapp_ads_report_settings SET last_sent_on = $2::date
          WHERE organization_id = $1 AND (last_sent_on IS NULL OR last_sent_on < $2::date)
          RETURNING organization_id`,
        [organizationId, today]
      )
      if (claim.rows.length === 0) continue
      try {
        // On the free plan the account's one report is the cashier's while that one is on.
        if (
          !(await this.plan(organizationId)).paid &&
          (await this.posReportEnabled(organizationId))
        ) {
          continue
        }
        const report = await this.build(organizationId, now)
        if (!adsReportHasNews(report)) continue
        const result = await this.send(organizationId, report)
        organizations += 1
        sent += result.sent
        failed += result.failed
      } catch (error) {
        console.error("whatsapp.ads_report_failed", { organizationId, error })
      }
    }
    return { organizations, sent, failed }
  }
}

// The one instance the API server builds, for the backend's scheduled pass (server.ts) -- tests
// build servers too, and never start the timer.
let registered: WhatsAppAdsReportService | null = null
export const registerAdsReportService = (service: WhatsAppAdsReportService | null) => {
  registered = service
}
export const registeredAdsReportService = () => registered

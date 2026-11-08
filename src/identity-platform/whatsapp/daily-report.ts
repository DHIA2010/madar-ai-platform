import { randomUUID } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { PAYMENT_METHOD_CATALOG, type PaymentKind } from "../pos/payment-methods-service"
import type { PosShiftsService } from "../pos/shifts-service"
import { ReadyReportsRepository } from "../reports/ready-reports-repository"
import { toWhatsAppNumber } from "./invoice-sender"
import { sendTemplateMessage } from "./messaging"
import type { WhatsAppPlatformService } from "./platform-config"
import { DAILY_REPORT_TEMPLATE, type WhatsAppTemplatesService } from "./templates"

// The daily store report on WhatsApp: at the time each organization picks (Riyadh time), Madar
// sends its approved "madar_daily_report" template from Madar's number to the numbers the
// organization chose -- sales, purchases, expenses, returns, shifts, payment methods, best
// sellers and low stock for the day, across all its branches.
//
// Which day: a morning send (before noon) reports the day before; a later one reports the day it
// is sent on, up to that moment -- so 09:00 brings yesterday's closing figures and 23:00 brings
// today's.

export interface DailyReportRecipient {
  phone: string
  name: string
}

export interface DailyReportSettings {
  enabled: boolean
  // "HH:MM", Riyadh time.
  sendTime: string
  recipients: DailyReportRecipient[]
  lastSentOn: string | null
}

export interface DailyReportSettingsInput {
  enabled: boolean
  sendTime: string
  recipients: DailyReportRecipient[]
}

export const MAX_DAILY_REPORT_RECIPIENTS = 5

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

// The instants a Riyadh day covers: [00:00, next day 00:00) Riyadh.
function dayBounds(day: string): { start: Date; end: Date } {
  const start = new Date(new Date(`${day}T00:00:00.000Z`).getTime() - RIYADH_OFFSET_MS)
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) }
}

// The day a send at `now` reports on (see the note at the top).
export function reportDayFor(now: Date): string {
  const today = riyadhDay(now)
  return riyadhTime(now) < "12:00" ? shiftDay(today, -1) : today
}

const amount = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Math.round(value * 100) / 100)

// A template parameter can't be empty or hold a line break, and is kept short.
function param(value: string): string {
  const clean = value.replace(/\s+/g, " ").trim()
  if (!clean) return "—"
  return clean.length > 60 ? `${clean.slice(0, 57)}...` : clean
}

export interface DailyReport {
  day: string
  sales: number
  purchases: number
  expenses: number
  returns: number
  shifts: { total: number; closed: number; open: number; cashDifference: number; hours: number }
  payments: { cash: number; card: number; transfer: number; other: number }
  bestSellers: Array<{ name: string; quantity: number }>
  lowStock: Array<{ name: string; stock: number }>
}

// The template's 20 body parameters, in order.
export function dailyReportParameters(report: DailyReport): string[] {
  const list = <T>(items: T[], format: (item: T) => string) =>
    [0, 1, 2].map((index) => param(items[index] ? format(items[index]) : "—"))
  return [
    param(report.day),
    param(amount(report.sales)),
    param(amount(report.purchases)),
    param(amount(report.expenses)),
    param(amount(report.returns)),
    param(report.shifts.total ? String(report.shifts.total) : "—"),
    param(report.shifts.total ? String(report.shifts.closed) : "—"),
    param(report.shifts.total ? String(report.shifts.open) : "—"),
    param(report.shifts.closed ? amount(report.shifts.cashDifference) : "—"),
    param(report.shifts.closed ? `${amount(report.shifts.hours)} ساعة` : "—"),
    param(amount(report.payments.cash)),
    param(amount(report.payments.card)),
    param(amount(report.payments.transfer)),
    param(amount(report.payments.other)),
    ...list(report.bestSellers, (item) => `${item.name}: ${amount(item.quantity)}`),
    ...list(report.lowStock, (item) => `${item.name}: ${amount(item.stock)}`),
  ]
}

// The message as the recipient sees it -- for the preview in settings.
export function renderDailyReport(report: DailyReport): string {
  const values = dailyReportParameters(report)
  return DAILY_REPORT_TEMPLATE.body.replace(
    /\{\{(\d+)\}\}/g,
    (_, index) => values[Number(index) - 1]
  )
}

const KIND_BY_CODE = new Map<string, PaymentKind>(
  PAYMENT_METHOD_CATALOG.map((entry) => [entry.code, entry.kind])
)

const isValidTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)

export class WhatsAppDailyReportService {
  private readonly readyReports: ReadyReportsRepository

  constructor(
    private readonly db: PostgresDatabase,
    private readonly platform: WhatsAppPlatformService,
    private readonly templates: WhatsAppTemplatesService,
    private readonly shifts: PosShiftsService | null
  ) {
    this.readyReports = new ReadyReportsRepository(db)
  }

  async getSettings(organizationId: string): Promise<DailyReportSettings> {
    const result = await this.db.query<{
      enabled: boolean
      send_time: string
      recipients: unknown
      last_sent_on: unknown
    }>(
      `SELECT enabled, send_time, recipients, last_sent_on FROM whatsapp_daily_report_settings
        WHERE organization_id = $1`,
      [organizationId]
    )
    const row = result.rows[0]
    if (!row) return { enabled: false, sendTime: "23:00", recipients: [], lastSentOn: null }
    const recipients =
      typeof row.recipients === "string" ? JSON.parse(row.recipients) : row.recipients
    return {
      enabled: row.enabled,
      sendTime: row.send_time,
      recipients: Array.isArray(recipients) ? (recipients as DailyReportRecipient[]) : [],
      lastSentOn: row.last_sent_on
        ? (row.last_sent_on instanceof Date
            ? new Date(row.last_sent_on.getTime() - row.last_sent_on.getTimezoneOffset() * 60_000)
            : new Date(String(row.last_sent_on))
          )
            .toISOString()
            .slice(0, 10)
        : null,
    }
  }

  async updateSettings(
    organizationId: string,
    actorUserId: string | null,
    input: DailyReportSettingsInput
  ): Promise<DailyReportSettings> {
    if (!isValidTime(input.sendTime)) {
      throw new IdentityError("DAILY_REPORT_INVALID_TIME", 400, "validation", "Pick a valid time.")
    }
    const recipients: DailyReportRecipient[] = []
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
    if (recipients.length > MAX_DAILY_REPORT_RECIPIENTS) {
      throw new IdentityError(
        "DAILY_REPORT_TOO_MANY_RECIPIENTS",
        400,
        "validation",
        `Up to ${MAX_DAILY_REPORT_RECIPIENTS} numbers.`
      )
    }
    if (input.enabled && recipients.length === 0) {
      throw new IdentityError(
        "DAILY_REPORT_NO_RECIPIENTS",
        400,
        "validation",
        "Add at least one number to receive the report."
      )
    }
    await this.db.query(
      `INSERT INTO whatsapp_daily_report_settings
         (organization_id, enabled, send_time, recipients, updated_by, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, now())
       ON CONFLICT (organization_id) DO UPDATE SET
         enabled = EXCLUDED.enabled, send_time = EXCLUDED.send_time,
         recipients = EXCLUDED.recipients, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [organizationId, input.enabled, input.sendTime, JSON.stringify(recipients), actorUserId]
    )
    return this.getSettings(organizationId)
  }

  // The figures for one Riyadh day, across all the organization's branches.
  async build(organizationId: string, day: string): Promise<DailyReport> {
    const { start, end } = dayBounds(day)
    const sum = async (sql: string, params: unknown[]) =>
      Number((await this.db.query<{ total: unknown }>(sql, params)).rows[0]?.total ?? 0)

    const [sales, returns, expenses, purchaseRows] = await Promise.all([
      sum(
        `SELECT COALESCE(SUM(total_amount), 0) AS total FROM pos_invoices
          WHERE organization_id = $1 AND status <> 'cancelled' AND created_at >= $2 AND created_at < $3`,
        [organizationId, start, end]
      ),
      sum(
        `SELECT COALESCE(SUM(total_amount), 0) AS total FROM pos_invoice_returns
          WHERE organization_id = $1 AND created_at >= $2 AND created_at < $3`,
        [organizationId, start, end]
      ),
      sum(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses
          WHERE organization_id = $1 AND expense_date = $2 AND deleted_at IS NULL
            AND status <> 'cancelled'`,
        [organizationId, day]
      ),
      this.readyReports
        .purchaseInvoices({ organizationId, workspaceId: null, from: day, to: day })
        .catch(() => []),
    ])
    const purchases = purchaseRows.reduce((total, row) => total + row.total, 0)

    // Payment methods, grouped the way the report lists them.
    const paymentRows = await this.db.query<{ code: string; total: unknown }>(
      `SELECT pip.payment_method_code AS code, SUM(pip.amount) AS total
         FROM pos_invoice_payments pip
         JOIN pos_invoices pi ON pi.id = pip.invoice_id
        WHERE pi.organization_id = $1 AND pi.status <> 'cancelled'
          AND pi.created_at >= $2 AND pi.created_at < $3
        GROUP BY pip.payment_method_code`,
      [organizationId, start, end]
    )
    const customKinds = await this.db.query<{ code: string; settings: unknown }>(
      `SELECT code, settings FROM pos_payment_methods
        WHERE organization_id = $1 AND is_custom = true AND deleted_at IS NULL`,
      [organizationId]
    )
    const customKind = new Map(
      customKinds.rows.map((row) => {
        const settings = (
          typeof row.settings === "string" ? JSON.parse(row.settings) : row.settings
        ) as { kind?: PaymentKind } | null
        return [row.code, settings?.kind ?? "cash"] as const
      })
    )
    const payments = { cash: 0, card: 0, transfer: 0, other: 0 }
    for (const row of paymentRows.rows) {
      const kind = KIND_BY_CODE.get(row.code) ?? customKind.get(row.code)
      const key = kind === "cash" || kind === "card" || kind === "transfer" ? kind : "other"
      payments[key] += Number(row.total ?? 0)
    }

    // Shifts opened that day.
    const shiftRows = await this.db.query<{
      id: string
      status: string
      opened_at: unknown
      closed_at: unknown
      closing_cash_amount: unknown
    }>(
      `SELECT id, status, opened_at, closed_at, closing_cash_amount FROM pos_shifts
        WHERE organization_id = $1 AND opened_at >= $2 AND opened_at < $3`,
      [organizationId, start, end]
    )
    let cashDifference = 0
    let hours = 0
    let closed = 0
    for (const shift of shiftRows.rows) {
      if (shift.status !== "closed" || !shift.closed_at) continue
      closed += 1
      hours +=
        (new Date(
          String(shift.closed_at instanceof Date ? shift.closed_at.toISOString() : shift.closed_at)
        ).getTime() -
          new Date(
            String(
              shift.opened_at instanceof Date ? shift.opened_at.toISOString() : shift.opened_at
            )
          ).getTime()) /
        3_600_000
      const detail = this.shifts
        ? await this.shifts.getDetail(organizationId, shift.id).catch(() => null)
        : null
      if (detail && shift.closing_cash_amount !== null) {
        cashDifference += Number(shift.closing_cash_amount) - detail.cashSummary.expectedCashAmount
      }
    }

    const bestSellers = await this.db.query<{ name: string; quantity: unknown }>(
      `SELECT pii.product_name AS name, SUM(pii.quantity) AS quantity
         FROM pos_invoice_items pii
         JOIN pos_invoices pi ON pi.id = pii.invoice_id
        WHERE pi.organization_id = $1 AND pi.status <> 'cancelled'
          AND pi.created_at >= $2 AND pi.created_at < $3
        GROUP BY pii.product_name
        ORDER BY SUM(pii.quantity) DESC
        LIMIT 3`,
      [organizationId, start, end]
    )
    // At or below the product's minimum stock, or out of stock -- the lowest first.
    const lowStock = await this.db.query<{ name: string; stock: unknown }>(
      `SELECT name, stock_quantity AS stock FROM products
        WHERE organization_id = $1 AND deleted_at IS NULL AND stock_quantity IS NOT NULL
          AND (stock_quantity <= 0 OR (min_stock IS NOT NULL AND stock_quantity <= min_stock))
        ORDER BY stock_quantity ASC
        LIMIT 3`,
      [organizationId]
    )

    return {
      day,
      sales,
      purchases,
      expenses,
      returns,
      shifts: {
        total: shiftRows.rows.length,
        closed,
        open: shiftRows.rows.length - closed,
        cashDifference,
        hours,
      },
      payments,
      bestSellers: bestSellers.rows.map((row) => ({
        name: row.name,
        quantity: Number(row.quantity ?? 0),
      })),
      lowStock: lowStock.rows.map((row) => ({ name: row.name, stock: Number(row.stock ?? 0) })),
    }
  }

  async preview(organizationId: string, now = new Date()): Promise<{ day: string; text: string }> {
    const day = reportDayFor(now)
    return { day, text: renderDailyReport(await this.build(organizationId, day)) }
  }

  // Sends the report for `day` to every chosen number; each send is kept in whatsapp_messages.
  async send(
    organizationId: string,
    day: string,
    recipients?: DailyReportRecipient[]
  ): Promise<{ sent: number; failed: number }> {
    const to = recipients ?? (await this.getSettings(organizationId)).recipients
    if (to.length === 0) {
      throw new IdentityError(
        "DAILY_REPORT_NO_RECIPIENTS",
        400,
        "validation",
        "Add at least one number to receive the report."
      )
    }
    await this.templates.requireApproved(DAILY_REPORT_TEMPLATE)
    const context = await this.platform.sendingContext()
    const parameters = dailyReportParameters(await this.build(organizationId, day))
    let sent = 0
    let failed = 0
    for (const recipient of to) {
      let waMessageId: string | null = null
      let error: string | null = null
      try {
        waMessageId = await sendTemplateMessage(context.auth, context.phoneNumberId, {
          to: recipient.phone,
          templateName: DAILY_REPORT_TEMPLATE.name,
          language: DAILY_REPORT_TEMPLATE.language,
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
         VALUES ($1, $2, 'daily_report', NULL, $3, $4, $5, $6, $7)`,
        [
          randomUUID(),
          organizationId,
          recipient.phone,
          DAILY_REPORT_TEMPLATE.name,
          waMessageId,
          waMessageId ? "sent" : "failed",
          error,
        ]
      )
    }
    return { sent, failed }
  }

  // The scheduled pass: every organization whose chosen time has come today and hasn't had its
  // report yet. The day is claimed before sending, so several backend tasks never send twice.
  async runDue(now = new Date()): Promise<{ organizations: number; sent: number; failed: number }> {
    const today = riyadhDay(now)
    const due = await this.db.query<{ organization_id: string }>(
      `SELECT organization_id FROM whatsapp_daily_report_settings
        WHERE enabled = true AND send_time <= $1
          AND (last_sent_on IS NULL OR last_sent_on < $2)`,
      [riyadhTime(now), today]
    )
    let organizations = 0
    let sent = 0
    let failed = 0
    for (const { organization_id: organizationId } of due.rows) {
      const claimed = await this.db.query(
        `UPDATE whatsapp_daily_report_settings SET last_sent_on = $2
          WHERE organization_id = $1 AND (last_sent_on IS NULL OR last_sent_on < $2)
          RETURNING organization_id`,
        [organizationId, today]
      )
      if (claimed.rows.length === 0) continue
      organizations += 1
      try {
        const result = await this.send(organizationId, reportDayFor(now))
        sent += result.sent
        failed += result.failed
      } catch (error) {
        console.error("whatsapp.daily_report_failed", { organizationId, error })
      }
    }
    return { organizations, sent, failed }
  }
}

// The one instance the API server builds, for the backend's scheduled pass (server.ts) -- tests
// build servers too, and never start the timer.
let registered: WhatsAppDailyReportService | null = null
export const registerDailyReportService = (service: WhatsAppDailyReportService | null) => {
  registered = service
}
export const registeredDailyReportService = () => registered

import { randomUUID } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { PAYMENT_METHOD_CATALOG, type PaymentKind } from "../pos/payment-methods-service"
import type { PosShiftsService } from "../pos/shifts-service"
import { ReadyReportsRepository } from "../reports/ready-reports-repository"
import type { AddonsService } from "../subscriptions/addons"
import { toWhatsAppNumber } from "./invoice-sender"
import { sendTemplateMessage } from "./messaging"
import type { WhatsAppPlatformService } from "./platform-config"
import { DAILY_REPORT_TEMPLATE, type WhatsAppTemplatesService } from "./templates"

// The daily store report on WhatsApp: at the time each organization picks (Riyadh time), Madar
// sends its approved "madar_daily_report" template from Madar's number to the numbers the
// organization chose -- sales, purchases, expenses, returns, shifts, payment methods, best
// sellers and low stock for the day, across all its branches.
//
// Which period: by default a morning send (before noon) reports the whole day before, and a later
// one reports the day it is sent on, up to that moment -- so 09:00 brings yesterday's closing
// figures and 23:00 brings today's.
//
// Plans: every package includes the free report -- one number, one send a day, the default
// period. The paid add-on (subscriptions/addons.ts, "whatsapp_daily_report") allows up to five
// numbers and three sends a day, each covering a period of the merchant's choosing (from-to,
// Riyadh time). When the add-on lapses, the settings stay but only the first send and number
// are used, with the default period.

export interface DailyReportRecipient {
  phone: string
  name: string
}

// One send a day: when ("HH:MM", Riyadh), and the period it covers -- from/to "HH:MM", or both
// null for the default period. Each end of a chosen period names its day relative to the send
// (fromDay/toDay: 0 the send day, -1 the day before), so a period can run past midnight and past
// a whole day -- yesterday 00:00 to today 02:00 covers 26 hours. Without the days (periods saved
// before they existed), the period ends at the last `to` at or before the send and starts at the
// last `from` before that.
export interface DailyReportSchedule {
  sendTime: string
  from: string | null
  to: string | null
  fromDay?: -1 | 0 | null
  toDay?: -1 | 0 | null
}

export interface DailyReportLimits {
  recipients: number
  schedules: number
  customPeriod: boolean
}

export const FREE_DAILY_REPORT_LIMITS: DailyReportLimits = {
  recipients: 1,
  schedules: 1,
  customPeriod: false,
}
export const PAID_DAILY_REPORT_LIMITS: DailyReportLimits = {
  recipients: 5,
  schedules: 3,
  customPeriod: true,
}
export const DAILY_REPORT_ADDON = "whatsapp_daily_report"

export interface DailyReportWindow {
  start: string
  end: string
  // As the report's first line shows it, e.g. "2026-11-11 من 08:00 إلى 16:00".
  label: string
}

export interface DailyReportSettings {
  enabled: boolean
  // The first send's time -- kept for older clients.
  sendTime: string
  schedules: DailyReportSchedule[]
  recipients: DailyReportRecipient[]
  lastSentOn: string | null
  plan: { paid: boolean; until: string | null; limits: DailyReportLimits }
  // The period each send covers on its next run, in the order of `schedules` (only the sends
  // the current plan uses).
  coverage: Array<{ sendTime: string } & DailyReportWindow>
}

export interface DailyReportSettingsInput {
  enabled: boolean
  sendTime?: string
  schedules?: Array<{
    sendTime: string
    from?: string | null
    to?: string | null
    fromDay?: number | null
    toDay?: number | null
  }>
  recipients: DailyReportRecipient[]
}

export const MAX_DAILY_REPORT_RECIPIENTS = PAID_DAILY_REPORT_LIMITS.recipients

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

// The instant a Riyadh day and "HH:MM" stand for.
function riyadhMoment(day: string, time: string): Date {
  return new Date(new Date(`${day}T${time}:00.000Z`).getTime() - RIYADH_OFFSET_MS)
}

// The period a send at `sendAt` covers (see DailyReportSchedule).
export function reportWindow(
  sendAt: Date,
  period: {
    from: string | null
    to: string | null
    fromDay?: number | null
    toDay?: number | null
  }
): DailyReportWindow {
  let start: Date
  let end: Date
  if (period.from && period.to && isDayOffset(period.fromDay) && isDayOffset(period.toDay)) {
    const day = riyadhDay(sendAt)
    end = riyadhMoment(shiftDay(day, period.toDay), period.to)
    start = riyadhMoment(shiftDay(day, period.fromDay), period.from)
  } else if (period.from && period.to) {
    const day = riyadhDay(sendAt)
    end = riyadhMoment(day, period.to)
    if (end.getTime() > sendAt.getTime()) end = riyadhMoment(shiftDay(day, -1), period.to)
    const endDay = riyadhDay(end)
    start = riyadhMoment(endDay, period.from)
    if (start.getTime() >= end.getTime()) start = riyadhMoment(shiftDay(endDay, -1), period.from)
  } else {
    const day = reportDayFor(sendAt)
    const bounds = dayBounds(day)
    start = bounds.start
    end = day === riyadhDay(sendAt) ? sendAt : bounds.end
  }
  return { start: start.toISOString(), end: end.toISOString(), label: windowLabel(start, end) }
}

const isDayOffset = (value: unknown): value is -1 | 0 => value === -1 || value === 0

// Whether a chosen period makes sense for its send: it ends no later than the send and starts
// before it ends.
export function isValidPeriod(schedule: DailyReportSchedule): boolean {
  if (!schedule.from || !schedule.to) return true
  if (!isDayOffset(schedule.fromDay) || !isDayOffset(schedule.toDay)) return true
  const sendAt = riyadhMoment("2026-01-15", schedule.sendTime)
  const window = reportWindow(sendAt, schedule)
  return (
    new Date(window.end).getTime() <= sendAt.getTime() &&
    new Date(window.start).getTime() < new Date(window.end).getTime()
  )
}

function windowLabel(start: Date, end: Date): string {
  const startDay = riyadhDay(start)
  const lastDay = riyadhDay(new Date(end.getTime() - 1))
  const from = riyadhTime(start)
  const to = riyadhTime(end) === "00:00" ? "24:00" : riyadhTime(end)
  if (startDay === lastDay && from === "00:00" && to === "24:00") return startDay
  if (startDay === lastDay) return `${startDay} من ${from} إلى ${to}`
  return `${startDay} ${from} إلى ${lastDay} ${to}`
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
  // The period the figures cover, as the report's first line shows it.
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

const planLimit = (message: string) =>
  new IdentityError("DAILY_REPORT_PLAN_LIMIT", 403, "business", message)

function parseSchedules(raw: unknown, legacySendTime: string): DailyReportSchedule[] {
  const value = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw
  const list = Array.isArray(value) ? (value as Array<Partial<DailyReportSchedule>>) : []
  const schedules = list
    .filter((entry) => typeof entry?.sendTime === "string" && isValidTime(entry.sendTime))
    .map((entry) => ({
      sendTime: entry.sendTime as string,
      from: typeof entry.from === "string" && isValidTime(entry.from) ? entry.from : null,
      to: typeof entry.to === "string" && isValidTime(entry.to) ? entry.to : null,
      fromDay: isDayOffset(entry.fromDay) ? entry.fromDay : null,
      toDay: isDayOffset(entry.toDay) ? entry.toDay : null,
    }))
  return schedules.length > 0
    ? schedules
    : [{ sendTime: legacySendTime, from: null, to: null, fromDay: null, toDay: null }]
}

export class WhatsAppDailyReportService {
  private readonly readyReports: ReadyReportsRepository

  constructor(
    private readonly db: PostgresDatabase,
    private readonly platform: WhatsAppPlatformService,
    private readonly templates: WhatsAppTemplatesService,
    private readonly shifts: PosShiftsService | null,
    // Optional: without it every organization is on the free plan.
    private readonly addons: AddonsService | null = null
  ) {
    this.readyReports = new ReadyReportsRepository(db)
  }

  // The organization's plan: the paid add-on while it runs, the free report otherwise.
  async plan(organizationId: string): Promise<DailyReportSettings["plan"]> {
    const active = this.addons
      ? await this.addons.active(organizationId, DAILY_REPORT_ADDON).catch(() => null)
      : null
    return active
      ? { paid: true, until: active.currentPeriodEnd, limits: PAID_DAILY_REPORT_LIMITS }
      : { paid: false, until: null, limits: FREE_DAILY_REPORT_LIMITS }
  }

  private async storedSettings(organizationId: string) {
    const result = await this.db.query<{
      enabled: boolean
      send_time: string
      schedules: unknown
      recipients: unknown
      last_sent_on: unknown
    }>(
      `SELECT enabled, send_time, schedules, recipients, last_sent_on
         FROM whatsapp_daily_report_settings WHERE organization_id = $1`,
      [organizationId]
    )
    const row = result.rows[0]
    if (!row) {
      return {
        enabled: false,
        schedules: [{ sendTime: "23:00", from: null, to: null, fromDay: null, toDay: null }],
        recipients: [] as DailyReportRecipient[],
        lastSentOn: null as string | null,
      }
    }
    const recipients =
      typeof row.recipients === "string" ? JSON.parse(row.recipients) : row.recipients
    return {
      enabled: row.enabled,
      schedules: parseSchedules(row.schedules, row.send_time),
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

  // What the plan lets the stored settings do: its number of sends and numbers, and the default
  // period on the free plan.
  private effective(
    stored: { schedules: DailyReportSchedule[]; recipients: DailyReportRecipient[] },
    limits: DailyReportLimits
  ) {
    return {
      schedules: stored.schedules
        .slice(0, limits.schedules)
        .map((schedule) =>
          limits.customPeriod
            ? schedule
            : { ...schedule, from: null, to: null, fromDay: null, toDay: null }
        ),
      recipients: stored.recipients.slice(0, limits.recipients),
    }
  }

  async getSettings(organizationId: string, now = new Date()): Promise<DailyReportSettings> {
    const [stored, plan] = await Promise.all([
      this.storedSettings(organizationId),
      this.plan(organizationId),
    ])
    const { schedules } = this.effective(stored, plan.limits)
    const today = riyadhDay(now)
    return {
      enabled: stored.enabled,
      sendTime: stored.schedules[0]?.sendTime ?? "23:00",
      schedules: stored.schedules,
      recipients: stored.recipients,
      lastSentOn: stored.lastSentOn,
      plan,
      coverage: schedules.map((schedule) => {
        // The next run: today's when its time hasn't passed yet, tomorrow's otherwise.
        const todayRun = riyadhMoment(today, schedule.sendTime)
        const run =
          todayRun.getTime() >= now.getTime()
            ? todayRun
            : riyadhMoment(shiftDay(today, 1), schedule.sendTime)
        return { sendTime: schedule.sendTime, ...reportWindow(run, schedule) }
      }),
    }
  }

  async updateSettings(
    organizationId: string,
    actorUserId: string | null,
    input: DailyReportSettingsInput
  ): Promise<DailyReportSettings> {
    const requested = input.schedules?.length
      ? input.schedules
      : [{ sendTime: input.sendTime ?? "23:00", from: null, to: null, fromDay: null, toDay: null }]
    const schedules: DailyReportSchedule[] = []
    for (const entry of requested) {
      const from = entry.from || null
      const to = entry.to || null
      if (
        !isValidTime(entry.sendTime) ||
        (from !== null && !isValidTime(from)) ||
        (to !== null && !isValidTime(to)) ||
        (from === null) !== (to === null)
      ) {
        throw new IdentityError(
          "DAILY_REPORT_INVALID_TIME",
          400,
          "validation",
          "Pick a valid time."
        )
      }
      const custom = from !== null && to !== null
      const schedule: DailyReportSchedule = {
        sendTime: entry.sendTime,
        from,
        to,
        fromDay: custom && isDayOffset(entry.fromDay) ? entry.fromDay : null,
        toDay: custom && isDayOffset(entry.toDay) ? entry.toDay : null,
      }
      if (!isValidPeriod(schedule)) {
        throw new IdentityError(
          "DAILY_REPORT_INVALID_PERIOD",
          400,
          "validation",
          "The period has to end by the send time and start before it ends."
        )
      }
      if (!schedules.some((existing) => existing.sendTime === entry.sendTime)) {
        schedules.push(schedule)
      }
    }
    schedules.sort((a, b) => a.sendTime.localeCompare(b.sendTime))

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

    const { limits, paid } = await this.plan(organizationId)
    if (recipients.length > limits.recipients) {
      throw paid
        ? new IdentityError(
            "DAILY_REPORT_TOO_MANY_RECIPIENTS",
            400,
            "validation",
            `Up to ${limits.recipients} numbers.`
          )
        : planLimit("The free report goes to one number -- more need the paid plan.")
    }
    if (schedules.length > limits.schedules) {
      throw paid
        ? new IdentityError(
            "DAILY_REPORT_TOO_MANY_SCHEDULES",
            400,
            "validation",
            `Up to ${limits.schedules} reports a day.`
          )
        : planLimit("The free report is sent once a day -- more need the paid plan.")
    }
    if (!limits.customPeriod && schedules.some((schedule) => schedule.from !== null)) {
      throw planLimit("Choosing the report's period needs the paid plan.")
    }
    if (input.enabled && recipients.length === 0) {
      throw new IdentityError(
        "DAILY_REPORT_NO_RECIPIENTS",
        400,
        "validation",
        "Add at least one number to receive the report."
      )
    }
    // The free report's number is fixed once saved: changing or removing it needs the paid plan
    // (otherwise one free number could be rotated between any number of people).
    const savedPhone = paid
      ? null
      : (await this.storedSettings(organizationId)).recipients[0]?.phone
    if (savedPhone && recipients[0]?.phone !== savedPhone) {
      throw new IdentityError(
        "DAILY_REPORT_NUMBER_LOCKED",
        403,
        "business",
        "The free report's number can't be changed -- changing it needs the paid plan."
      )
    }
    await this.db.query(
      `INSERT INTO whatsapp_daily_report_settings
         (organization_id, enabled, send_time, schedules, recipients, updated_by, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, now())
       ON CONFLICT (organization_id) DO UPDATE SET
         enabled = EXCLUDED.enabled, send_time = EXCLUDED.send_time,
         schedules = EXCLUDED.schedules, recipients = EXCLUDED.recipients,
         updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [
        organizationId,
        input.enabled,
        schedules[0].sendTime,
        JSON.stringify(schedules),
        JSON.stringify(recipients),
        actorUserId,
      ]
    )
    return this.getSettings(organizationId)
  }

  // The figures for one period (a whole Riyadh day by default), across all the organization's
  // branches. Expenses and purchases are recorded by date, so they count every day the period
  // touches.
  async build(organizationId: string, period: string | DailyReportWindow): Promise<DailyReport> {
    const window =
      typeof period === "string"
        ? {
            start: dayBounds(period).start.toISOString(),
            end: dayBounds(period).end.toISOString(),
            label: period,
          }
        : period
    const start = new Date(window.start)
    const end = new Date(window.end)
    const day = riyadhDay(start)
    const lastDay = riyadhDay(new Date(end.getTime() - 1))
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
          WHERE organization_id = $1 AND expense_date >= $2 AND expense_date <= $3
            AND deleted_at IS NULL AND status <> 'cancelled'`,
        [organizationId, day, lastDay]
      ),
      this.readyReports
        .purchaseInvoices({ organizationId, workspaceId: null, from: day, to: lastDay })
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

    // Shifts opened in the period.
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
      day: window.label,
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

  // The report as the plan's first send would carry it right now.
  async preview(
    organizationId: string,
    now = new Date()
  ): Promise<{ day: string; text: string; window: DailyReportWindow }> {
    const window = await this.windowNow(organizationId, now)
    return {
      day: window.label,
      text: renderDailyReport(await this.build(organizationId, window)),
      window,
    }
  }

  // The first send's period, for a send happening at `now` (preview and test send).
  async windowNow(organizationId: string, now = new Date()): Promise<DailyReportWindow> {
    const [stored, plan] = await Promise.all([
      this.storedSettings(organizationId),
      this.plan(organizationId),
    ])
    const [first] = this.effective(stored, plan.limits).schedules
    return reportWindow(now, first ?? { from: null, to: null })
  }

  // Sends the report for a period to the plan's numbers; each send is kept in whatsapp_messages.
  async send(
    organizationId: string,
    period: string | DailyReportWindow,
    recipients?: DailyReportRecipient[]
  ): Promise<{ sent: number; failed: number }> {
    let to = recipients
    if (!to) {
      const [stored, plan] = await Promise.all([
        this.storedSettings(organizationId),
        this.plan(organizationId),
      ])
      to = this.effective(stored, plan.limits).recipients
    }
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
    const parameters = dailyReportParameters(await this.build(organizationId, period))
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

  // The scheduled pass: every send whose time has come today and hasn't gone out yet. Each send
  // (day + time) is claimed before sending, so several backend tasks never send it twice.
  async runDue(now = new Date()): Promise<{ organizations: number; sent: number; failed: number }> {
    const today = riyadhDay(now)
    const nowTime = riyadhTime(now)
    const rows = await this.db.query<{ organization_id: string }>(
      `SELECT organization_id FROM whatsapp_daily_report_settings WHERE enabled = true`
    )
    let organizations = 0
    let sent = 0
    let failed = 0
    for (const { organization_id: organizationId } of rows.rows) {
      const [stored, plan] = await Promise.all([
        this.storedSettings(organizationId),
        this.plan(organizationId),
      ])
      const { schedules, recipients } = this.effective(stored, plan.limits)
      const due = schedules.filter((schedule) => schedule.sendTime <= nowTime)
      if (due.length === 0 || recipients.length === 0) continue

      // A report sent today before per-send claims existed (only last_sent_on) counts as the
      // first send's.
      const claimedToday = await this.db.query<{ slot: string }>(
        `SELECT slot FROM whatsapp_daily_report_sends WHERE organization_id = $1 AND slot LIKE $2`,
        [organizationId, `${today}@%`]
      )
      const legacySentToday = stored.lastSentOn === today && claimedToday.rows.length === 0

      let sentAny = false
      for (const schedule of due) {
        if (legacySentToday && schedule.sendTime === stored.schedules[0]?.sendTime) continue
        const claim = await this.db.query(
          `INSERT INTO whatsapp_daily_report_sends (organization_id, slot) VALUES ($1, $2)
           ON CONFLICT DO NOTHING RETURNING slot`,
          [organizationId, `${today}@${schedule.sendTime}`]
        )
        if (claim.rows.length === 0) continue
        sentAny = true
        try {
          const result = await this.send(
            organizationId,
            reportWindow(riyadhMoment(today, schedule.sendTime), schedule),
            recipients
          )
          sent += result.sent
          failed += result.failed
        } catch (error) {
          console.error("whatsapp.daily_report_failed", { organizationId, error })
        }
      }
      if (sentAny) {
        organizations += 1
        await this.db.query(
          `UPDATE whatsapp_daily_report_settings SET last_sent_on = $2 WHERE organization_id = $1`,
          [organizationId, today]
        )
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

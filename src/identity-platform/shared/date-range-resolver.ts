import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { currentLocalDateParts } from "./timezone"

// Deterministic resolution of the relative-date phrases an analytics question typically uses
// ("هذا الأسبوع", "last month", ...) into a real [from, to] date range -- the whole point being
// that the LLM is never trusted to compute these itself (see ai-chat/service.ts's system prompt:
// "استخدم period بدلاً من حساب التواريخ بنفسك"). Week starts Sunday, not Monday -- the regional
// (Saudi) business-week convention this platform already assumes elsewhere (see
// connection_sync_schedules' 'Asia/Riyadh' default), not the ISO-8601 default.
export const RELATIVE_PERIODS = [
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "this_year",
  "last_year",
  "last_7_days",
  "last_30_days",
  "month_to_date",
  "year_to_date",
] as const

export type RelativePeriod = (typeof RELATIVE_PERIODS)[number]

export interface ResolvedDateRange {
  from: string
  to: string
  period: RelativePeriod
  timezone: string
}

function toIso(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10)
}

function addDays(
  year: number,
  month: number,
  day: number,
  delta: number
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day + delta))
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

// 0 (Sunday) .. 6 (Saturday), matching JS Date#getUTCDay().
function dayOfWeek(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

export function resolveRelativePeriod(
  period: RelativePeriod,
  timezone: string,
  now: Date = new Date()
): ResolvedDateRange {
  const today = currentLocalDateParts(timezone, now)
  const build = (
    from: { year: number; month: number; day: number },
    to: { year: number; month: number; day: number }
  ) => ({
    from: toIso(from.year, from.month, from.day),
    to: toIso(to.year, to.month, to.day),
    period,
    timezone,
  })

  switch (period) {
    case "today":
      return build(today, today)
    case "yesterday": {
      const y = addDays(today.year, today.month, today.day, -1)
      return build(y, y)
    }
    case "this_week": {
      const start = addDays(
        today.year,
        today.month,
        today.day,
        -dayOfWeek(today.year, today.month, today.day)
      )
      return build(start, today)
    }
    case "last_week": {
      const thisWeekStart = addDays(
        today.year,
        today.month,
        today.day,
        -dayOfWeek(today.year, today.month, today.day)
      )
      const lastWeekStart = addDays(thisWeekStart.year, thisWeekStart.month, thisWeekStart.day, -7)
      const lastWeekEnd = addDays(thisWeekStart.year, thisWeekStart.month, thisWeekStart.day, -1)
      return build(lastWeekStart, lastWeekEnd)
    }
    case "this_month":
    case "month_to_date":
      return build({ year: today.year, month: today.month, day: 1 }, today)
    case "last_month": {
      const firstOfThisMonth = { year: today.year, month: today.month, day: 1 }
      const lastDayOfPrevMonth = addDays(
        firstOfThisMonth.year,
        firstOfThisMonth.month,
        firstOfThisMonth.day,
        -1
      )
      return build(
        { year: lastDayOfPrevMonth.year, month: lastDayOfPrevMonth.month, day: 1 },
        lastDayOfPrevMonth
      )
    }
    case "this_year":
    case "year_to_date":
      return build({ year: today.year, month: 1, day: 1 }, today)
    case "last_year":
      return build(
        { year: today.year - 1, month: 1, day: 1 },
        { year: today.year - 1, month: 12, day: 31 }
      )
    case "last_7_days":
      return build(addDays(today.year, today.month, today.day, -6), today)
    case "last_30_days":
      return build(addDays(today.year, today.month, today.day, -29), today)
  }
}

// The equal-length period immediately preceding a resolved range -- used when a comparison tool
// needs "the period before this one" rather than a second named relative phrase.
export function precedingPeriod(range: { from: string; to: string }): { from: string; to: string } {
  const spanMs = new Date(range.to).getTime() - new Date(range.from).getTime()
  const previousTo = new Date(new Date(range.from).getTime() - 24 * 60 * 60 * 1000)
  const previousFrom = new Date(previousTo.getTime() - spanMs)
  return {
    from: previousFrom.toISOString().slice(0, 10),
    to: previousTo.toISOString().slice(0, 10),
  }
}

export async function getOrganizationTimezone(
  db: PostgresDatabase,
  organizationId: string
): Promise<string> {
  const result = await db.query<{ timezone: string | null }>(
    "select timezone from organizations where id = $1",
    [organizationId]
  )
  return result.rows[0]?.timezone || "UTC"
}

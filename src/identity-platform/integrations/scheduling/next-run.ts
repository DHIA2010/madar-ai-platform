// Computes the next scheduled run time for a connection sync schedule, in either of its two
// real shapes: a fixed-frequency schedule (one of the preset buttons -- every 15/30/60/360/
// 1440 minutes) or a custom cron expression. Both resolve to a concrete UTC Date the scheduler
// tick can compare against `now()`.

import { localDateTimeParts, localTimeToUtc } from "../../shared/timezone"

const MINUTES_PER_DAY = 24 * 60

export interface ScheduleTimingConfig {
  frequencyMinutes: number | null
  customCron: string | null
  activeDays: number[]
  startTimeLocal: string
  timezone: string
}

function parseStartTime(startTimeLocal: string): { hour: number; minute: number } {
  const [hourStr, minuteStr] = startTimeLocal.split(":")
  const hour = Number(hourStr)
  const minute = Number(minuteStr)
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return { hour: 0, minute: 0 }
  }
  return { hour, minute }
}

// Fixed-frequency schedules: every day in `activeDays`, the job fires every `frequencyMinutes`
// starting from `startTimeLocal` (the daily preset -- 1440 minutes -- is just this with a
// single fire per active day, at startTimeLocal). Walking forward day by day (bounded to 8, a
// full week plus one) rather than doing closed-form arithmetic keeps DST transitions and
// month/year rollovers correct for free, since every candidate goes through localTimeToUtc.
function nextIntervalRun(config: ScheduleTimingConfig, from: Date): Date {
  const { hour: startHour, minute: startMinute } = parseStartTime(config.startTimeLocal)
  const frequency = config.frequencyMinutes ?? MINUTES_PER_DAY
  const activeDays = config.activeDays.length > 0 ? config.activeDays : [0, 1, 2, 3, 4, 5, 6]

  const nowParts = localDateTimeParts(config.timezone, from)

  for (let dayOffset = 0; dayOffset <= 7; dayOffset += 1) {
    const candidateDayUtc = new Date(
      Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day + dayOffset)
    )
    const candidateDayParts = localDateTimeParts(config.timezone, candidateDayUtc)

    if (!activeDays.includes(candidateDayParts.dayOfWeek)) {
      continue
    }

    if (frequency >= MINUTES_PER_DAY) {
      const candidate = localTimeToUtc(
        config.timezone,
        candidateDayParts.year,
        candidateDayParts.month,
        candidateDayParts.day,
        startHour,
        startMinute
      )
      if (candidate > from) {
        return candidate
      }
      continue
    }

    // Sub-daily: every `frequency` minutes starting at startHour:startMinute, for the rest of
    // that local day. The first candidate on `dayOffset === 0` might already be in the past
    // (e.g. "now" is mid-afternoon and startTime was this morning) -- step forward by whole
    // `frequency` increments from startTime until a slot lands after `from`.
    const dayStart = localTimeToUtc(
      config.timezone,
      candidateDayParts.year,
      candidateDayParts.month,
      candidateDayParts.day,
      startHour,
      startMinute
    )
    // Bounded to this calendar day's own local midnight, not "dayStart + 24h" -- the latter
    // would let a slot spill into the next calendar day's clock time before that day's own
    // activeDays membership is ever checked (Date.UTC normalizes day+1 across month/year
    // boundaries on its own, so this is safe at the end of a month/year too).
    const dayEnd = localTimeToUtc(
      config.timezone,
      candidateDayParts.year,
      candidateDayParts.month,
      candidateDayParts.day + 1,
      0,
      0
    )

    if (dayStart > from) {
      return dayStart
    }

    const elapsedMs = from.getTime() - dayStart.getTime()
    const stepsElapsed = Math.floor(elapsedMs / (frequency * 60000)) + 1
    const candidate = new Date(dayStart.getTime() + stepsElapsed * frequency * 60000)

    if (candidate < dayEnd) {
      return candidate
    }
    // Every slot for this active day has already passed -- fall through to the next active day.
  }

  // No active day found in the next week (activeDays is empty after defaulting, which can't
  // happen, or every candidate this function produced was somehow <= from) -- fail safe to one
  // frequency step from now rather than never scheduling again.
  return new Date(from.getTime() + frequency * 60000)
}

// A single field of a standard 5-field cron expression ("minute hour day-of-month month
// day-of-week"). Supports `*`, comma lists, ranges (`a-b`), and steps (`*/n` or `a-b/n`) --
// the common subset real cron strings use; anything else in a field is treated as "any" rather
// than rejected, since this only ever runs against a value the user typed into `custom_cron`.
function parseCronField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>()

  for (const part of field.split(",")) {
    const stepMatch = part.match(/^(\*|\d+-\d+|\d+)\/(\d+)$/)
    const step = stepMatch ? Number(stepMatch[2]) : 1
    const base = stepMatch ? stepMatch[1] : part

    let rangeStart = min
    let rangeEnd = max

    if (base !== "*") {
      const rangeMatch = base.match(/^(\d+)-(\d+)$/)
      if (rangeMatch) {
        rangeStart = Number(rangeMatch[1])
        rangeEnd = Number(rangeMatch[2])
      } else if (/^\d+$/.test(base)) {
        rangeStart = Number(base)
        rangeEnd = Number(base)
      }
    }

    for (let value = rangeStart; value <= rangeEnd; value += step) {
      if (value >= min && value <= max) {
        values.add(value)
      }
    }
  }

  return values.size > 0
    ? values
    : new Set(Array.from({ length: max - min + 1 }, (_, i) => i + min))
}

const CRON_MAX_MINUTES_SCANNED = 366 * MINUTES_PER_DAY

// Brute-force forward scan, minute by minute, for the next minute matching all five cron
// fields -- simpler and easier to verify than closed-form cron date arithmetic, and a
// scheduler that ticks every few minutes has no performance reason to need anything faster.
function nextCronRun(cronExpression: string, timezone: string, from: Date): Date {
  const fields = cronExpression.trim().split(/\s+/)
  if (fields.length !== 5) {
    // Malformed custom cron -- fail safe to "one hour from now" rather than throwing deep
    // inside the scheduler tick for every connection sharing this invalid expression.
    return new Date(from.getTime() + 60 * 60000)
  }

  const [minuteField, hourField, domField, monthField, dowField] = fields
  const minutes = parseCronField(minuteField, 0, 59)
  const hours = parseCronField(hourField, 0, 23)
  const daysOfMonth = parseCronField(domField, 1, 31)
  const months = parseCronField(monthField, 1, 12)
  const daysOfWeek = parseCronField(dowField, 0, 6)

  let candidate = new Date(Math.ceil((from.getTime() + 1) / 60000) * 60000)

  for (let scanned = 0; scanned < CRON_MAX_MINUTES_SCANNED; scanned += 1) {
    const parts = localDateTimeParts(timezone, candidate)

    if (
      minutes.has(parts.minute) &&
      hours.has(parts.hour) &&
      months.has(parts.month) &&
      daysOfMonth.has(parts.day) &&
      daysOfWeek.has(parts.dayOfWeek)
    ) {
      return candidate
    }

    candidate = new Date(candidate.getTime() + 60000)
  }

  // No match within a year (e.g. Feb 30 in day-of-month) -- fail safe rather than hang.
  return new Date(from.getTime() + 24 * 60 * 60000)
}

export function computeNextRunAt(config: ScheduleTimingConfig, from: Date = new Date()): Date {
  if (config.customCron) {
    return nextCronRun(config.customCron, config.timezone, from)
  }
  return nextIntervalRun(config, from)
}

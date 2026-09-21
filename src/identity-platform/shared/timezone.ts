// Timezone-aware wall-clock helpers shared by anything that has to reason about a specific
// IANA zone's local date/time (Snapchat's DAY-granularity stats windows, sync-schedule
// next-run calculation). Extracted from snapchat-oauth/sync-service.ts, which needed exactly
// this to align Stats API windows to the ad account's own local midnight.

export function getUtcOffsetMinutes(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date)
  const map: Record<string, string> = {}
  for (const part of parts) map[part.type] = part.value
  const asUtc = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour, +map.minute, +map.second)
  return (asUtc - date.getTime()) / 60000
}

export function localMidnightUtc(timeZone: string, year: number, month: number, day: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
  const offsetMinutes = getUtcOffsetMinutes(timeZone, guess)
  return new Date(guess.getTime() - offsetMinutes * 60000)
}

export function currentLocalDateParts(timeZone: string, date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const map: Record<string, string> = {}
  for (const part of parts) map[part.type] = part.value
  return { year: +map.year, month: +map.month, day: +map.day }
}

// Local wall-clock time-of-day (hour/minute) in `timeZone`, and the local day-of-week
// (0=Sunday..6=Saturday, matching JS Date#getDay()) -- needed together to evaluate an
// "active days" + "start time" schedule against a specific instant.
export function localDateTimeParts(timeZone: string, date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date)
  const map: Record<string, string> = {}
  for (const part of parts) map[part.type] = part.value
  const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(map.weekday)
  return {
    year: +map.year,
    month: +map.month,
    day: +map.day,
    hour: +map.hour,
    minute: +map.minute,
    second: +map.second,
    dayOfWeek: weekdayIndex,
  }
}

// The UTC instant corresponding to a given local wall-clock time in `timeZone` -- the
// building block for turning "03:00 PM Asia/Riyadh" into a real point in time to compare
// against `now`.
export function localTimeToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0))
  const offsetMinutes = getUtcOffsetMinutes(timeZone, guess)
  return new Date(guess.getTime() - offsetMinutes * 60000)
}

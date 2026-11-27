// When approved articles go out: the next free publishing days (Riyadh time), one article a day.
// Riyadh is UTC+3 all year (no daylight saving).

const RIYADH_OFFSET_HOURS = 3
const DAY_MS = 24 * 60 * 60 * 1000

// The Riyadh calendar day of an instant, as YYYY-MM-DD.
export function riyadhDay(at: Date): string {
  return new Date(at.getTime() + RIYADH_OFFSET_HOURS * 3_600_000).toISOString().slice(0, 10)
}

// 0 = Sunday … 6 = Saturday, Riyadh time.
export function riyadhWeekday(at: Date): number {
  return new Date(at.getTime() + RIYADH_OFFSET_HOURS * 3_600_000).getUTCDay()
}

export function riyadhHour(at: Date): number {
  return new Date(at.getTime() + RIYADH_OFFSET_HOURS * 3_600_000).getUTCHours()
}

// The Sunday (Riyadh) that starts the week an instant falls in, as YYYY-MM-DD.
export function riyadhWeekStart(at: Date): string {
  return riyadhDay(new Date(at.getTime() - riyadhWeekday(at) * DAY_MS))
}

// `count` publishing times after `after`, on the given weekdays at the given Riyadh hour, skipping
// days that already have an article.
export function nextPublishSlots(input: {
  after: Date
  days: number[]
  hour: number
  takenDays: Iterable<string>
  count: number
}): Date[] {
  const days = new Set(input.days.filter((day) => day >= 0 && day <= 6))
  if (days.size === 0) days.add(1)
  const taken = new Set(input.takenDays)
  const slots: Date[] = []
  const startDay = riyadhDay(input.after)
  for (let offset = 0; slots.length < input.count && offset < 400; offset += 1) {
    const day = new Date(Date.parse(`${startDay}T00:00:00Z`) + offset * DAY_MS)
      .toISOString()
      .slice(0, 10)
    if (taken.has(day)) continue
    const at = new Date(
      Date.parse(`${day}T00:00:00Z`) + (input.hour - RIYADH_OFFSET_HOURS) * 3_600_000
    )
    if (at <= input.after) continue
    if (!days.has(riyadhWeekday(at))) continue
    slots.push(at)
    taken.add(day)
  }
  return slots
}

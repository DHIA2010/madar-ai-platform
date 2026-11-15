// A date as the calendar day the person sees on their own clock (yyyy-mm-dd).
//
// `date.toISOString().slice(0, 10)` gives the UTC day instead, which in Saudi Arabia (UTC+3) is
// YESTERDAY for the first three hours of every day -- and for any "start of day" a date picker
// hands back, since local midnight is still the previous day in UTC. A filter then asked for the
// wrong day, and a new expense or purchase was dated the day before.
export function toLocalDay(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

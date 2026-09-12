// Shared by every rebuilt Administration screen (Users, Roles, Teams, Activity/Audit Log,
// Sessions) -- one real relative/absolute Arabic time formatter instead of the English-only
// @/components/app RelativeTime, which the redesign can't use as-is.

const ABSOLUTE_TIME_FORMAT = new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
  hour: "numeric",
  minute: "2-digit",
})
const ABSOLUTE_DATE_TIME_FORMAT = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
})

export function formatRelativeArabic(value: string | null | undefined, fallback = "—"): string {
  if (!value) return fallback
  const target = new Date(value)
  if (Number.isNaN(target.getTime())) return fallback

  const now = new Date()
  const diffMs = now.getTime() - target.getTime()
  if (diffMs < 0) return ABSOLUTE_DATE_TIME_FORMAT.format(target)

  const minutes = Math.floor(diffMs / 60000)
  const hours = Math.floor(diffMs / 3600000)
  const days = Math.floor(diffMs / 86400000)

  if (minutes < 1) return "الآن"
  if (minutes < 60) return `منذ ${minutes} دقيقة`
  if (now.toDateString() === target.toDateString()) {
    return `اليوم ${ABSOLUTE_TIME_FORMAT.format(target)}`
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (yesterday.toDateString() === target.toDateString()) {
    return `أمس ${ABSOLUTE_TIME_FORMAT.format(target)}`
  }
  if (hours < 24) return `منذ ${hours} ${hours === 1 ? "ساعة" : "ساعات"}`
  if (days < 7) return `منذ ${days} ${days === 1 ? "يوم" : "أيام"}`

  return ABSOLUTE_DATE_TIME_FORMAT.format(target)
}

export function formatFullArabicDateTime(value: string | null | undefined, fallback = "—"): string {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

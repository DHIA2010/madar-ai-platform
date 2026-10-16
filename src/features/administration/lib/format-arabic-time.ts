// Shared by every rebuilt Administration screen (Users, Roles, Teams, Activity/Audit Log,
// Sessions) -- one real relative/absolute time formatter, locale-aware via next-intl rather than
// the English-only @/components/app RelativeTime, which the redesign can't use as-is.

import type { useTranslations } from "next-intl"

import type { Locale } from "@/i18n/locales"

type AdminTimeTranslator = ReturnType<typeof useTranslations<"administration.time">>

function absoluteTimeFormatter(locale: Locale): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
    hour: "numeric",
    minute: "2-digit",
  })
}

function absoluteDateTimeFormatter(locale: Locale): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function formatRelativeArabic(
  value: string | null | undefined,
  t: AdminTimeTranslator,
  locale: Locale,
  fallback = "—"
): string {
  if (!value) return fallback
  const target = new Date(value)
  if (Number.isNaN(target.getTime())) return fallback

  const now = new Date()
  const diffMs = now.getTime() - target.getTime()
  if (diffMs < 0) return absoluteDateTimeFormatter(locale).format(target)

  const minutes = Math.floor(diffMs / 60000)
  const hours = Math.floor(diffMs / 3600000)
  const days = Math.floor(diffMs / 86400000)

  if (minutes < 1) return t("now")
  if (minutes < 60) return t("minutesAgo", { minutes })
  if (now.toDateString() === target.toDateString()) {
    return t("todayAt", { time: absoluteTimeFormatter(locale).format(target) })
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (yesterday.toDateString() === target.toDateString()) {
    return t("yesterdayAt", { time: absoluteTimeFormatter(locale).format(target) })
  }
  if (hours < 24) return hours === 1 ? t("hourAgo") : t("hoursAgo", { hours })
  if (days < 7) return days === 1 ? t("dayAgo") : t("daysAgo", { days })

  return absoluteDateTimeFormatter(locale).format(target)
}

export function formatFullArabicDateTime(
  value: string | null | undefined,
  locale: Locale,
  fallback = "—"
): string {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

"use client"

import { useCallback, useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"

import { getActiveApplications } from "@/features/applications"
import { usePermissions } from "@/features/authentication"
import { useWorkspace } from "@/features/workspace"

import type { Locale } from "@/i18n/locales"

// Whether this organization has the Booking app, and whether this person may change things.
export function useBookingAccess() {
  const { currentOrganization } = useWorkspace()
  const { can } = usePermissions()
  return {
    enabled: getActiveApplications(currentOrganization?.settings).includes("booking"),
    canManage: can("booking:manage"),
  }
}

interface CodedError {
  code?: string
}

// The server's error codes in the reader's language.
export function useBookingError() {
  const t = useTranslations("booking.errors")
  return useCallback(
    (error: unknown): string => {
      const code = error && typeof error === "object" ? ((error as CodedError).code ?? null) : null
      return code && t.has(code) ? t(code) : t("generic")
    },
    [t]
  )
}

// The business's clock is Riyadh time for every organization today (a fixed three hours ahead),
// the same rule the server keeps -- so a time reads the same whatever the viewer's own clock.
const RIYADH_OFFSET_MS = 3 * 60 * 60_000
const DAY_MS = 24 * 60 * 60_000

export const dayOf = (instant: string | number | Date) =>
  new Date(new Date(instant).getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10)
export const today = () => dayOf(Date.now())
export const addDays = (day: string, count: number) =>
  new Date(new Date(`${day}T00:00:00.000Z`).getTime() + count * DAY_MS).toISOString().slice(0, 10)
export const weekdayOf = (day: string) => new Date(`${day}T00:00:00.000Z`).getUTCDay()
// The instant of a clock time ("HH:MM") on a day.
export const instantAt = (day: string, time: string) =>
  new Date(new Date(`${day}T${time}:00.000Z`).getTime() - RIYADH_OFFSET_MS).toISOString()
export const minuteOfDay = (instant: string) => {
  const local = new Date(new Date(instant).getTime() + RIYADH_OFFSET_MS)
  return local.getUTCHours() * 60 + local.getUTCMinutes()
}
export const clockOf = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`
export const minutesOfClock = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number)
  return (hours || 0) * 60 + (minutes || 0)
}

export function useBookingFormat() {
  const locale = useLocale() as Locale
  const t = useTranslations("booking.common")
  const numberLocale = locale === "ar" ? "ar-SA-u-nu-latn" : "en-US"
  const dateLocale = locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB"
  const money = useCallback(
    (value: number) =>
      `${new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 2 }).format(value || 0)} ${t("currency")}`,
    [numberLocale, t]
  )
  const number = useCallback(
    (value: number) => new Intl.NumberFormat(numberLocale).format(value || 0),
    [numberLocale]
  )
  // A time of day, 12-hour, on the business's clock.
  const time = useCallback(
    (instant: string) =>
      new Intl.DateTimeFormat(dateLocale, {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Riyadh",
      }).format(new Date(instant)),
    [dateLocale]
  )
  const clock = useCallback(
    (minute: number) => time(instantAt("2026-01-01", clockOf(minute % (24 * 60)))),
    [time]
  )
  const day = useCallback(
    (value: string, style: "long" | "short" = "long") =>
      new Intl.DateTimeFormat(dateLocale, {
        weekday: style === "long" ? "long" : "short",
        day: "numeric",
        month: style === "long" ? "long" : "short",
        timeZone: "UTC",
      }).format(new Date(`${value}T00:00:00.000Z`)),
    [dateLocale]
  )
  const weekday = useCallback(
    (index: number, style: "long" | "short" = "long") =>
      new Intl.DateTimeFormat(dateLocale, { weekday: style, timeZone: "UTC" }).format(
        // 2026-01-04 is a Sunday.
        new Date(Date.UTC(2026, 0, 4 + index))
      ),
    [dateLocale]
  )
  const duration = useCallback(
    (minutes: number) => {
      const hours = Math.floor(minutes / 60)
      const rest = minutes % 60
      if (hours === 0) return t("minutes", { count: rest })
      return rest === 0 ? t("hours", { count: hours }) : t("hoursMinutes", { hours, minutes: rest })
    },
    [t]
  )
  return { money, number, time, clock, day, weekday, duration, locale }
}

// Loads something when the screen opens and again whenever asked.
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [failed, setFailed] = useState(false)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let cancelled = false
    setFailed(false)
    load()
      .then((value) => {
        if (!cancelled) setData(value)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller lists what a reload depends on
  }, [...deps, tick])
  const reload = useCallback(() => setTick((value) => value + 1), [])
  return { data, setData, failed, reload }
}

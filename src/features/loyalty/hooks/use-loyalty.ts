"use client"

import { useCallback, useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"

import { getActiveApplications } from "@/features/applications"
import { usePermissions } from "@/features/authentication"
import { useWorkspace } from "@/features/workspace"

import type { Locale } from "@/i18n/locales"

// Whether this organization has the Loyalty app, and whether this person may change things.
export function useLoyaltyAccess() {
  const { currentOrganization } = useWorkspace()
  const { can } = usePermissions()
  return {
    enabled: getActiveApplications(currentOrganization?.settings).includes("loyalty"),
    canManage: can("loyalty:manage"),
  }
}

interface CodedError {
  code?: string
}

// The server's error codes in the reader's language.
export function useLoyaltyError() {
  const t = useTranslations("loyalty.errors")
  return useCallback(
    (error: unknown): string => {
      const code = error && typeof error === "object" ? ((error as CodedError).code ?? null) : null
      return code && t.has(code) ? t(code) : t("generic")
    },
    [t]
  )
}

export function useLoyaltyFormat() {
  const locale = useLocale() as Locale
  const t = useTranslations("loyalty.common")
  const numberLocale = locale === "ar" ? "ar-SA-u-nu-latn" : "en-US"
  const dateLocale = locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB"
  const number = useCallback(
    (value: number) => new Intl.NumberFormat(numberLocale).format(value || 0),
    [numberLocale]
  )
  const money = useCallback(
    (value: number) =>
      `${new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 2 }).format(value || 0)} ${t("currency")}`,
    [numberLocale, t]
  )
  const points = useCallback((value: number) => t("points", { count: value || 0 }), [t])
  const date = useCallback(
    (instant: string) =>
      new Intl.DateTimeFormat(dateLocale, {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Asia/Riyadh",
      }).format(new Date(instant)),
    [dateLocale]
  )
  return { number, money, points, date, locale }
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
  return { data, failed, reload, setData }
}

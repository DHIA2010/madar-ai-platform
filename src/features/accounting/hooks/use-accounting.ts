"use client"

import { useCallback, useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"

import { toLocalDay } from "@/lib/local-day"

import { getActiveApplications } from "@/features/applications"
import { usePermissions } from "@/features/authentication"
import { useWorkspace } from "@/features/workspace"

import type { Account, Range } from "../types/accounting.types"

import type { Locale } from "@/i18n/locales"

// Whether this organization has the Accounting app (its own subscription or trial, or Madar
// Complete), and whether this person may change the books.
export function useAccountingAccess() {
  const { currentOrganization } = useWorkspace()
  const { can } = usePermissions()
  return {
    enabled: getActiveApplications(currentOrganization?.settings).includes("accounting"),
    canManage: can("accounting:manage"),
  }
}

interface CodedError {
  code?: string
}

// The server's error codes in the reader's language.
export function useAccountingError() {
  const t = useTranslations("accounting.errors")
  return useCallback(
    (error: unknown): string => {
      const code = error && typeof error === "object" ? ((error as CodedError).code ?? null) : null
      return code && t.has(code) ? t(code) : t("generic")
    },
    [t]
  )
}

export function useFormatters() {
  const locale = useLocale() as Locale
  const numberLocale = locale === "ar" ? "ar-SA-u-nu-latn" : "en-US"
  const dateLocale = locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US"
  const money = useCallback(
    (value: number) =>
      new Intl.NumberFormat(numberLocale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value || 0),
    [numberLocale]
  )
  // Statements show a negative figure in brackets, the accountant's way.
  const signed = useCallback(
    (value: number) => (value < 0 ? `(${money(-value)})` : money(value)),
    [money]
  )
  const date = useCallback(
    (value: string | null | undefined) => {
      if (!value) return "—"
      // A calendar date (YYYY-MM-DD) is shown as that day wherever the reader is.
      const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T12:00:00`)
        : new Date(value)
      return new Intl.DateTimeFormat(dateLocale, {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(parsed)
    },
    [dateLocale]
  )
  const dateTime = useCallback(
    (value: string | null | undefined) =>
      value
        ? new Intl.DateTimeFormat(dateLocale, {
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
          }).format(new Date(value))
        : "—",
    [dateLocale]
  )
  const accountName = useCallback(
    (account: Pick<Account, "nameAr" | "nameEn">) =>
      locale === "ar" ? account.nameAr : account.nameEn,
    [locale]
  )
  return { money, signed, date, dateTime, accountName, locale }
}

// ---- The period a statement covers ----

export type RangePreset = "thisMonth" | "lastMonth" | "thisQuarter" | "thisYear" | "lastYear"
export const RANGE_PRESETS: RangePreset[] = [
  "thisMonth",
  "lastMonth",
  "thisQuarter",
  "thisYear",
  "lastYear",
]

export function presetRange(preset: RangePreset, today = new Date()): Range {
  const year = today.getFullYear()
  const month = today.getMonth()
  const day = (y: number, m: number, d: number) => toLocalDay(new Date(y, m, d))
  switch (preset) {
    case "lastMonth":
      return { from: day(year, month - 1, 1), to: day(year, month, 0) }
    case "thisQuarter": {
      const start = month - (month % 3)
      return { from: day(year, start, 1), to: toLocalDay(today) }
    }
    case "thisYear":
      return { from: day(year, 0, 1), to: toLocalDay(today) }
    case "lastYear":
      return { from: day(year - 1, 0, 1), to: day(year - 1, 11, 31) }
    default:
      return { from: day(year, month, 1), to: toLocalDay(today) }
  }
}

export const today = () => toLocalDay()

// Loads something from the books and keeps what is on screen while a new period loads.
export function useLoader<T>(load: () => Promise<T>, key: string) {
  const [state, setState] = useState<{ key: string; data: T } | null>(null)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    let active = true
    load()
      .then((data) => {
        if (!active) return
        setState({ key, data })
        setFailedKey(null)
      })
      .catch(() => {
        if (active) setFailedKey(key)
      })
    return () => {
      active = false
    }
    // `key` stands for everything `load` reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reloadCount])

  return {
    data: state?.data ?? null,
    loading: state?.key !== key && failedKey !== key,
    failed: failedKey === key,
    reload: useCallback(() => setReloadCount((count) => count + 1), []),
  }
}

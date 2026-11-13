"use client"

import { useCallback } from "react"
import { useLocale, useTranslations } from "next-intl"

import { getActiveApplications } from "@/features/applications"
import { usePermissions } from "@/features/authentication"
import { useWorkspace } from "@/features/workspace"

import type { Locale } from "@/i18n/locales"

// Whether this organization subscribed to the app, and whether this user may change documents.
export function useInvoicingAccess() {
  const { currentOrganization } = useWorkspace()
  const { can } = usePermissions()
  return {
    enabled: getActiveApplications(currentOrganization?.settings).includes("invoicing"),
    canManage: can("invoicing:manage"),
  }
}

interface CodedError {
  code?: string
  message?: string
  details?: unknown
}

export const errorCode = (error: unknown): string | null =>
  error && typeof error === "object" && typeof (error as CodedError).code === "string"
    ? ((error as CodedError).code ?? null)
    : null

export const errorDetails = <T>(error: unknown): T | undefined =>
  error && typeof error === "object" ? ((error as CodedError).details as T | undefined) : undefined

// The server's error codes in the reader's language (the server's own text is the fallback).
export function useInvoicingError() {
  const t = useTranslations("invoicing.errors")
  return useCallback(
    (error: unknown): string => {
      const code = errorCode(error)
      if (code && t.has(code)) return t(code)
      return t("generic")
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
  const quantity = useCallback(
    (value: number) =>
      new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 4 }).format(value || 0),
    [numberLocale]
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
  return { locale, money, quantity, date }
}

// Today as YYYY-MM-DD in the browser's own day.
export function todayString(offsetDays = 0): string {
  const now = new Date()
  now.setDate(now.getDate() + offsetDays)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

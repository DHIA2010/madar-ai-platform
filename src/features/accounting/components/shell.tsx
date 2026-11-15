"use client"

import { type ReactNode, useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { BookOpenCheck, Download, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppDateField, AppSearchableSelect } from "@/components/app"

import {
  presetRange,
  RANGE_PRESETS,
  type RangePreset,
  useAccountingAccess,
} from "../hooks/use-accounting"
import type { Range } from "../types/accounting.types"
import { HEADING, MUTED, PANEL, SECONDARY_BUTTON } from "./styles"

import { type Locale, localeDirection } from "@/i18n/locales"

// Shown in place of every accounting screen to an organization that doesn't have the app.
function AccountingLocked() {
  const t = useTranslations("accounting.locked")
  return (
    <div className={cn(PANEL, "mx-auto max-w-xl p-8 text-center")}>
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#ecfdf5] text-[#047857]">
        <BookOpenCheck className="size-7" />
      </span>
      <h1 className={cn("mt-4 text-xl font-bold", HEADING)}>{t("title")}</h1>
      <p className={cn("mt-2 text-sm leading-6", MUTED)}>{t("description")}</p>
      <Link
        href={ROUTES.marketplaceDetails("accounting")}
        className="mt-5 inline-flex h-11 items-center rounded-full bg-[#047857] px-6 text-[13.5px] font-bold text-white hover:bg-[#065f46]"
      >
        {t("cta")}
      </Link>
    </div>
  )
}

// The frame every accounting screen sits in: the title row, then the screen.
export function AccountingPage({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
}) {
  const locale = useLocale() as Locale
  const { enabled } = useAccountingAccess()
  return (
    <div dir={localeDirection(locale)} className="flex flex-col gap-4 pb-10">
      {enabled ? (
        <>
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className={cn("text-[22px] leading-8 font-extrabold", HEADING)}>{title}</h1>
              {subtitle ? <p className={cn("mt-0.5 text-[13px]", MUTED)}>{subtitle}</p> : null}
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
          </header>
          {children}
        </>
      ) : (
        <AccountingLocked />
      )}
    </div>
  )
}

export function Loading() {
  const t = useTranslations("accounting.common")
  return (
    <div className={cn("flex items-center justify-center gap-2 py-20 text-[13px]", MUTED)}>
      <Loader2 className="size-4 animate-spin" />
      {t("loading")}
    </div>
  )
}

export function LoadFailed({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("accounting.common")
  return (
    <div className={cn(PANEL, "flex flex-col items-center gap-3 px-6 py-12 text-center")}>
      <p className={cn("text-[14px] font-semibold", HEADING)}>{t("loadFailed")}</p>
      <button type="button" className={SECONDARY_BUTTON} onClick={onRetry}>
        {t("retry")}
      </button>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className={cn("px-6 py-14 text-center text-[13px]", MUTED)}>{children}</p>
}

// The period a statement covers: a quick choice, or two dates.
export function RangeControl({
  range,
  onChange,
}: {
  range: Range
  onChange: (range: Range) => void
}) {
  const t = useTranslations("accounting.range")
  const [preset, setPreset] = useState<RangePreset | "custom">("thisMonth")
  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <Choice
        ariaLabel={t("period")}
        value={preset}
        onChange={(next) => {
          setPreset(next as RangePreset | "custom")
          if (next !== "custom") onChange(presetRange(next as RangePreset))
        }}
        options={[
          ...RANGE_PRESETS.map((option) => ({ value: option, label: t(option) })),
          { value: "custom", label: t("custom") },
        ]}
        className="w-full sm:w-[160px]"
      />
      <DateField
        ariaLabel={t("from")}
        value={range.from}
        onChange={(from) => {
          setPreset("custom")
          // The start never passes the end.
          onChange({ from, to: from > range.to ? from : range.to })
        }}
        className="w-full sm:w-[172px]"
      />
      <span className={cn("hidden text-[13px] sm:inline", MUTED)}>{t("to")}</span>
      <DateField
        ariaLabel={t("to")}
        value={range.to}
        onChange={(to) => {
          setPreset("custom")
          onChange({ from: to < range.from ? to : range.from, to })
        }}
        className="w-full sm:w-[172px]"
      />
    </div>
  )
}

// A date, picked from Madar's own calendar (Arabic month and day names, the app's styling)
// instead of the browser's. A date can only be emptied where the screen allows it.
export function DateField({
  value,
  onChange,
  ariaLabel,
  className,
  clearable = false,
}: {
  value: string
  onChange: (next: string) => void
  ariaLabel?: string
  className?: string
  clearable?: boolean
}) {
  return (
    <div className={cn("shrink-0", className)}>
      <AppDateField
        value={value}
        ariaLabel={ariaLabel}
        clearable={clearable}
        onChange={(next) => {
          if (next || clearable) onChange(next)
        }}
        triggerClassName="h-11 w-full rounded-[12px] border-[#e1e7f0] bg-white text-[13px]"
      />
    </div>
  )
}

// A choice from a list, in Madar's own dropdown instead of the browser's.
export function Choice({
  value,
  onChange,
  options,
  ariaLabel,
  placeholder,
  disabled,
  className,
}: {
  value: string
  onChange: (next: string) => void
  options: Array<{ value: string; label: string; hint?: string; keywords?: string }>
  ariaLabel?: string
  placeholder?: string
  disabled?: boolean
  className?: string
}) {
  const t = useTranslations("accounting.common")
  return (
    <div className={cn("shrink-0", className)}>
      <AppSearchableSelect
        value={value}
        onChange={onChange}
        options={options}
        ariaLabel={ariaLabel}
        placeholder={placeholder ?? t("choose")}
        searchPlaceholder={t("search")}
        emptyLabel={t("noResults")}
        disabled={disabled}
        triggerClassName="h-11 w-full rounded-[12px] border-[#e1e7f0] bg-white text-[13px]"
      />
    </div>
  )
}

// Saves a statement as a spreadsheet file. The byte-order mark makes Excel read the Arabic.
export function ExportButton({ filename, rows }: { filename: string; rows: () => string[][] }) {
  const t = useTranslations("accounting.common")
  return (
    <button
      type="button"
      className={SECONDARY_BUTTON}
      onClick={() => {
        const escape = (cell: string) =>
          /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell
        const csv = rows()
          .map((row) => row.map((cell) => escape(String(cell))).join(","))
          .join("\n")
        const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }))
        const link = document.createElement("a")
        link.href = url
        link.download = `${filename}.csv`
        link.click()
        URL.revokeObjectURL(url)
      }}
    >
      <Download className="size-4" />
      {t("export")}
    </button>
  )
}

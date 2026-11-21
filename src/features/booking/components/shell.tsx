"use client"

import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { CalendarCheck, Loader2 } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppDateField, AppSearchableSelect } from "@/components/app"

import { useBookingAccess } from "../hooks/use-booking"
import type { BookingStatus } from "../types/booking.types"
import { HEADING, MUTED, PANEL, SECONDARY_BUTTON, STATUS_TINT } from "./styles"

import { type Locale, localeDirection } from "@/i18n/locales"

// Shown in place of every booking screen to an organization that doesn't have the app.
function BookingLocked() {
  const t = useTranslations("booking.locked")
  return (
    <div className={cn(PANEL, "mx-auto max-w-xl p-8 text-center")}>
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#f5f3ff] text-[#6d28d9]">
        <CalendarCheck className="size-7" />
      </span>
      <h1 className={cn("mt-4 text-xl font-bold", HEADING)}>{t("title")}</h1>
      <p className={cn("mt-2 text-sm leading-6", MUTED)}>{t("description")}</p>
      <Link
        href={ROUTES.marketplaceDetails("booking")}
        className="mt-5 inline-flex h-11 items-center rounded-full bg-[#6d28d9] px-6 text-[13.5px] font-bold text-white hover:bg-[#5b21b6]"
      >
        {t("cta")}
      </Link>
    </div>
  )
}

// The frame every booking screen sits in: the title row, then the screen.
export function BookingPage({
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
  const { enabled } = useBookingAccess()
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
        <BookingLocked />
      )}
    </div>
  )
}

export function Loading() {
  const t = useTranslations("booking.common")
  return (
    <div className={cn("flex items-center justify-center gap-2 py-20 text-[13px]", MUTED)}>
      <Loader2 className="size-4 animate-spin" />
      {t("loading")}
    </div>
  )
}

export function LoadFailed({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("booking.common")
  return (
    <div className={cn(PANEL, "flex flex-col items-center gap-3 px-6 py-12 text-center")}>
      <p className={cn("text-[14px] font-semibold", HEADING)}>{t("loadFailed")}</p>
      <button type="button" className={SECONDARY_BUTTON} onClick={onRetry}>
        {t("retry")}
      </button>
    </div>
  )
}

export function Empty({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      {title ? <p className={cn("text-[15px] font-bold", HEADING)}>{title}</p> : null}
      {children ? (
        <div className={cn("mx-auto mt-1.5 max-w-[460px] text-[13px] leading-6", MUTED)}>
          {children}
        </div>
      ) : null}
    </div>
  )
}

export function StatusPill({ status }: { status: BookingStatus }) {
  const t = useTranslations("booking.status")
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-[11.5px] font-bold whitespace-nowrap",
        STATUS_TINT[status]
      )}
    >
      {t(status)}
    </span>
  )
}

// A date, picked from Madar's own calendar instead of the browser's.
export function DateField({
  value,
  onChange,
  ariaLabel,
  className,
}: {
  value: string
  onChange: (next: string) => void
  ariaLabel?: string
  className?: string
}) {
  return (
    <div className={cn("shrink-0", className)}>
      <AppDateField
        value={value}
        ariaLabel={ariaLabel}
        onChange={(next) => {
          if (next) onChange(next)
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
  options: Array<{ value: string; label: string; hint?: string }>
  ariaLabel?: string
  placeholder?: string
  disabled?: boolean
  className?: string
}) {
  const t = useTranslations("booking.common")
  return (
    <div className={cn("min-w-0", className)}>
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

// A time of day, picked from Madar's own dropdown instead of the browser's clock wheel: every
// quarter of an hour, written the way the rest of the app writes a time, and found by typing.
// A time already set off the quarter hour stays in the list.
export function TimeField({
  value,
  onChange,
  ariaLabel,
  className,
  // Offers "end of day" (24:00) as a last choice, for a period that runs to midnight.
  allowEndOfDay = false,
}: {
  // "HH:MM" on a 24-hour clock.
  value: string
  onChange: (next: string) => void
  ariaLabel?: string
  className?: string
  allowEndOfDay?: boolean
}) {
  const t = useTranslations("booking.common")
  const locale = useLocale() as Locale
  const label = (clock: string) => {
    if (clock === "24:00") return t("endOfDay")
    const [hours, minutes] = clock.split(":").map(Number)
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-GB", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2026, 0, 1, hours || 0, minutes || 0)))
  }
  const quarters = Array.from({ length: 96 }, (_, index) => {
    const minute = index * 15
    return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`
  })
  const clocks = [...new Set([...quarters, ...(allowEndOfDay ? ["24:00"] : []), value])].sort()
  return (
    <div className={cn("min-w-0", className)}>
      <AppSearchableSelect
        value={value}
        onChange={onChange}
        options={clocks.map((clock) => ({ value: clock, label: label(clock), keywords: clock }))}
        ariaLabel={ariaLabel}
        placeholder={t("choose")}
        searchPlaceholder={t("searchTime")}
        emptyLabel={t("noResults")}
        triggerClassName="h-10 w-full rounded-[12px] border-[#e1e7f0] bg-white text-[13px]"
      />
    </div>
  )
}

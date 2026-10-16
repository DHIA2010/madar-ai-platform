"use client"

// A single-button date-RANGE filter: a trigger showing the formatted "from - to" label, opening a
// popover with a month/year jump row, a range calendar, quick presets (أمس, آخر 7 أيام,
// آخر 30 يومًا, هذا الشهر, الشهر الماضي), and مسح التاريخ/اليوم actions. Originally built for the
// Products page's activity-date filter and promoted here so any feature needing the same
// date-range-filter look can reuse it instead of rebuilding it.

import { useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import {
  addMonths,
  endOfMonth,
  getMonth,
  getYear,
  setMonth,
  setYear,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns"
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"

const YEAR_OPTIONS = Array.from({ length: 21 }, (_, index) => 2018 + index)

function getDateRangePresets(
  t: ReturnType<typeof useTranslations<"dateRangeFilter">>
): Array<{ label: string; range: DateRange }> {
  const today = new Date()
  const lastMonth = subMonths(today, 1)

  return [
    { label: t("presets.yesterday"), range: { from: subDays(today, 1), to: subDays(today, 1) } },
    { label: t("presets.last7Days"), range: { from: subDays(today, 6), to: today } },
    { label: t("presets.last30Days"), range: { from: subDays(today, 29), to: today } },
    { label: t("presets.thisMonth"), range: { from: startOfMonth(today), to: endOfMonth(today) } },
    {
      label: t("presets.lastMonth"),
      range: { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) },
    },
  ]
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

function endOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
}

// Every value this component commits is normalized to day boundaries before reaching onChange --
// a same-day range (one click twice, the أمس/اليوم presets and button) would otherwise leave `to`
// at local midnight, and consumers that filter with `occurred > dateRange.to` would then exclude
// nearly every record from that very day, silently zeroing totals.
function normalizeRange(range: DateRange | undefined): DateRange | undefined {
  if (!range?.from) {
    return range
  }
  return {
    from: startOfLocalDay(range.from),
    to: range.to ? endOfLocalDay(range.to) : undefined,
  }
}

function formatDateRangeLabel(
  range: DateRange | undefined,
  placeholder: string,
  formatter: Intl.DateTimeFormat
) {
  if (!range?.from) {
    return placeholder
  }

  if (!range.to) {
    return formatter.format(range.from)
  }

  return `${formatter.format(range.from)} - ${formatter.format(range.to)}`
}

export function AppDateRangeFilter({
  value,
  onChange,
  placeholder,
  triggerClassName,
}: {
  value: DateRange | undefined
  onChange: (next: DateRange | undefined) => void
  placeholder?: string
  triggerClassName?: string
}) {
  const t = useTranslations("dateRangeFilter")
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const [displayMonth, setDisplayMonth] = useState<Date>(value?.from ?? new Date())
  const [rangeAnchor, setRangeAnchor] = useState<Date | undefined>(undefined)
  const monthIndex = getMonth(displayMonth)
  const yearValue = getYear(displayMonth)

  const monthOptions = t.raw("months") as string[]
  const weekdayShort = t.raw("weekdaysShort") as string[]
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    [locale]
  )

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) {
          setDisplayMonth(value?.from ?? new Date())
          setRangeAnchor(value?.from && !value?.to ? value.from : undefined)
        } else {
          setRangeAnchor(undefined)
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-10 w-[205px] justify-between gap-2 rounded-[10px] border-[#e1e7f0] bg-white px-3.5 text-[12.5px] font-normal text-[#0b1738] hover:border-[#c4d5f0] hover:bg-white",
            triggerClassName
          )}
        >
          <CalendarIcon className="size-4 shrink-0 text-[#95a4bd]" />
          <span className="truncate">
            {formatDateRangeLabel(value, placeholder ?? t("placeholder"), dateFormatter)}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={10}
        dir="ltr"
        collisionPadding={16}
        className="max-h-[var(--radix-popover-content-available-height)] w-[min(23rem,calc(100vw-2rem))] overflow-y-auto rounded-[20px] border border-sky-400/15 bg-card p-3.5 text-foreground shadow-[0_28px_90px_-38px_rgba(14,165,233,0.55)] ring-1 ring-sky-400/10 backdrop-blur-2xl"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 rounded-full border border-border bg-muted/60 text-muted-foreground transition-all hover:border-sky-400/45 hover:bg-sky-500/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-sky-400/35"
            onClick={() => setDisplayMonth((current) => addMonths(current, -1))}
            aria-label={t("prevMonth")}
          >
            <ChevronLeft className="size-4" />
          </Button>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
            <Select
              value={String(monthIndex)}
              onValueChange={(next) => {
                setDisplayMonth((current) => setMonth(current, Number(next)))
              }}
            >
              <SelectTrigger className="h-9 w-[7.75rem] rounded-full border border-border bg-muted/60 px-3 text-sm font-semibold text-foreground shadow-none transition-all hover:border-sky-400/35 hover:bg-sky-500/10 focus-visible:ring-2 focus-visible:ring-sky-400/35">
                <span>{monthOptions[monthIndex]}</span>
              </SelectTrigger>
              <SelectContent
                position="popper"
                className="rounded-2xl border border-border bg-card p-1.5 text-foreground shadow-[0_18px_40px_-20px_rgba(2,6,23,0.88)]"
                align="center"
                sideOffset={4}
              >
                {monthOptions.map((monthLabel, index) => (
                  <SelectItem
                    key={monthLabel}
                    value={String(index)}
                    className="rounded-xl px-3 py-2 text-sm text-foreground focus:bg-sky-500/10 data-[state=checked]:bg-sky-500/15"
                  >
                    {monthLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={String(yearValue)}
              onValueChange={(next) => {
                setDisplayMonth((current) => setYear(current, Number(next)))
              }}
            >
              <SelectTrigger className="h-9 w-[6rem] rounded-full border border-border bg-muted/60 px-3 text-sm font-semibold text-foreground shadow-none transition-all hover:border-sky-400/35 hover:bg-sky-500/10 focus-visible:ring-2 focus-visible:ring-sky-400/35">
                <span>{yearValue}</span>
              </SelectTrigger>
              <SelectContent
                position="popper"
                className="max-h-56 rounded-2xl border border-border bg-card p-1.5 text-foreground shadow-[0_18px_40px_-20px_rgba(2,6,23,0.88)]"
                align="center"
                sideOffset={4}
              >
                {YEAR_OPTIONS.map((yearOption) => (
                  <SelectItem
                    key={yearOption}
                    value={String(yearOption)}
                    className="rounded-xl px-3 py-2 text-sm text-foreground focus:bg-sky-500/10 data-[state=checked]:bg-sky-500/15"
                  >
                    {yearOption}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 rounded-full border border-border bg-muted/60 text-muted-foreground transition-all hover:border-sky-400/45 hover:bg-sky-500/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-sky-400/35"
            onClick={() => setDisplayMonth((current) => addMonths(current, 1))}
            aria-label={t("nextMonth")}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <Calendar
          mode="range"
          animate
          month={displayMonth}
          onMonthChange={setDisplayMonth}
          selected={value}
          onSelect={(next, selectedDay) => {
            if (!selectedDay) {
              onChange(normalizeRange(next))
              return
            }

            if (!rangeAnchor) {
              onChange({ from: selectedDay, to: undefined })
              setRangeAnchor(selectedDay)
              return
            }

            const from = selectedDay < rangeAnchor ? selectedDay : rangeAnchor
            const to = selectedDay < rangeAnchor ? rangeAnchor : selectedDay

            onChange(normalizeRange({ from, to }))
            setRangeAnchor(undefined)
            setOpen(false)
          }}
          numberOfMonths={1}
          startMonth={new Date(2018, 0)}
          endMonth={new Date(2038, 11)}
          captionLayout="label"
          formatters={{
            formatWeekdayName: (date) => weekdayShort[date.getDay()],
          }}
          className="rounded-[18px] bg-transparent p-0 [--cell-size:32px]"
          classNames={{
            root: "w-full",
            months: "w-full",
            month: "w-full gap-2",
            nav: "hidden",
            button_previous:
              "size-8 rounded-full border border-border bg-muted/60 text-muted-foreground transition-all hover:border-sky-400/45 hover:bg-sky-500/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-sky-400/35",
            button_next:
              "size-8 rounded-full border border-border bg-muted/60 text-muted-foreground transition-all hover:border-sky-400/45 hover:bg-sky-500/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-sky-400/35",
            month_caption: "hidden",
            caption_label: "text-base font-semibold text-foreground",
            weekdays: "mb-1.5 grid grid-cols-7 gap-1.5",
            weekday:
              "h-6 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
            week: "mt-1.5 grid grid-cols-7 gap-1.5",
            day: "rounded-full text-foreground",
            day_button:
              "size-8 rounded-full border border-transparent bg-transparent text-xs font-medium text-foreground transition-all duration-200 ease-out hover:border-sky-300/40 hover:bg-sky-500/14 hover:text-foreground focus-visible:ring-2 focus-visible:ring-sky-400/35",
            today:
              "rounded-full border border-sky-400/60 bg-transparent text-foreground shadow-none",
            selected:
              "rounded-full border border-sky-300 bg-sky-400 text-foreground shadow-[0_0_0_1px_rgba(125,211,252,0.2),0_10px_30px_rgba(14,165,233,0.32)] hover:bg-sky-300 hover:text-foreground",
            range_middle: "rounded-full border border-transparent bg-sky-500/14 text-foreground",
            range_start:
              "rounded-full border border-sky-300 bg-sky-400 text-foreground shadow-[0_0_0_1px_rgba(125,211,252,0.2),0_10px_30px_rgba(14,165,233,0.32)]",
            range_end:
              "rounded-full border border-sky-300 bg-sky-400 text-foreground shadow-[0_0_0_1px_rgba(125,211,252,0.2),0_10px_30px_rgba(14,165,233,0.32)]",
            outside: "text-muted-foreground opacity-40",
            disabled: "text-muted-foreground opacity-35",
          }}
        />

        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
          {getDateRangePresets(t).map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="rounded-full border border-border bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-all hover:border-sky-400/35 hover:bg-sky-500/10 hover:text-foreground"
              onClick={() => {
                onChange(normalizeRange(preset.range))
                setRangeAnchor(undefined)
                setDisplayMonth(preset.range.from ?? new Date())
                setOpen(false)
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 rounded-xl border-border bg-muted/60 px-3.5 text-sm font-medium text-muted-foreground transition-all hover:border-sky-400/35 hover:bg-sky-500/10 hover:text-foreground"
            onClick={() => {
              onChange(undefined)
              setRangeAnchor(undefined)
              setDisplayMonth(new Date())
              setOpen(false)
            }}
          >
            {t("clear")}
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-9 rounded-xl bg-sky-400 px-3.5 text-sm font-semibold text-foreground shadow-[0_18px_34px_-18px_rgba(14,165,233,0.8)] transition-all hover:bg-sky-300"
            onClick={() => {
              const today = new Date()
              onChange(normalizeRange({ from: today, to: today }))
              setRangeAnchor(undefined)
              setDisplayMonth(today)
              setOpen(false)
            }}
          >
            {t("today")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

"use client"

// A single-date control, for any form field that needs one date (not a range -- see
// date-range-filter.tsx for that). Shares that component's exact popover chrome (pill month/year
// selects, circular nav buttons, sky-themed calendar grid) minus its quick-presets row, which
// only makes sense for a range.
//
// It replaces a bare <input type="date">, which had three problems on an Arabic RTL form: the
// picker the browser opens is the browser's own -- English month and weekday names, an English
// Clear/Today footer, and none of the app's styling; the field showed a Latin "dd/mm/yyyy"
// placeholder; and it drew its own calendar glyph beside the one the field already had, so the
// same affordance appeared twice in one control.

import { useState } from "react"
import { addMonths, getMonth, getYear, setMonth, setYear } from "date-fns"
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react"

import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"

// Callers keep dates as YYYY-MM-DD strings -- what most of this app's APIs take -- parsed as
// local noon so a timezone shift can never move the date across a day boundary.
function parseValue(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const [year, month, day] = value.split("-").map(Number)
  const parsed = new Date(year, month - 1, day, 12)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function toValue(date: Date): string {
  return [
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

const MONTH_OPTIONS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
]
const YEAR_OPTIONS = Array.from({ length: 21 }, (_, index) => 2018 + index)

// The Arabic weekday names date-fns supplies are full words that do not fit a calendar cell --
// they render as one run of overlapping text. These are the conventional two-letter forms,
// matching AppDateRangeFilter's own calendar header so every date picker in the app reads the
// same way. Indexed by getDay() (0 = Sunday).
const WEEKDAY_SHORT = ["أح", "إث", "ثل", "أر", "خم", "جم", "سب"]

// Latin digits inside Arabic month names, matching how every other date in this app reads.
const DISPLAY = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  day: "numeric",
  month: "long",
  year: "numeric",
})

export function AppDateField({
  value,
  onChange,
  placeholder = "اختر التاريخ",
  ariaLabel = "التاريخ",
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = parseValue(value)
  const [displayMonth, setDisplayMonth] = useState<Date>(selected ?? new Date())
  const monthIndex = getMonth(displayMonth)
  const yearValue = getYear(displayMonth)

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) setDisplayMonth(selected ?? new Date())
      }}
    >
      <div className="relative">
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={ariaLabel}
            className={cn(
              "flex h-11 w-full cursor-pointer items-center gap-2 rounded-[12px] border border-[#e1e7f0] bg-white px-2.5 text-right text-[13px] transition-colors hover:border-[#c4d5f0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2878ff]/35",
              selected ? "text-[#0b1738]" : "text-[#95a4bd]"
            )}
          >
            {/* RTL: the tile is written first so it lands to the right of the label, matching
                the other marked fields on this page. */}
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-[#eef4ff] text-[#2878ff]">
              <CalendarDays className="size-4" />
            </span>
            <span className={cn("min-w-0 flex-1 truncate", selected && "font-semibold")}>
              {selected ? DISPLAY.format(selected) : placeholder}
            </span>
          </button>
        </PopoverTrigger>

        {/* Sits outside the trigger: a button inside a button is invalid, and clearing the date
            must not also open the picker. */}
        {selected ? (
          <button
            type="button"
            aria-label="مسح التاريخ"
            className="absolute end-2 top-1/2 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-[#95a4bd] transition-colors hover:bg-[#f2f5fa] hover:text-[#e0484d]"
            onClick={() => onChange("")}
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      {/* Same chrome as AppDateRangeFilter's own popover (see date-range-filter.tsx) -- kept LTR
          so both shared date pickers' calendar grids start the week on the same day, and so
          their look reads as one consistent design instead of two different ones. No quick
          presets here: unlike a range, there's no single "last 7 days"-style shortcut that makes
          sense for one plain date. */}
      <PopoverContent
        align="start"
        sideOffset={10}
        dir="ltr"
        collisionPadding={16}
        className="w-[min(23rem,calc(100vw-2rem))] rounded-[20px] border border-sky-400/15 bg-card p-3.5 text-foreground shadow-[0_28px_90px_-38px_rgba(14,165,233,0.55)] ring-1 ring-sky-400/10 backdrop-blur-2xl"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 rounded-full border border-border bg-muted/60 text-muted-foreground transition-all hover:border-sky-400/45 hover:bg-sky-500/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-sky-400/35"
            onClick={() => setDisplayMonth((current) => addMonths(current, -1))}
            aria-label="الشهر السابق"
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
                <span>{MONTH_OPTIONS[monthIndex]}</span>
              </SelectTrigger>
              <SelectContent
                position="popper"
                className="rounded-2xl border border-border bg-card p-1.5 text-foreground shadow-[0_18px_40px_-20px_rgba(2,6,23,0.88)]"
                align="center"
                sideOffset={4}
              >
                {MONTH_OPTIONS.map((monthLabel, index) => (
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
            aria-label="الشهر التالي"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <Calendar
          mode="single"
          animate
          month={displayMonth}
          onMonthChange={setDisplayMonth}
          selected={selected}
          dir="ltr"
          captionLayout="label"
          startMonth={new Date(2018, 0)}
          endMonth={new Date(2038, 11)}
          formatters={{
            formatWeekdayName: (date) => WEEKDAY_SHORT[date.getDay()],
          }}
          className="rounded-[18px] bg-transparent p-0 [--cell-size:32px]"
          classNames={{
            root: "w-full",
            months: "w-full",
            month: "w-full gap-2",
            nav: "hidden",
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
            outside: "text-muted-foreground opacity-40",
            disabled: "text-muted-foreground opacity-35",
          }}
          onSelect={(next) => {
            onChange(next ? toValue(next) : "")
            setOpen(false)
          }}
        />

        <div className="mt-3 flex items-center justify-end gap-2 border-t border-border pt-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 rounded-xl border-border bg-muted/60 px-3.5 text-sm font-medium text-muted-foreground transition-all hover:border-sky-400/35 hover:bg-sky-500/10 hover:text-foreground"
            onClick={() => {
              onChange("")
              setDisplayMonth(new Date())
              setOpen(false)
            }}
          >
            مسح التاريخ
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-9 rounded-xl bg-sky-400 px-3.5 text-sm font-semibold text-foreground shadow-[0_18px_34px_-18px_rgba(14,165,233,0.8)] transition-all hover:bg-sky-300"
            onClick={() => {
              const today = new Date()
              onChange(toValue(today))
              setDisplayMonth(today)
              setOpen(false)
            }}
          >
            اليوم
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

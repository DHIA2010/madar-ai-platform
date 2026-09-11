"use client"

// The date control used on the Add Product page.
//
// It replaces a bare <input type="date">, which had three problems on an Arabic RTL form: the
// picker the browser opens is the browser's own -- English month and weekday names, an English
// Clear/Today footer, and none of the page's styling; the field showed a Latin "dd/mm/yyyy"
// placeholder; and it drew its own calendar glyph beside the one the field already had, so the
// same affordance appeared twice in one control.

import { useState } from "react"
import { ar } from "date-fns/locale"
import { CalendarDays, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cairo } from "@/components/design/fonts"

// The form keeps dates as YYYY-MM-DD strings, which is what the API takes and what the old
// native input produced -- parsed as local noon so a timezone shift can never move the date
// across a day boundary.
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

// The Arabic weekday names date-fns supplies are full words that do not fit a calendar cell --
// they render as one run of overlapping text. These are the conventional two-letter forms,
// indexed by getDay().
const WEEKDAY_SHORT = ["أح", "إث", "ثل", "أر", "خم", "جم", "سب"]

// Latin digits inside Arabic month names, matching how every other date on this page reads.
const DISPLAY = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  day: "numeric",
  month: "long",
  year: "numeric",
})

export function DateField({
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
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

      {/* Radix portals this to document.body, which does not inherit the page's dir. */}
      <PopoverContent
        dir="rtl"
        align="start"
        sideOffset={6}
        className={cn(
          cairo.className,
          "w-auto rounded-[16px] border-[#e1e7f0] p-2 shadow-[0_12px_32px_rgba(11,23,56,0.12)]"
        )}
      >
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          // react-day-picker takes the date-fns locale, which is what turns the month and
          // weekday names Arabic and starts the week where this locale starts it.
          locale={ar}
          dir="rtl"
          captionLayout="dropdown"
          startMonth={new Date(new Date().getFullYear() - 5, 0)}
          endMonth={new Date(new Date().getFullYear() + 10, 11)}
          formatters={{
            // The calendar grid reads as numbers, so Latin digits keep it scannable next to the
            // rest of the form rather than switching numeral systems mid-page.
            formatDay: (day) => day.getDate().toString(),
            formatYearCaption: (date) => date.getFullYear().toString(),
            formatWeekdayName: (day) => WEEKDAY_SHORT[day.getDay()],
          }}
          onSelect={(next) => {
            onChange(next ? toValue(next) : "")
            setOpen(false)
          }}
        />

        {/* RTL: the clear action is written first so it sits at the right of the pair. */}
        <div className="mt-1 flex items-center justify-between gap-2 border-t border-[#eef2f8] px-1 pt-2">
          <button
            type="button"
            className={cn(
              "cursor-pointer rounded-[8px] px-2 py-1 text-[11.5px] font-semibold transition-colors",
              selected
                ? "text-[#6b7b96] hover:bg-[#f2f5fa] hover:text-[#e0484d]"
                : "cursor-not-allowed text-[#c0cbdc]"
            )}
            disabled={!selected}
            onClick={() => {
              onChange("")
              setOpen(false)
            }}
          >
            مسح
          </button>
          <button
            type="button"
            className="cursor-pointer rounded-[8px] px-2 py-1 text-[11.5px] font-semibold text-[#2878ff] transition-colors hover:bg-[#eef4ff]"
            onClick={() => {
              onChange(toValue(new Date()))
              setOpen(false)
            }}
          >
            اليوم
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

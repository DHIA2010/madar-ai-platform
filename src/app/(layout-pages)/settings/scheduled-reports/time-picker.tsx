"use client"

// A time field for the scheduled reports: the chosen time as a button ("9:30 ص"), and a popover to
// pick the hour, the minute (in fives) and morning/evening -- clearer than the browser's own time
// input, which looks different everywhere and is awkward in Arabic. The value is "HH:MM" (24h).

import { useState } from "react"
import { Clock } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { cn } from "@/lib/utils"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]
const pad = (value: number) => String(value).padStart(2, "0")

function parts(value: string) {
  const [h, m] = value.split(":").map(Number)
  const hours = Number.isFinite(h) ? h : 0
  return {
    hour12: hours % 12 === 0 ? 12 : hours % 12,
    minute: Number.isFinite(m) ? m : 0,
    pm: hours >= 12,
  }
}

function toValue(hour12: number, minute: number, pm: boolean) {
  const hours = (hour12 % 12) + (pm ? 12 : 0)
  return `${pad(hours)}:${pad(minute)}`
}

// "9:30 ص" / "9:30 PM" -- also used for the period labels.
export function useFormatTime() {
  const t = useTranslations("settings.scheduledReports.time")
  return (value: string) => {
    if (value === "24:00") return t("endOfDay")
    const { hour12, minute, pm } = parts(value)
    return `${hour12}:${pad(minute)} ${pm ? t("pm") : t("am")}`
  }
}

export function TimePicker({
  value,
  onChange,
  disabled,
  label,
  className,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  label?: string
  className?: string
}) {
  const t = useTranslations("settings.scheduledReports.time")
  const locale = useLocale()
  const format = useFormatTime()
  const [open, setOpen] = useState(false)
  const { hour12, minute, pm } = parts(value)
  // A minute that isn't a multiple of five (an older saved time) still shows as chosen.
  const minutes = MINUTES.includes(minute) ? MINUTES : [...MINUTES, minute].sort((a, b) => a - b)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={label}
          className={cn(
            "flex h-11 min-w-[132px] items-center justify-between gap-2 rounded-[12px] border border-[#E8EBF0] bg-white px-3.5 text-[13.5px] font-bold text-[#0b1738] transition-colors hover:border-[#bcd2ff] focus-visible:border-[#2563eb] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#2563eb]/10 disabled:cursor-not-allowed disabled:bg-[#f8fafc] disabled:text-[#98A2B3]",
            open && "border-[#2563eb] ring-4 ring-[#2563eb]/10",
            className
          )}
        >
          <span dir="ltr" className="tabular-nums">
            {format(value)}
          </span>
          <Clock className="size-4 text-[#98A2B3]" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[300px] rounded-2xl border-[#E8EBF0] p-0 shadow-[0_16px_40px_rgba(16,42,92,0.14)]"
        dir={locale === "ar" ? "rtl" : "ltr"}
      >
        <div className="flex items-center justify-between border-b border-[#eef1f6] px-4 py-3">
          <span dir="ltr" className="text-[22px] font-extrabold tabular-nums text-[#0b1738]">
            {format(value)}
          </span>
          <div className="flex rounded-[10px] bg-[#f2f4f7] p-1">
            {[false, true].map((evening) => (
              <button
                key={String(evening)}
                type="button"
                onClick={() => onChange(toValue(hour12, minute, evening))}
                className={cn(
                  "rounded-[8px] px-3 py-1 text-[12px] font-bold transition-colors",
                  pm === evening ? "bg-white text-[#2563eb] shadow-sm" : "text-[#667085]"
                )}
              >
                {evening ? t("pm") : t("am")}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3 p-4">
          <div>
            <p className="mb-2 text-[11.5px] font-bold text-[#667085]">{t("hour")}</p>
            <div className="grid grid-cols-6 gap-1.5">
              {HOURS.map((hour) => (
                <button
                  key={hour}
                  type="button"
                  onClick={() => onChange(toValue(hour, minute, pm))}
                  className={cn(
                    "h-9 rounded-[9px] text-[13px] font-bold tabular-nums transition-colors",
                    hour === hour12
                      ? "bg-[#2563eb] text-white shadow-[0_4px_10px_rgba(37,99,235,0.3)]"
                      : "bg-[#f8fafc] text-[#344054] hover:bg-[#eef4ff]"
                  )}
                >
                  {hour}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[11.5px] font-bold text-[#667085]">{t("minute")}</p>
            <div className="grid grid-cols-6 gap-1.5">
              {minutes.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => onChange(toValue(hour12, option, pm))}
                  className={cn(
                    "h-9 rounded-[9px] text-[13px] font-bold tabular-nums transition-colors",
                    option === minute
                      ? "bg-[#2563eb] text-white shadow-[0_4px_10px_rgba(37,99,235,0.3)]"
                      : "bg-[#f8fafc] text-[#344054] hover:bg-[#eef4ff]"
                  )}
                >
                  {pad(option)}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-1 h-10 rounded-[10px] bg-[#0b1738] text-[13px] font-bold text-white hover:bg-[#1e2b4d]"
          >
            {t("done")}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

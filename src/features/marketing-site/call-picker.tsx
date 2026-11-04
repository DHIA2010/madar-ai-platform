"use client"

import { useState } from "react"
import { Loader2, PhoneCall } from "lucide-react"

import { cn } from "@/lib/utils"

// When the sales team may call: Sunday to Thursday, 9:00 to 17:30 Saudi time, every half hour.
const FIRST_SLOT = 9 * 60
const LAST_SLOT = 17 * 60 + 30
const SLOT_MINUTES = 30
const WORKING_DAYS = [0, 1, 2, 3, 4]
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000
// Not sooner than this from now.
const LEAD_TIME_MINUTES = 60

const pad = (value: number) => String(value).padStart(2, "0")

interface CallDay {
  // yyyy-mm-dd in Saudi time.
  date: string
  weekday: string
  label: string
  // "HH:MM" slots still open that day.
  slots: string[]
}

const WEEKDAY = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  weekday: "long",
  timeZone: "UTC",
})
const DAY_LABEL = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
})

// The next six working days that still have a slot, from `now`.
export function callDays(now: number): CallDay[] {
  // A Date whose UTC fields read as Saudi local time.
  const local = new Date(now + RIYADH_OFFSET_MS)
  const nowMinutes = local.getUTCHours() * 60 + local.getUTCMinutes()
  const days: CallDay[] = []
  for (let offset = 0; days.length < 6 && offset < 21; offset++) {
    const day = new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + offset)
    )
    if (!WORKING_DAYS.includes(day.getUTCDay())) continue
    const slots: string[] = []
    for (let minutes = FIRST_SLOT; minutes <= LAST_SLOT; minutes += SLOT_MINUTES) {
      if (offset === 0 && minutes < nowMinutes + LEAD_TIME_MINUTES) continue
      slots.push(`${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`)
    }
    if (!slots.length) continue
    days.push({
      date: `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`,
      weekday: offset === 0 ? "اليوم" : offset === 1 ? "غدًا" : WEEKDAY.format(day),
      label: DAY_LABEL.format(day),
      slots,
    })
  }
  return days
}

// "9:30 ص" for a "09:30" slot.
function slotLabel(slot: string) {
  const [hours, minutes] = slot.split(":").map(Number)
  const suffix = hours < 12 ? "ص" : "م"
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  return `${hour12}:${pad(minutes)} ${suffix}`
}

// The "phone call" choice after the talk-to-sales form: pick a day, then a time.
export function CallPicker({
  days,
  sending,
  onConfirm,
  onBack,
}: {
  days: CallDay[]
  sending: boolean
  // An ISO time with the Saudi offset, e.g. 2026-11-10T09:30:00+03:00.
  onConfirm: (callAt: string) => void
  onBack: () => void
}) {
  const [date, setDate] = useState(days[0]?.date ?? "")
  const [slot, setSlot] = useState<string | null>(null)
  const day = days.find((entry) => entry.date === date) ?? days[0]

  return (
    <div>
      <h1 className="text-center text-[26px] leading-tight font-black text-[#0b1738]">
        متى نتصل بك؟
      </h1>
      <p className="mt-2 text-center text-[16px] text-slate-600">
        اختر اليوم والوقت المناسبين لك (بتوقيت السعودية).
      </p>

      <p className="mt-7 text-[15px] font-bold text-[#0b1738]">اليوم</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {days.map((entry) => (
          <button
            key={entry.date}
            type="button"
            onClick={() => {
              setDate(entry.date)
              setSlot(null)
            }}
            className={cn(
              "rounded-2xl border-2 px-2 py-3 text-center transition-colors",
              entry.date === day?.date
                ? "border-[#2878ff] bg-[#2878ff]/5 text-[#2878ff]"
                : "border-slate-200 text-[#0b1738] hover:border-slate-300"
            )}
          >
            <span className="block text-[15px] font-extrabold">{entry.weekday}</span>
            <span className="mt-0.5 block text-[13px] font-semibold opacity-70">{entry.label}</span>
          </button>
        ))}
      </div>

      <p className="mt-6 text-[15px] font-bold text-[#0b1738]">الوقت</p>
      <div className="mt-3 grid max-h-[220px] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
        {(day?.slots ?? []).map((entry) => (
          <button
            key={entry}
            type="button"
            onClick={() => setSlot(entry)}
            className={cn(
              "h-12 rounded-xl border-2 text-[15px] font-bold transition-colors",
              entry === slot
                ? "border-[#2878ff] bg-[#2878ff] text-white"
                : "border-slate-200 text-[#0b1738] hover:border-slate-300"
            )}
          >
            {slotLabel(entry)}
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled={!slot || !day || sending}
        onClick={() => day && slot && onConfirm(`${day.date}T${slot}:00+03:00`)}
        className="mt-7 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#2878ff] text-[18px] font-extrabold text-white shadow-[0_14px_30px_rgba(40,120,255,0.35)] transition-all hover:bg-[#1f63d6] disabled:opacity-50 disabled:shadow-none"
      >
        {sending ? <Loader2 className="size-5 animate-spin" /> : <PhoneCall className="size-5" />}
        تأكيد موعد المكالمة
      </button>
      <button
        type="button"
        onClick={onBack}
        className="mt-3 h-12 w-full rounded-2xl text-[15px] font-bold text-slate-500 hover:text-[#0b1738]"
      >
        رجوع
      </button>
    </div>
  )
}

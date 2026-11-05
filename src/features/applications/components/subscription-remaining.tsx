"use client"

import { CalendarClock, Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"

import type { SubscriptionPeriod } from "../hooks"

const DAY_MS = 24 * 60 * 60 * 1000

const formatDay = (iso: string) =>
  new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso))

function daysLabel(days: number) {
  if (days <= 0) return "ينتهي اليوم"
  if (days === 1) return "باقي يوم واحد"
  if (days === 2) return "باقي يومان"
  if (days <= 10) return `باقي ${days} أيام`
  return `باقي ${days} يومًا`
}

// An active application's subscription, in place of a cancel button: how much of the trial or paid
// period is left, as a countdown and a bar, and the day it ends. Active apps can't be cancelled --
// they run to the end of their period.
export function SubscriptionRemaining({
  trial,
  period,
  now,
  className,
}: {
  // The app is in its free trial (else a paid / granted subscription).
  trial: boolean
  period: SubscriptionPeriod | undefined
  // When the periods were loaded (0 while loading).
  now: number
  className?: string
}) {
  const endsAt = period?.endsAt ?? null
  const start = period ? new Date(period.startedAt).getTime() : 0
  const end = endsAt ? new Date(endsAt).getTime() : 0
  const remainingDays = endsAt && now ? Math.max(0, Math.ceil((end - now) / DAY_MS)) : null
  const total = end - start
  const left = total > 0 && now ? Math.min(1, Math.max(0, (end - now) / total)) : 1
  const ending = remainingDays !== null && remainingDays <= (trial ? 2 : 7)

  const tone = trial
    ? { box: "border-[#d6e4ff] bg-[#f3f7ff]", text: "text-[#2878ff]", bar: "bg-[#2878ff]" }
    : { box: "border-[#cdeedb] bg-[#f0fbf4]", text: "text-[#15803d]", bar: "bg-[#16a34a]" }

  return (
    <div className={cn("rounded-[12px] border px-3.5 py-3", tone.box, className)}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn("flex items-center gap-1.5 text-[12px] font-bold", tone.text)}>
          {trial ? <Sparkles className="size-3.5" /> : <CalendarClock className="size-3.5" />}
          {trial ? "التجربة المجانية" : "الاشتراك فعّال"}
        </span>
        {remainingDays !== null ? (
          <span
            className={cn(
              "text-[12.5px] font-extrabold",
              ending ? "text-[#c2410c]" : "text-[#0b1738]"
            )}
          >
            {daysLabel(remainingDays)}
          </span>
        ) : null}
      </div>
      {endsAt ? (
        <>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                ending ? "bg-[#f97316]" : tone.bar
              )}
              style={{ width: `${Math.round(left * 100)}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-[#6b7b96]">
            {trial ? "تنتهي التجربة في" : "ينتهي الاشتراك في"} {formatDay(endsAt)}
          </p>
        </>
      ) : (
        <p className="mt-1 text-[11px] text-[#6b7b96]">
          {period ? "مفعّل بدون تاريخ انتهاء." : now ? "مفعّل على حسابك." : "…"}
        </p>
      )}
    </div>
  )
}

// The subscription of an app card: by its own id (pos, ai, expenses...), else its category.
export function periodFor(
  application: { id: string; category: string },
  periods: Record<string, SubscriptionPeriod>
) {
  return periods[application.id] ?? periods[application.category]
}

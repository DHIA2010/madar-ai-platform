"use client"

// One day, a column per provider: their working periods in white, the rest of the day shaded,
// time off hatched, and each booking drawn where it sits. Pressing a free spot starts a booking
// for that provider on that day.

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { ChevronLeft, ChevronRight, Plus } from "lucide-react"

import { cn } from "@/lib/utils"

import {
  addDays,
  dayOf,
  minuteOfDay,
  today,
  useBookingAccess,
  useBookingFormat,
  useLoad,
  weekdayOf,
} from "../hooks/use-booking"
import { useBookingBoard } from "../hooks/use-booking-board"
import { bookingService } from "../services/booking.service"
import { BookingPage, DateField, Empty, LoadFailed, Loading } from "./shell"
import { ICON_BUTTON, MUTED, PANEL, PRIMARY_BUTTON, SECONDARY_BUTTON, STATUS_TINT } from "./styles"

const PIXELS_PER_MINUTE = 1.25
const DAY_MINUTES = 24 * 60

export function BookingCalendarPage() {
  const t = useTranslations("booking.calendar")
  const format = useBookingFormat()
  const { canManage } = useBookingAccess()
  const board = useBookingBoard()
  const [date, setDate] = useState(today())
  const day = useLoad(
    () =>
      Promise.all([
        bookingService.bookings({ from: date, to: date }),
        bookingService.timeOff(),
      ]).then(([bookings, timeOff]) => ({ bookings, timeOff })),
    [date, board.version]
  )

  const providers = useMemo(
    () => board.providers.filter((provider) => provider.isActive),
    [board.providers]
  )
  const weekday = weekdayOf(date)
  const bookings = useMemo(
    () => (day.data?.bookings ?? []).filter((booking) => booking.status !== "cancelled"),
    [day.data]
  )

  // The part of the day drawn: from the first working minute to the last, widened to hold any
  // booking outside them, on whole hours.
  const [first, last] = useMemo(() => {
    const starts: number[] = []
    const ends: number[] = []
    for (const provider of providers) {
      for (const period of provider.hours.filter((entry) => entry.weekday === weekday)) {
        starts.push(period.startMinute)
        ends.push(period.endMinute)
      }
    }
    for (const booking of bookings) {
      const start = minuteOfDay(booking.startsAt)
      starts.push(start)
      ends.push(
        start + (new Date(booking.endsAt).getTime() - new Date(booking.startsAt).getTime()) / 60_000
      )
    }
    if (starts.length === 0) return [9 * 60, 18 * 60]
    return [
      Math.floor(Math.min(...starts) / 60) * 60,
      Math.min(DAY_MINUTES, Math.ceil(Math.max(...ends) / 60) * 60),
    ]
  }, [providers, bookings, weekday])
  const height = (last - first) * PIXELS_PER_MINUTE
  const top = (minute: number) => (minute - first) * PIXELS_PER_MINUTE
  const hours = Array.from({ length: (last - first) / 60 }, (_, index) => first + index * 60)

  // The parts of this day a provider is off, as minutes of the day.
  const offFor = (providerId: string) =>
    (day.data?.timeOff ?? [])
      .filter((entry) => entry.providerId === null || entry.providerId === providerId)
      .map((entry) => {
        const startDay = dayOf(entry.startsAt)
        const endDay = dayOf(new Date(new Date(entry.endsAt).getTime() - 1))
        if (startDay > date || endDay < date) return null
        return {
          id: entry.id,
          from: startDay < date ? 0 : minuteOfDay(entry.startsAt),
          to: endDay > date ? DAY_MINUTES : minuteOfDay(entry.endsAt) || DAY_MINUTES,
        }
      })
      .filter((entry): entry is { id: string; from: number; to: number } => entry !== null)

  return (
    <BookingPage
      title={t("title")}
      subtitle={format.day(date)}
      actions={
        <>
          <button
            type="button"
            className={ICON_BUTTON}
            aria-label={t("previous")}
            onClick={() => setDate(addDays(date, -1))}
          >
            <ChevronRight className="size-4 rtl:rotate-0 ltr:rotate-180" />
          </button>
          <DateField value={date} onChange={setDate} ariaLabel={t("date")} className="w-[172px]" />
          <button
            type="button"
            className={ICON_BUTTON}
            aria-label={t("next")}
            onClick={() => setDate(addDays(date, 1))}
          >
            <ChevronLeft className="size-4 rtl:rotate-0 ltr:rotate-180" />
          </button>
          <button
            type="button"
            className={SECONDARY_BUTTON}
            disabled={date === today()}
            onClick={() => setDate(today())}
          >
            {t("today")}
          </button>
          {canManage && board.services.length > 0 ? (
            <button
              type="button"
              className={PRIMARY_BUTTON}
              onClick={() => board.openNew({ date })}
            >
              <Plus className="size-4" />
              {t("newBooking")}
            </button>
          ) : null}
        </>
      }
    >
      {board.failed || day.failed ? (
        <LoadFailed
          onRetry={() => {
            board.reload()
            day.reload()
          }}
        />
      ) : !board.ready || day.data === null ? (
        <Loading />
      ) : providers.length === 0 ? (
        <div className={PANEL}>
          <Empty title={t("noProvidersTitle")}>{t("noProvidersHint")}</Empty>
        </div>
      ) : (
        <div className={cn(PANEL, "overflow-x-auto")}>
          <div
            className="grid"
            style={{
              gridTemplateColumns: `64px repeat(${providers.length}, minmax(170px, 1fr))`,
              minWidth: 64 + providers.length * 170,
            }}
          >
            <div className="sticky top-0 z-20 border-b border-[#e4e9f2] bg-[#f7f9fc]" />
            {providers.map((provider) => {
              const count = bookings.filter((booking) => booking.providerId === provider.id).length
              return (
                <div
                  key={provider.id}
                  className="sticky top-0 z-20 border-s border-b border-[#e4e9f2] bg-[#f7f9fc] px-3 py-2.5"
                >
                  <p className="truncate text-[13.5px] font-bold text-[#0b1738]">{provider.name}</p>
                  <p className={cn("text-[11.5px]", MUTED)}>{t("count", { count })}</p>
                </div>
              )
            })}

            <div className="relative" style={{ height }}>
              {hours.map((minute) => (
                <span
                  key={minute}
                  className="absolute start-0 w-full -translate-y-1/2 px-2 text-[11px] text-[#98a2b3]"
                  style={{ top: top(minute) }}
                >
                  {minute === first ? "" : format.clock(minute)}
                </span>
              ))}
            </div>
            {providers.map((provider) => {
              const periods = provider.hours.filter((entry) => entry.weekday === weekday)
              return (
                <div
                  key={provider.id}
                  className="relative border-s border-[#e4e9f2] bg-[#f4f6fa]"
                  style={{ height }}
                >
                  {periods.map((period) => (
                    <button
                      key={`${period.startMinute}-${period.endMinute}`}
                      type="button"
                      disabled={!canManage}
                      aria-label={t("bookWith", { name: provider.name })}
                      title={canManage ? t("bookWith", { name: provider.name }) : undefined}
                      onClick={() => board.openNew({ date, providerId: provider.id })}
                      className="absolute inset-x-0 bg-white transition enabled:hover:bg-[#faf8ff]"
                      style={{
                        top: top(Math.max(first, period.startMinute)),
                        height:
                          (Math.min(last, period.endMinute) - Math.max(first, period.startMinute)) *
                          PIXELS_PER_MINUTE,
                      }}
                    />
                  ))}
                  {hours.map((minute) => (
                    <span
                      key={minute}
                      className="pointer-events-none absolute inset-x-0 border-t border-[#eef1f6]"
                      style={{ top: top(minute) }}
                    />
                  ))}
                  {offFor(provider.id).map((off) => {
                    const from = Math.max(first, off.from)
                    const to = Math.min(last, off.to)
                    if (to <= from) return null
                    return (
                      <span
                        key={off.id}
                        className="pointer-events-none absolute inset-x-0 flex items-start justify-center bg-[repeating-linear-gradient(135deg,#eef1f6_0_8px,#f7f9fc_8px_16px)] pt-1 text-[11px] font-semibold text-[#667085]"
                        style={{ top: top(from), height: (to - from) * PIXELS_PER_MINUTE }}
                      >
                        {t("off")}
                      </span>
                    )
                  })}
                  {bookings
                    .filter((booking) => booking.providerId === provider.id)
                    .map((booking, _, own) => {
                      const start = minuteOfDay(booking.startsAt)
                      // Bookings that share a start (a group session) sit side by side.
                      const sharing = own.filter((other) => other.startsAt === booking.startsAt)
                      const lane = sharing.indexOf(booking)
                      const length =
                        (new Date(booking.endsAt).getTime() -
                          new Date(booking.startsAt).getTime()) /
                        60_000
                      return (
                        <button
                          key={booking.id}
                          type="button"
                          onClick={() => board.openDetails(booking)}
                          className={cn(
                            "absolute z-10 overflow-hidden rounded-[8px] border-s-4 px-2 py-1 text-start shadow-sm transition hover:brightness-95",
                            STATUS_TINT[booking.status]
                          )}
                          style={{
                            insetInlineStart: `calc(${(lane / sharing.length) * 100}% + 3px)`,
                            width: `calc(${100 / sharing.length}% - 6px)`,
                            top: top(start) + 1,
                            height: Math.max(26, length * PIXELS_PER_MINUTE - 2),
                            borderInlineStartColor: booking.serviceColor ?? "#6d28d9",
                          }}
                        >
                          <span className="block truncate text-[12.5px] font-bold">
                            {booking.customerName}
                          </span>
                          {length >= 40 ? (
                            <span className="block truncate text-[11.5px] opacity-80">
                              {format.time(booking.startsAt)} · {booking.serviceName}
                            </span>
                          ) : null}
                        </button>
                      )
                    })}
                </div>
              )
            })}
          </div>
        </div>
      )}
      {board.windows}
    </BookingPage>
  )
}

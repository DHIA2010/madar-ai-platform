"use client"

// Every booking in a period, to find one by customer, phone, number, state or provider.

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Plus, Search } from "lucide-react"

import { cn } from "@/lib/utils"

import { AppInput } from "@/components/app"

import {
  addDays,
  dayOf,
  today,
  useBookingAccess,
  useBookingFormat,
  useLoad,
} from "../hooks/use-booking"
import { useBookingBoard } from "../hooks/use-booking-board"
import { bookingService } from "../services/booking.service"
import { BOOKING_STATUSES, type BookingStatus } from "../types/booking.types"
import { BookingPage, Choice, DateField, Empty, LoadFailed, Loading, StatusPill } from "./shell"
import { FIELD, MUTED, PANEL, PRIMARY_BUTTON, TD, TH } from "./styles"

export function BookingListPage() {
  const t = useTranslations("booking.list")
  const status = useTranslations("booking.status")
  const format = useBookingFormat()
  const { canManage } = useBookingAccess()
  const board = useBookingBoard()
  const [from, setFrom] = useState(addDays(today(), -7))
  const [to, setTo] = useState(addDays(today(), 30))
  const [state, setState] = useState<BookingStatus | "all">("all")
  const [providerId, setProviderId] = useState("all")
  const [search, setSearch] = useState("")
  const [needle, setNeedle] = useState("")

  const bookings = useLoad(
    () =>
      bookingService.bookings({
        from,
        to,
        status: state,
        providerId: providerId === "all" ? undefined : providerId,
        search: needle || undefined,
      }),
    [from, to, state, providerId, needle, board.version]
  )

  return (
    <BookingPage
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        canManage && board.services.length > 0 ? (
          <button type="button" className={PRIMARY_BUTTON} onClick={() => board.openNew()}>
            <Plus className="size-4" />
            {t("newBooking")}
          </button>
        ) : null
      }
    >
      <div className={cn(PANEL, "p-4")}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
          <form
            className="relative"
            onSubmit={(event) => {
              event.preventDefault()
              setNeedle(search.trim())
            }}
          >
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[#98a2b3]" />
            <AppInput
              className={cn(FIELD, "ps-9")}
              placeholder={t("search")}
              aria-label={t("search")}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                if (!event.target.value) setNeedle("")
              }}
              onBlur={() => setNeedle(search.trim())}
            />
          </form>
          <Choice
            value={state}
            onChange={(next) => setState(next as BookingStatus | "all")}
            ariaLabel={t("status")}
            options={[
              { value: "all", label: t("allStatuses") },
              ...BOOKING_STATUSES.map((entry) => ({ value: entry, label: status(entry) })),
            ]}
          />
          <Choice
            value={providerId}
            onChange={setProviderId}
            ariaLabel={t("provider")}
            options={[
              { value: "all", label: t("allProviders") },
              ...board.providers.map((entry) => ({ value: entry.id, label: entry.name })),
            ]}
          />
          <DateField
            value={from}
            ariaLabel={t("from")}
            onChange={(next) => {
              setFrom(next)
              if (next > to) setTo(next)
            }}
          />
          <DateField
            value={to}
            ariaLabel={t("to")}
            onChange={(next) => {
              setTo(next)
              if (next < from) setFrom(next)
            }}
          />
        </div>
      </div>

      <div className={cn(PANEL, "overflow-hidden")}>
        {bookings.failed ? (
          <LoadFailed onRetry={bookings.reload} />
        ) : bookings.data === null ? (
          <Loading />
        ) : bookings.data.length === 0 ? (
          <Empty title={t("emptyTitle")}>{t("emptyHint")}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse">
              <thead>
                <tr>
                  <th className={TH}>{t("columns.number")}</th>
                  <th className={TH}>{t("columns.when")}</th>
                  <th className={TH}>{t("columns.customer")}</th>
                  <th className={TH}>{t("columns.service")}</th>
                  <th className={TH}>{t("columns.provider")}</th>
                  <th className={TH}>{t("columns.price")}</th>
                  <th className={TH}>{t("columns.status")}</th>
                </tr>
              </thead>
              <tbody>
                {bookings.data.map((booking) => (
                  <tr
                    key={booking.id}
                    tabIndex={0}
                    onClick={() => board.openDetails(booking)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") board.openDetails(booking)
                    }}
                    className="cursor-pointer border-b border-[#eef1f6] transition hover:bg-[#f7f9fc] focus:bg-[#f7f9fc] focus:outline-none"
                  >
                    <td className={cn(TD, "tabular-nums")}>#{booking.number}</td>
                    <td className={TD}>
                      <span className="block font-semibold">
                        {format.day(dayOf(booking.startsAt), "short")}
                      </span>
                      <span className={cn("block text-[12.5px]", MUTED)}>
                        {format.time(booking.startsAt)}
                      </span>
                    </td>
                    <td className={TD}>
                      <span className="block font-semibold">{booking.customerName}</span>
                      {booking.customerPhone ? (
                        <span className={cn("block text-[12.5px]", MUTED)} dir="ltr">
                          {booking.customerPhone}
                        </span>
                      ) : null}
                    </td>
                    <td className={TD}>{booking.serviceName}</td>
                    <td className={TD}>{booking.providerName}</td>
                    <td className={cn(TD, "whitespace-nowrap")}>
                      {format.money(booking.price)}
                      {booking.paymentStatus === "paid" ? (
                        <span className="ms-2 rounded-full bg-[#e7f8ee] px-2 py-0.5 text-[11px] font-bold text-[#137a41]">
                          {t("paid")}
                        </span>
                      ) : null}
                    </td>
                    <td className={TD}>
                      <StatusPill status={booking.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {board.windows}
    </BookingPage>
  )
}

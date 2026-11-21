"use client"

// The booking app's first screen: today's bookings, the period's figures, and -- for a business
// that has not finished setting up -- the few steps left before it can take a booking.

import { useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { CheckCircle2, Circle, Plus } from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { addDays, today, useBookingAccess, useBookingFormat, useLoad } from "../hooks/use-booking"
import { useBookingBoard } from "../hooks/use-booking-board"
import { bookingService } from "../services/booking.service"
import { BookingPage, Empty, LoadFailed, Loading, StatusPill } from "./shell"
import { HEADING, MUTED, PANEL, PRIMARY_BUTTON } from "./styles"

const PERIODS = [
  { key: "today", days: 0 },
  { key: "week", days: 6 },
  { key: "month", days: 29 },
] as const
type PeriodKey = (typeof PERIODS)[number]["key"]

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={cn(PANEL, "p-4")}>
      <p className={cn("text-[12.5px]", MUTED)}>{label}</p>
      <p className={cn("mt-1 text-[22px] font-extrabold", HEADING)}>{value}</p>
      {hint ? <p className={cn("mt-0.5 text-[12px]", MUTED)}>{hint}</p> : null}
    </div>
  )
}

export function BookingOverviewPage() {
  const t = useTranslations("booking.overview")
  const format = useBookingFormat()
  const { canManage } = useBookingAccess()
  const board = useBookingBoard()
  const [period, setPeriod] = useState<PeriodKey>("today")
  const days = PERIODS.find((entry) => entry.key === period)?.days ?? 0
  // Today looks at today; the longer periods look back from today.
  const range = { from: addDays(today(), -days), to: today() }
  const overview = useLoad(
    () => bookingService.overview(range),
    [range.from, range.to, board.version]
  )

  const steps = board.ready
    ? [
        { key: "services", done: board.services.length > 0, href: ROUTES.bookingServices },
        {
          key: "providers",
          done: board.providers.some(
            (provider) => provider.serviceIds.length > 0 && provider.hours.length > 0
          ),
          href: ROUTES.bookingProviders,
        },
        {
          key: "page",
          done: Boolean(board.settings?.onlineEnabled && board.settings.slug),
          href: ROUTES.bookingSettings,
        },
      ]
    : []
  const settingUp = steps.some((step) => !step.done)
  const data = overview.data
  const busiest = data ? Math.max(...data.hours) : 0

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
      {board.failed || overview.failed ? (
        <LoadFailed
          onRetry={() => {
            board.reload()
            overview.reload()
          }}
        />
      ) : !board.ready || !data ? (
        <Loading />
      ) : (
        <>
          {settingUp ? (
            <div className={cn(PANEL, "p-5")}>
              <h2 className={cn("text-[16px] font-extrabold", HEADING)}>{t("setup.title")}</h2>
              <p className={cn("mt-1 text-[13px]", MUTED)}>{t("setup.hint")}</p>
              <ol className="mt-4 grid gap-2 md:grid-cols-3">
                {steps.map((step, index) => (
                  <li key={step.key}>
                    <Link
                      href={step.href}
                      className={cn(
                        "flex h-full items-start gap-3 rounded-[14px] border p-4 transition",
                        step.done
                          ? "border-[#d1fadf] bg-[#f6fef9]"
                          : "border-[#e1e7f0] bg-white hover:border-[#6d28d9]/50"
                      )}
                    >
                      {step.done ? (
                        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#137a41]" />
                      ) : (
                        <Circle className="mt-0.5 size-5 shrink-0 text-[#98a2b3]" />
                      )}
                      <span className="min-w-0">
                        <span className={cn("block text-[14px] font-bold", HEADING)}>
                          {index + 1}. {t(`setup.${step.key}.title`)}
                        </span>
                        <span className={cn("mt-0.5 block text-[12.5px] leading-5", MUTED)}>
                          {t(`setup.${step.key}.hint`)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {PERIODS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => setPeriod(entry.key)}
                className={cn(
                  "h-10 rounded-full border px-4 text-[13px] font-semibold transition",
                  period === entry.key
                    ? "border-[#6d28d9] bg-[#6d28d9] text-white"
                    : "border-[#e1e7f0] bg-white text-[#3b4a66] hover:border-[#6d28d9]/40"
                )}
              >
                {t(`periods.${entry.key}`)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Figure
              label={t("figures.bookings")}
              value={format.number(data.totals.bookings - data.totals.cancelled)}
              hint={t("figures.online", { count: data.totals.online })}
            />
            <Figure
              label={t("figures.revenue")}
              value={format.money(data.totals.revenue)}
              hint={[
                t("figures.expected", { amount: format.money(data.totals.expected) }),
                data.totals.discounts > 0
                  ? t("figures.discounts", { amount: format.money(data.totals.discounts) })
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
            <Figure
              label={t("figures.pending")}
              value={format.number(data.totals.pending)}
              hint={t("figures.pendingHint")}
            />
            <Figure
              label={t("figures.lost")}
              value={format.number(data.totals.cancelled + data.totals.noShow)}
              hint={t("figures.lostHint", {
                cancelled: data.totals.cancelled,
                noShow: data.totals.noShow,
              })}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className={cn(PANEL, "overflow-hidden")}>
              <div className="flex items-center justify-between gap-3 px-5 pt-4">
                <h2 className={cn("text-[16px] font-extrabold", HEADING)}>{t("today.title")}</h2>
                <Link
                  href={ROUTES.bookingCalendar}
                  className="text-[13px] font-semibold text-[#6d28d9]"
                >
                  {t("today.openCalendar")}
                </Link>
              </div>
              {data.today.length === 0 ? (
                <Empty>{t("today.empty")}</Empty>
              ) : (
                <ul className="mt-2 divide-y divide-[#eef1f6]">
                  {data.today.map((booking) => (
                    <li key={booking.id}>
                      <button
                        type="button"
                        onClick={() => board.openDetails(booking)}
                        className="flex w-full items-center gap-3 px-5 py-3 text-start transition hover:bg-[#f7f9fc]"
                      >
                        <span className="w-[76px] shrink-0 text-[13px] font-bold text-[#0b1738]">
                          {format.time(booking.startsAt)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-bold text-[#0b1738]">
                            {booking.customerName}
                          </span>
                          <span className={cn("block truncate text-[12.5px]", MUTED)}>
                            {booking.serviceName} · {booking.providerName}
                          </span>
                        </span>
                        <StatusPill status={booking.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-col gap-4">
              <div className={cn(PANEL, "p-5")}>
                <h2 className={cn("text-[15px] font-extrabold", HEADING)}>{t("services.title")}</h2>
                {data.services.length === 0 ? (
                  <p className={cn("mt-3 text-[13px]", MUTED)}>{t("noData")}</p>
                ) : (
                  <ul className="mt-3 space-y-2.5">
                    {data.services.map((service) => (
                      <li key={service.name} className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-[13.5px] font-semibold text-[#0b1738]">
                          {service.name}
                        </span>
                        <span className={cn("shrink-0 text-[12.5px]", MUTED)}>
                          {t("services.row", {
                            count: service.bookings,
                            amount: format.money(service.value),
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className={cn(PANEL, "p-5")}>
                <h2 className={cn("text-[15px] font-extrabold", HEADING)}>
                  {t("providers.title")}
                </h2>
                {data.providers.length === 0 ? (
                  <p className={cn("mt-3 text-[13px]", MUTED)}>{t("noData")}</p>
                ) : (
                  <ul className="mt-3 space-y-2.5">
                    {data.providers.map((provider) => (
                      <li key={provider.name} className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-[13.5px] font-semibold text-[#0b1738]">
                          {provider.name}
                        </span>
                        <span className={cn("shrink-0 text-[12.5px]", MUTED)}>
                          {t("providers.row", {
                            count: provider.bookings,
                            time: format.duration(provider.bookedMinutes),
                          })}
                          {provider.commission > 0
                            ? ` · ${t("providers.commission", { amount: format.money(provider.commission) })}`
                            : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div className={cn(PANEL, "p-5")}>
            <h2 className={cn("text-[15px] font-extrabold", HEADING)}>{t("hours.title")}</h2>
            <p className={cn("mt-0.5 text-[12.5px]", MUTED)}>{t("hours.hint")}</p>
            {busiest === 0 ? (
              <p className={cn("mt-3 text-[13px]", MUTED)}>{t("noData")}</p>
            ) : (
              <div className="mt-4 flex h-[120px] items-end gap-1" dir="ltr">
                {data.hours.map((count, hour) => (
                  <div key={hour} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                    <div
                      title={`${format.clock(hour * 60)}: ${count}`}
                      className={cn("rounded-t-[4px]", count ? "bg-[#6d28d9]" : "bg-[#eef1f6]")}
                      style={{ height: `${count ? Math.max(8, (count / busiest) * 100) : 3}%` }}
                    />
                    <span className="mt-1 text-center text-[10px] text-[#98a2b3]">
                      {hour % 3 === 0 ? hour : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
      {board.windows}
    </BookingPage>
  )
}

"use client"

// The waiting list: people who wanted a time on a day that was full. When a time opens on their
// day the row says so, and the staff can book them into it or tell them on WhatsApp.

import { useState } from "react"
import { useTranslations } from "next-intl"
import { CalendarPlus, Loader2, MessageCircle, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppDialog, AppInput } from "@/components/app"

import {
  today,
  useBookingAccess,
  useBookingError,
  useBookingFormat,
  useLoad,
} from "../hooks/use-booking"
import { useBookingBoard } from "../hooks/use-booking-board"
import { bookingService } from "../services/booking.service"
import type { WaitlistEntry } from "../types/booking.types"
import { BookingPage, Choice, DateField, Empty, LoadFailed, Loading } from "./shell"
import {
  FIELD,
  FIELD_LABEL,
  ICON_BUTTON,
  MUTED,
  PANEL,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  TD,
  TH,
} from "./styles"

// A phone number the way wa.me wants it: digits only, with Saudi mobiles given their country code.
function whatsAppNumber(raw: string): string | null {
  let digits = raw.replace(/[^\d+]/g, "")
  if (digits.startsWith("+")) digits = digits.slice(1)
  else if (digits.startsWith("00")) digits = digits.slice(2)
  else if (/^05\d{8}$/.test(digits)) digits = `966${digits.slice(1)}`
  else if (/^5\d{8}$/.test(digits)) digits = `966${digits}`
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null
}

export function BookingWaitlistPage() {
  const t = useTranslations("booking.waitlist")
  const format = useBookingFormat()
  const errorText = useBookingError()
  const { canManage } = useBookingAccess()
  const board = useBookingBoard()
  const list = useLoad(() => bookingService.waitlist(), [board.version])
  const [adding, setAdding] = useState<{
    serviceId: string
    name: string
    phone: string
    date: string
    note: string
  } | null>(null)
  const [busy, setBusy] = useState(false)

  const close = (entry: WaitlistEntry, status: "booked" | "removed", done?: string) =>
    bookingService
      .closeWaitlist(entry.id, status)
      .then(() => {
        if (done) toast.success(done)
        list.reload()
      })
      .catch((error: unknown) => toast.error(errorText(error)))

  const tell = (entry: WaitlistEntry) => {
    const number = entry.customerPhone ? whatsAppNumber(entry.customerPhone) : null
    if (!number || !entry.openTime) return
    const slug = board.settings?.onlineEnabled ? board.settings.slug : null
    const message = t("whatsapp", {
      name: entry.customerName,
      service: entry.serviceName,
      day: format.day(entry.preferredDate),
      time: format.time(entry.openTime),
      link: slug ? `${window.location.origin}${ROUTES.publicBookingPage(slug)}` : "",
    }).trim()
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, "_blank", "noopener")
  }

  return (
    <BookingPage
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        canManage && board.services.length > 0 ? (
          <button
            type="button"
            className={PRIMARY_BUTTON}
            onClick={() =>
              setAdding({
                serviceId: board.services[0].id,
                name: "",
                phone: "",
                date: today(),
                note: "",
              })
            }
          >
            <Plus className="size-4" />
            {t("add")}
          </button>
        ) : null
      }
    >
      <div className={cn(PANEL, "overflow-hidden")}>
        {list.failed ? (
          <LoadFailed onRetry={list.reload} />
        ) : list.data === null ? (
          <Loading />
        ) : list.data.length === 0 ? (
          <Empty title={t("emptyTitle")}>{t("emptyHint")}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr>
                  <th className={TH}>{t("customer")}</th>
                  <th className={TH}>{t("service")}</th>
                  <th className={TH}>{t("day")}</th>
                  <th className={TH}>{t("state")}</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody>
                {list.data.map((entry) => (
                  <tr key={entry.id} className="border-b border-[#eef1f6]">
                    <td className={TD}>
                      <span className="block font-semibold">{entry.customerName}</span>
                      {entry.customerPhone ? (
                        <span className={cn("block text-[12.5px]", MUTED)} dir="ltr">
                          {entry.customerPhone}
                        </span>
                      ) : null}
                    </td>
                    <td className={TD}>
                      {entry.serviceName}
                      {entry.providerName ? (
                        <span className={cn("block text-[12.5px]", MUTED)}>
                          {entry.providerName}
                        </span>
                      ) : null}
                    </td>
                    <td className={TD}>
                      {format.day(entry.preferredDate, "short")}
                      {entry.note ? (
                        <span className={cn("block text-[12.5px]", MUTED)}>{entry.note}</span>
                      ) : null}
                    </td>
                    <td className={TD}>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[11.5px] font-bold whitespace-nowrap",
                          entry.openTime
                            ? "bg-[#e7f8ee] text-[#137a41]"
                            : "bg-[#f1f4f9] text-[#667085]"
                        )}
                      >
                        {entry.openTime
                          ? t("open", { time: format.time(entry.openTime) })
                          : t("full")}
                      </span>
                    </td>
                    <td className={TD}>
                      {canManage ? (
                        <span className="flex justify-end gap-2">
                          <button
                            type="button"
                            className={cn(SECONDARY_BUTTON, "h-10 text-[#6d28d9]")}
                            onClick={() =>
                              board.openNew(
                                {
                                  date: entry.preferredDate,
                                  serviceId: entry.serviceId,
                                  providerId: entry.providerId ?? undefined,
                                  customerName: entry.customerName,
                                  customerPhone: entry.customerPhone ?? undefined,
                                },
                                () => void close(entry, "booked")
                              )
                            }
                          >
                            <CalendarPlus className="size-4" />
                            {t("book")}
                          </button>
                          <button
                            type="button"
                            className={cn(ICON_BUTTON, "text-[#137a41]")}
                            aria-label={t("tell")}
                            title={entry.openTime ? t("tell") : t("tellWhenOpen")}
                            disabled={!entry.openTime || !entry.customerPhone}
                            onClick={() => tell(entry)}
                          >
                            <MessageCircle className="size-4" />
                          </button>
                          <button
                            type="button"
                            className={cn(ICON_BUTTON, "text-[#b42318]")}
                            aria-label={t("remove")}
                            title={t("remove")}
                            onClick={() => void close(entry, "removed", t("removed"))}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AppDialog
        open={adding !== null}
        onOpenChange={(next) => {
          if (!next && !busy) setAdding(null)
        }}
        title={t("addTitle")}
        footer={
          <>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              disabled={busy}
              onClick={() => setAdding(null)}
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              className={PRIMARY_BUTTON}
              disabled={busy || !adding?.name.trim()}
              onClick={() => {
                if (!adding) return
                setBusy(true)
                bookingService
                  .addToWaitlist({
                    serviceId: adding.serviceId,
                    customerName: adding.name.trim(),
                    customerPhone: adding.phone.trim() || null,
                    preferredDate: adding.date,
                    note: adding.note.trim() || null,
                  })
                  .then(() => {
                    toast.success(t("added"))
                    setAdding(null)
                    list.reload()
                  })
                  .catch((error: unknown) => toast.error(errorText(error)))
                  .finally(() => setBusy(false))
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("save")}
            </button>
          </>
        }
      >
        {adding ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <span className={FIELD_LABEL}>{t("service")}</span>
              <Choice
                value={adding.serviceId}
                onChange={(serviceId) => setAdding({ ...adding, serviceId })}
                ariaLabel={t("service")}
                options={board.services.map((service) => ({
                  value: service.id,
                  label: service.name,
                }))}
              />
            </div>
            <div>
              <span className={FIELD_LABEL}>{t("day")}</span>
              <DateField
                value={adding.date}
                ariaLabel={t("day")}
                onChange={(date) => setAdding({ ...adding, date })}
              />
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="wait-name">
                {t("customerName")}
              </label>
              <AppInput
                id="wait-name"
                className={FIELD}
                maxLength={120}
                value={adding.name}
                onChange={(event) => setAdding({ ...adding, name: event.target.value })}
              />
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="wait-phone">
                {t("customerPhone")}
              </label>
              <AppInput
                id="wait-phone"
                className={FIELD}
                dir="ltr"
                inputMode="tel"
                maxLength={30}
                placeholder="05xxxxxxxx"
                value={adding.phone}
                onChange={(event) => setAdding({ ...adding, phone: event.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={FIELD_LABEL} htmlFor="wait-note">
                {t("note")}
              </label>
              <AppInput
                id="wait-note"
                className={FIELD}
                maxLength={300}
                value={adding.note}
                onChange={(event) => setAdding({ ...adding, note: event.target.value })}
              />
            </div>
          </div>
        ) : null}
      </AppDialog>
      {board.windows}
    </BookingPage>
  )
}

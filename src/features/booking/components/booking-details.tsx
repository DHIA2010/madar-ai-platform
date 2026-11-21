"use client"

// One booking, opened from the calendar or the list: what it is, and everything that can be done
// with it -- confirm, finish, mark a no-show, cancel, bring back, move, record payment, and send
// the customer a confirmation or a reminder on WhatsApp from the staff's own phone.

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import {
  CalendarClock,
  Check,
  CircleDollarSign,
  Copy,
  FileText,
  Loader2,
  MessageCircle,
  RotateCcw,
  UserX,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppDialog } from "@/components/app"

import { useWorkspace } from "@/features/workspace"

import { dayOf, useBookingAccess, useBookingError, useBookingFormat } from "../hooks/use-booking"
import { bookingService } from "../services/booking.service"
import type { Booking, BookingStatus } from "../types/booking.types"
import { StatusPill } from "./shell"
import { DANGER_BUTTON, MUTED, PRIMARY_BUTTON, SECONDARY_BUTTON, TEXTAREA } from "./styles"

// A phone number the way wa.me wants it: digits only, with Saudi mobiles given their country code.
function whatsAppNumber(raw: string): string | null {
  let digits = raw.replace(/[^\d+]/g, "")
  if (digits.startsWith("+")) digits = digits.slice(1)
  else if (digits.startsWith("00")) digits = digits.slice(2)
  else if (/^05\d{8}$/.test(digits)) digits = `966${digits.slice(1)}`
  else if (/^5\d{8}$/.test(digits)) digits = `966${digits}`
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className={cn("shrink-0 text-[12.5px]", MUTED)}>{label}</span>
      <span className="min-w-0 text-end text-[13.5px] font-semibold text-[#0b1738]">
        {children}
      </span>
    </div>
  )
}

export function BookingDetails({
  booking,
  businessName,
  onClose,
  onChanged,
  onMove,
}: {
  booking: Booking | null
  businessName: string | null
  onClose: () => void
  onChanged: (booking: Booking) => void
  onMove: (booking: Booking) => void
}) {
  const t = useTranslations("booking.details")
  const format = useBookingFormat()
  const errorText = useBookingError()
  const { canManage } = useBookingAccess()
  const { currentOrganization } = useWorkspace()
  const [busy, setBusy] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState("")
  const [notes, setNotes] = useState("")

  useEffect(() => {
    setCancelling(false)
    setReason("")
    setNotes(booking?.notes ?? "")
  }, [booking?.id, booking?.notes])

  if (!booking) return null

  const run = async (key: string, work: () => Promise<Booking>, done: string) => {
    setBusy(key)
    try {
      onChanged(await work())
      toast.success(done)
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setBusy(null)
    }
  }
  const status = (next: BookingStatus, done: string) =>
    run(
      next,
      () => bookingService.setStatus(booking.id, next, next === "cancelled" ? reason : null),
      done
    )

  const link = `${window.location.origin}${ROUTES.publicBookingManage(booking.publicToken)}`
  const business = businessName || currentOrganization?.name || ""
  const number = booking.customerPhone ? whatsAppNumber(booking.customerPhone) : null
  const message = (kind: "confirm" | "remind") =>
    t(kind === "confirm" ? "whatsappConfirm" : "whatsappRemind", {
      name: booking.customerName,
      business,
      service: booking.serviceName,
      day: format.day(dayOf(booking.startsAt)),
      time: format.time(booking.startsAt),
      provider: booking.providerName,
      link,
    })
  const whatsApp = (kind: "confirm" | "remind") => {
    if (!number) return
    window.open(
      `https://wa.me/${number}?text=${encodeURIComponent(message(kind))}`,
      "_blank",
      "noopener"
    )
  }

  const open = booking.status === "pending" || booking.status === "confirmed"
  const spinner = (key: string) =>
    busy === key ? <Loader2 className="size-4 animate-spin" /> : null

  return (
    <AppDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title={
        <span className="flex flex-wrap items-center gap-2">
          {t("title", { number: booking.number })}
          <StatusPill status={booking.status} />
        </span>
      }
      contentClassName="max-w-[34rem]"
    >
      <div className="divide-y divide-[#eef1f6]">
        <Line label={t("customer")}>
          {booking.customerName}
          {booking.customerPhone ? (
            <span className="block text-[12.5px] font-normal text-[#52607a]" dir="ltr">
              {booking.customerPhone}
            </span>
          ) : null}
        </Line>
        <Line label={t("service")}>
          {booking.serviceName}
          {booking.optionName ? ` - ${booking.optionName}` : ""}
          {booking.partySize > 1 ? ` × ${booking.partySize}` : ""}
          {booking.addons.length > 0 ? (
            <span className="block text-[12.5px] font-normal text-[#52607a]">
              + {booking.addons.map((addon) => addon.name).join("، ")}
            </span>
          ) : null}
        </Line>
        <Line label={t("provider")}>{booking.providerName}</Line>
        <Line label={t("when")}>
          {format.day(dayOf(booking.startsAt))}
          <span className="block text-[12.5px] font-normal text-[#52607a]">
            {format.time(booking.startsAt)} – {format.time(booking.endsAt)}
          </span>
        </Line>
        <Line label={t("price")}>
          {format.money(booking.price)}
          <span
            className={cn(
              "ms-2 rounded-full px-2 py-0.5 text-[11px] font-bold",
              booking.paymentStatus === "paid"
                ? "bg-[#e7f8ee] text-[#137a41]"
                : "bg-[#f1f4f9] text-[#667085]"
            )}
          >
            {t(booking.paymentStatus)}
          </span>
        </Line>
        {booking.subtotal !== booking.price ? (
          <Line label={t("priceHow")}>
            <span className="block text-[12.5px] font-normal text-[#52607a]">
              {[
                t("before", { amount: format.money(booking.subtotal) }),
                booking.customerPlanId ? t("byPlan") : null,
                !booking.customerPlanId && booking.discount > 0
                  ? t("byCoupon", {
                      code: booking.couponCode ?? "",
                      amount: format.money(booking.discount),
                    })
                  : null,
                booking.loyaltyDiscount > 0
                  ? t("byPoints", { amount: format.money(booking.loyaltyDiscount) })
                  : null,
                booking.giftAmount > 0
                  ? t("byGift", { amount: format.money(booking.giftAmount) })
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </Line>
        ) : null}
        {booking.paidOnline > 0 ? (
          <Line label={t("paidOnline")}>
            {format.money(booking.paidOnline)}
            {booking.refundedOnline > 0 ? (
              <span className="block text-[12.5px] font-normal text-[#b42318]">
                {t("refundedOnline", { amount: format.money(booking.refundedOnline) })}
              </span>
            ) : canManage ? (
              <button
                type="button"
                className="ms-2 text-[12.5px] font-semibold text-[#b42318] underline"
                disabled={busy !== null}
                onClick={() =>
                  void run("refund", () => bookingService.refund(booking.id), t("refunded"))
                }
              >
                {t("refund")}
              </button>
            ) : null}
          </Line>
        ) : booking.paymentDue > 0 && booking.status === "pending" ? (
          <Line label={t("paidOnline")}>
            <span className="text-[#b54708]">
              {t("awaitingPayment", { amount: format.money(booking.paymentDue) })}
            </span>
          </Line>
        ) : null}
        {booking.commissionAmount > 0 ? (
          <Line label={t("commission")}>{format.money(booking.commissionAmount)}</Line>
        ) : null}
        {booking.invoiceNumber ? (
          <Line label={t("invoice")}>
            <span dir="ltr">{booking.invoiceNumber}</span>
          </Line>
        ) : null}
        {booking.seriesId ? (
          <Line label={t("series")}>
            {t("seriesPart")}
            {canManage ? (
              <button
                type="button"
                className="ms-2 text-[12.5px] font-semibold text-[#b42318] underline"
                disabled={busy !== null}
                onClick={() => {
                  if (!booking.seriesId) return
                  setBusy("series")
                  bookingService
                    .cancelSeries(booking.seriesId)
                    .then(async ({ cancelled }) => {
                      toast.success(t("seriesCancelled", { count: cancelled }))
                      onChanged(await bookingService.setNotes(booking.id, booking.notes))
                    })
                    .catch((error: unknown) => toast.error(errorText(error)))
                    .finally(() => setBusy(null))
                }}
              >
                {t("cancelSeries")}
              </button>
            ) : null}
          </Line>
        ) : null}
        <Line label={t("source")}>{t(`sources.${booking.source}`)}</Line>
        {booking.customerNotes ? (
          <Line label={t("customerNotes")}>{booking.customerNotes}</Line>
        ) : null}
        {booking.status === "cancelled" ? (
          <Line label={t("cancelled")}>
            {t(`cancelledBy.${booking.cancelledBy === "customer" ? "customer" : "staff"}`)}
            {booking.cancelReason ? (
              <span className="block text-[12.5px] font-normal text-[#52607a]">
                {booking.cancelReason}
              </span>
            ) : null}
          </Line>
        ) : null}
      </div>

      {canManage ? (
        <>
          <div className="mt-3">
            <label
              className="mb-1.5 block text-[12.5px] font-semibold text-[#344054]"
              htmlFor="details-notes"
            >
              {t("notes")}
            </label>
            <textarea
              id="details-notes"
              rows={2}
              maxLength={1000}
              className={TEXTAREA}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              onBlur={() => {
                if ((notes.trim() || null) !== (booking.notes ?? null)) {
                  void run(
                    "notes",
                    () => bookingService.setNotes(booking.id, notes.trim() || null),
                    t("notesSaved")
                  )
                }
              }}
            />
          </div>

          {cancelling ? (
            <div className="mt-3 rounded-[12px] bg-[#fef3f2] p-3">
              <label
                className="mb-1.5 block text-[12.5px] font-semibold text-[#b42318]"
                htmlFor="details-reason"
              >
                {t("cancelReason")}
              </label>
              <textarea
                id="details-reason"
                rows={2}
                maxLength={300}
                className={TEXTAREA}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              <div className="mt-2 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className={SECONDARY_BUTTON}
                  onClick={() => setCancelling(false)}
                >
                  {t("keep")}
                </button>
                <button
                  type="button"
                  className={cn(PRIMARY_BUTTON, "bg-[#d92d20] hover:bg-[#b42318]")}
                  disabled={busy !== null}
                  onClick={() => void status("cancelled", t("done.cancelled"))}
                >
                  {spinner("cancelled")}
                  {t("confirmCancel")}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              {booking.status === "pending" ? (
                <button
                  type="button"
                  className={PRIMARY_BUTTON}
                  disabled={busy !== null}
                  onClick={() => void status("confirmed", t("done.confirmed"))}
                >
                  {spinner("confirmed") ?? <Check className="size-4" />}
                  {t("confirm")}
                </button>
              ) : null}
              {booking.status === "confirmed" ? (
                <button
                  type="button"
                  className={PRIMARY_BUTTON}
                  disabled={busy !== null}
                  onClick={() => void status("completed", t("done.completed"))}
                >
                  {spinner("completed") ?? <Check className="size-4" />}
                  {t("complete")}
                </button>
              ) : null}
              {open ? (
                <button type="button" className={SECONDARY_BUTTON} onClick={() => onMove(booking)}>
                  <CalendarClock className="size-4" />
                  {t("move")}
                </button>
              ) : null}
              <button
                type="button"
                className={SECONDARY_BUTTON}
                disabled={busy !== null}
                onClick={() =>
                  void run(
                    "payment",
                    () => bookingService.setPayment(booking.id, booking.paymentStatus !== "paid"),
                    booking.paymentStatus === "paid" ? t("done.unpaid") : t("done.paid")
                  )
                }
              >
                {spinner("payment") ?? <CircleDollarSign className="size-4" />}
                {booking.paymentStatus === "paid" ? t("markUnpaid") : t("markPaid")}
              </button>
              {booking.status === "completed" && !booking.customerPlanId ? (
                <button
                  type="button"
                  className={SECONDARY_BUTTON}
                  disabled={busy !== null}
                  onClick={() => {
                    setBusy("invoice")
                    bookingService
                      .issueInvoice(booking.id)
                      .then((invoiced) => {
                        onChanged(invoiced)
                        if (invoiced.invoiceUrl) {
                          window.open(invoiced.invoiceUrl, "_blank", "noopener")
                        }
                      })
                      .catch((error: unknown) => toast.error(errorText(error)))
                      .finally(() => setBusy(null))
                  }}
                >
                  {spinner("invoice") ?? <FileText className="size-4" />}
                  {booking.invoiceNumber ? t("openInvoice") : t("issueInvoice")}
                </button>
              ) : null}
              {booking.status === "confirmed" ? (
                <button
                  type="button"
                  className={SECONDARY_BUTTON}
                  disabled={busy !== null}
                  onClick={() => void status("no_show", t("done.noShow"))}
                >
                  {spinner("no_show") ?? <UserX className="size-4" />}
                  {t("noShow")}
                </button>
              ) : null}
              {open ? (
                <button type="button" className={DANGER_BUTTON} onClick={() => setCancelling(true)}>
                  <X className="size-4" />
                  {t("cancel")}
                </button>
              ) : (
                <button
                  type="button"
                  className={SECONDARY_BUTTON}
                  disabled={busy !== null}
                  onClick={() => void status("confirmed", t("done.restored"))}
                >
                  {spinner("confirmed") ?? <RotateCcw className="size-4" />}
                  {t("restore")}
                </button>
              )}
            </div>
          )}
        </>
      ) : null}

      <div className="mt-4 rounded-[12px] bg-[#f7f9fc] p-3">
        <p className="text-[12.5px] font-semibold text-[#344054]">{t("tellCustomer")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className={cn(SECONDARY_BUTTON, "text-[#137a41]")}
            disabled={!number}
            onClick={() => whatsApp("confirm")}
          >
            <MessageCircle className="size-4" />
            {t("sendConfirm")}
          </button>
          <button
            type="button"
            className={cn(SECONDARY_BUTTON, "text-[#137a41]")}
            disabled={!number}
            onClick={() => whatsApp("remind")}
          >
            <MessageCircle className="size-4" />
            {t("sendReminder")}
          </button>
          <button
            type="button"
            className={SECONDARY_BUTTON}
            onClick={() => {
              void navigator.clipboard.writeText(link).then(() => toast.success(t("linkCopied")))
            }}
          >
            <Copy className="size-4" />
            {t("copyLink")}
          </button>
        </div>
        {number ? null : <p className={cn("mt-2 text-[12px]", MUTED)}>{t("noPhone")}</p>}
        {booking.confirmationSentAt || booking.reminderSentAt ? (
          <p className={cn("mt-2 text-[12px]", MUTED)}>
            {[
              booking.confirmationSentAt ? t("autoConfirmSent") : null,
              booking.reminderSentAt ? t("autoReminderSent") : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
      </div>
    </AppDialog>
  )
}

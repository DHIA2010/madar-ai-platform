"use client"

// Coupons (a code that takes something off a booking's price) and gift cards (a prepaid amount
// under a code, spent on bookings until it runs out).

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Copy, Loader2, Pencil, Plus, Send, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { AppDialog, AppInput, AppSwitch } from "@/components/app"

import { useBookingAccess, useBookingError, useBookingFormat, useLoad } from "../hooks/use-booking"
import { bookingService } from "../services/booking.service"
import type { BookingCoupon, BookingCouponInput, BookingGiftCard } from "../types/booking.types"
import { GiftSendDialog } from "./gift-card"
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

const BLANK_COUPON: BookingCouponInput = {
  code: "",
  kind: "percent",
  value: 10,
  maxDiscount: null,
  minAmount: 0,
  startsOn: null,
  endsOn: null,
  usageLimit: null,
  perCustomerLimit: null,
  serviceIds: [],
  isActive: true,
}
const BLANK_GIFT = {
  amount: 100,
  recipientName: "",
  recipientPhone: "",
  purchaserName: "",
  message: "",
  // Send it to the person on WhatsApp by itself, once made.
  auto: true,
}
// A number field that may be left empty ("no limit").
const optional = (value: string) => (value.trim() === "" ? null : Math.max(0, Number(value) || 0))

export function BookingOffersPage() {
  const t = useTranslations("booking.offers")
  const format = useBookingFormat()
  const errorText = useBookingError()
  const { canManage } = useBookingAccess()
  const [tab, setTab] = useState<"coupons" | "gifts">("coupons")
  const data = useLoad(
    () =>
      Promise.all([bookingService.coupons(), bookingService.giftCards()]).then(
        ([coupons, gifts]) => ({ coupons, gifts })
      ),
    []
  )
  const [coupon, setCoupon] = useState<{ id: string | null; draft: BookingCouponInput } | null>(
    null
  )
  const [gift, setGift] = useState<typeof BLANK_GIFT | null>(null)
  // The card being sent to the person it is for.
  const [sendingGift, setSendingGift] = useState<BookingGiftCard | null>(null)
  const [busy, setBusy] = useState(false)

  const setDraft = <K extends keyof BookingCouponInput>(key: K, value: BookingCouponInput[K]) =>
    setCoupon((current) =>
      current ? { ...current, draft: { ...current.draft, [key]: value } } : current
    )

  const act = async (work: () => Promise<unknown>, done: string, close: () => void) => {
    setBusy(true)
    try {
      await work()
      toast.success(done)
      close()
      data.reload()
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setBusy(false)
    }
  }
  const copy = (code: string) =>
    void navigator.clipboard.writeText(code).then(() => toast.success(t("copied")))

  const valueOf = (entry: BookingCoupon) =>
    entry.kind === "percent" ? `${entry.value}%` : format.money(entry.value)
  const draft = coupon?.draft

  return (
    <BookingPage
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        canManage ? (
          <button
            type="button"
            className={PRIMARY_BUTTON}
            onClick={() =>
              tab === "coupons" ? setCoupon({ id: null, draft: BLANK_COUPON }) : setGift(BLANK_GIFT)
            }
          >
            <Plus className="size-4" />
            {tab === "coupons" ? t("addCoupon") : t("addGift")}
          </button>
        ) : null
      }
    >
      <div className="flex flex-wrap gap-2">
        {(["coupons", "gifts"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "h-10 rounded-full border px-4 text-[13px] font-semibold transition",
              tab === key
                ? "border-[#6d28d9] bg-[#6d28d9] text-white"
                : "border-[#e1e7f0] bg-white text-[#3b4a66] hover:border-[#6d28d9]/40"
            )}
          >
            {t(`tabs.${key}`)}
          </button>
        ))}
      </div>

      <div className={cn(PANEL, "overflow-hidden")}>
        {data.failed ? (
          <LoadFailed onRetry={data.reload} />
        ) : data.data === null ? (
          <Loading />
        ) : tab === "coupons" ? (
          data.data.coupons.length === 0 ? (
            <Empty title={t("coupons.emptyTitle")}>{t("coupons.emptyHint")}</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse">
                <thead>
                  <tr>
                    <th className={TH}>{t("coupons.code")}</th>
                    <th className={TH}>{t("coupons.discount")}</th>
                    <th className={TH}>{t("coupons.used")}</th>
                    <th className={TH}>{t("coupons.until")}</th>
                    <th className={TH}>{t("state")}</th>
                    <th className={TH} />
                  </tr>
                </thead>
                <tbody>
                  {data.data.coupons.map((entry) => (
                    <tr key={entry.id} className="border-b border-[#eef1f6]">
                      <td className={cn(TD, "font-bold")} dir="ltr">
                        {entry.code}
                      </td>
                      <td className={TD}>
                        {valueOf(entry)}
                        {entry.minAmount > 0 ? (
                          <span className={cn("block text-[12px]", MUTED)}>
                            {t("coupons.minimum", { amount: format.money(entry.minAmount) })}
                          </span>
                        ) : null}
                      </td>
                      <td className={TD}>
                        {entry.usageLimit === null
                          ? entry.usedCount
                          : t("coupons.usedOf", { used: entry.usedCount, limit: entry.usageLimit })}
                      </td>
                      <td className={TD}>
                        {entry.endsOn ? format.day(entry.endsOn, "short") : "—"}
                      </td>
                      <td className={TD}>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[11.5px] font-bold",
                            entry.isActive
                              ? "bg-[#e7f8ee] text-[#137a41]"
                              : "bg-[#f1f4f9] text-[#667085]"
                          )}
                        >
                          {entry.isActive ? t("active") : t("stopped")}
                        </span>
                      </td>
                      <td className={TD}>
                        <span className="flex justify-end gap-2">
                          <button
                            type="button"
                            className={ICON_BUTTON}
                            aria-label={t("copy")}
                            title={t("copy")}
                            onClick={() => copy(entry.code)}
                          >
                            <Copy className="size-4" />
                          </button>
                          {canManage ? (
                            <>
                              <button
                                type="button"
                                className={ICON_BUTTON}
                                aria-label={t("edit")}
                                title={t("edit")}
                                onClick={() => {
                                  const { id, ...rest } = entry
                                  setCoupon({
                                    id,
                                    draft: {
                                      code: rest.code,
                                      kind: rest.kind,
                                      value: rest.value,
                                      maxDiscount: rest.maxDiscount,
                                      minAmount: rest.minAmount,
                                      startsOn: rest.startsOn,
                                      endsOn: rest.endsOn,
                                      usageLimit: rest.usageLimit,
                                      perCustomerLimit: rest.perCustomerLimit,
                                      serviceIds: rest.serviceIds,
                                      isActive: rest.isActive,
                                    },
                                  })
                                }}
                              >
                                <Pencil className="size-4" />
                              </button>
                              <button
                                type="button"
                                className={cn(ICON_BUTTON, "text-[#b42318]")}
                                aria-label={t("remove")}
                                title={t("remove")}
                                onClick={() =>
                                  void act(
                                    () => bookingService.removeCoupon(entry.id),
                                    t("removed"),
                                    () => undefined
                                  )
                                }
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </>
                          ) : null}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : data.data.gifts.length === 0 ? (
          <Empty title={t("gifts.emptyTitle")}>{t("gifts.emptyHint")}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr>
                  <th className={TH}>{t("gifts.code")}</th>
                  <th className={TH}>{t("gifts.for")}</th>
                  <th className={TH}>{t("gifts.amount")}</th>
                  <th className={TH}>{t("gifts.balance")}</th>
                  <th className={TH}>{t("state")}</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody>
                {data.data.gifts.map((entry) => (
                  <tr key={entry.id} className="border-b border-[#eef1f6]">
                    <td className={cn(TD, "font-bold")} dir="ltr">
                      {entry.code}
                    </td>
                    <td className={TD}>
                      {entry.recipientName ?? "—"}
                      {entry.purchaserName ? (
                        <span className={cn("block text-[12px]", MUTED)}>
                          {t("gifts.from", { name: entry.purchaserName })}
                        </span>
                      ) : null}
                    </td>
                    <td className={TD}>{format.money(entry.initialAmount)}</td>
                    <td className={cn(TD, "font-bold")}>{format.money(entry.balance)}</td>
                    <td className={TD}>
                      {canManage ? (
                        <AppSwitch
                          checked={entry.isActive}
                          aria-label={t("active")}
                          onCheckedChange={(on) =>
                            void act(
                              () => bookingService.setGiftCardActive(entry.id, on),
                              on ? t("active") : t("stopped"),
                              () => undefined
                            )
                          }
                        />
                      ) : entry.isActive ? (
                        t("active")
                      ) : (
                        t("stopped")
                      )}
                    </td>
                    <td className={TD}>
                      <span className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          className={ICON_BUTTON}
                          aria-label={t("gifts.send")}
                          title={t("gifts.send")}
                          onClick={() => setSendingGift(entry)}
                        >
                          <Send className="size-4" />
                        </button>
                        <button
                          type="button"
                          className={ICON_BUTTON}
                          aria-label={t("copy")}
                          title={t("copy")}
                          onClick={() => copy(entry.code)}
                        >
                          <Copy className="size-4" />
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AppDialog
        open={coupon !== null}
        onOpenChange={(next) => {
          if (!next && !busy) setCoupon(null)
        }}
        title={coupon?.id ? t("coupons.editTitle") : t("coupons.addTitle")}
        footer={
          <>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              disabled={busy}
              onClick={() => setCoupon(null)}
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              className={PRIMARY_BUTTON}
              disabled={busy || !draft || draft.code.trim().length < 2 || draft.value <= 0}
              onClick={() => {
                if (!coupon) return
                void act(
                  () =>
                    coupon.id
                      ? bookingService.updateCoupon(coupon.id, coupon.draft)
                      : bookingService.createCoupon(coupon.draft),
                  t("saved"),
                  () => setCoupon(null)
                )
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("save")}
            </button>
          </>
        }
      >
        {draft ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={FIELD_LABEL} htmlFor="coupon-code">
                {t("coupons.code")}
              </label>
              <AppInput
                id="coupon-code"
                className={FIELD}
                dir="ltr"
                maxLength={40}
                placeholder="WELCOME10"
                value={draft.code}
                onChange={(event) => setDraft("code", event.target.value.toUpperCase())}
              />
            </div>
            <div>
              <span className={FIELD_LABEL}>{t("coupons.kind")}</span>
              <Choice
                value={draft.kind}
                onChange={(next) => setDraft("kind", next as "percent" | "fixed")}
                ariaLabel={t("coupons.kind")}
                options={[
                  { value: "percent", label: t("coupons.percent") },
                  { value: "fixed", label: t("coupons.fixed") },
                ]}
              />
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="coupon-value">
                {draft.kind === "percent" ? t("coupons.percentValue") : t("coupons.fixedValue")}
              </label>
              <AppInput
                id="coupon-value"
                type="number"
                inputMode="decimal"
                min={0}
                max={draft.kind === "percent" ? 100 : undefined}
                className={FIELD}
                value={draft.value}
                onChange={(event) =>
                  setDraft("value", Math.max(0, Number(event.target.value) || 0))
                }
              />
            </div>
            {draft.kind === "percent" ? (
              <div>
                <label className={FIELD_LABEL} htmlFor="coupon-max">
                  {t("coupons.maxDiscount")}
                </label>
                <AppInput
                  id="coupon-max"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  className={FIELD}
                  placeholder={t("noLimit")}
                  value={draft.maxDiscount ?? ""}
                  onChange={(event) =>
                    setDraft("maxDiscount", optional(event.target.value) || null)
                  }
                />
              </div>
            ) : null}
            <div>
              <label className={FIELD_LABEL} htmlFor="coupon-min">
                {t("coupons.minAmount")}
              </label>
              <AppInput
                id="coupon-min"
                type="number"
                inputMode="decimal"
                min={0}
                className={FIELD}
                value={draft.minAmount}
                onChange={(event) =>
                  setDraft("minAmount", Math.max(0, Number(event.target.value) || 0))
                }
              />
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="coupon-limit">
                {t("coupons.usageLimit")}
              </label>
              <AppInput
                id="coupon-limit"
                type="number"
                inputMode="numeric"
                min={1}
                className={FIELD}
                placeholder={t("noLimit")}
                value={draft.usageLimit ?? ""}
                onChange={(event) =>
                  setDraft("usageLimit", Math.round(optional(event.target.value) ?? 0) || null)
                }
              />
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="coupon-per-customer">
                {t("coupons.perCustomer")}
              </label>
              <AppInput
                id="coupon-per-customer"
                type="number"
                inputMode="numeric"
                min={1}
                className={FIELD}
                placeholder={t("noLimit")}
                value={draft.perCustomerLimit ?? ""}
                onChange={(event) =>
                  setDraft(
                    "perCustomerLimit",
                    Math.round(optional(event.target.value) ?? 0) || null
                  )
                }
              />
            </div>
            <div>
              <span className={FIELD_LABEL}>{t("coupons.endsOn")}</span>
              <div className="flex items-center gap-2">
                <DateField
                  className="flex-1"
                  value={draft.endsOn ?? ""}
                  ariaLabel={t("coupons.endsOn")}
                  onChange={(next) => setDraft("endsOn", next)}
                />
                {draft.endsOn ? (
                  <button
                    type="button"
                    className="text-[12.5px] font-semibold text-[#6d28d9]"
                    onClick={() => setDraft("endsOn", null)}
                  >
                    {t("noLimit")}
                  </button>
                ) : null}
              </div>
            </div>
            <label className="flex items-center gap-3 sm:col-span-2">
              <AppSwitch
                checked={draft.isActive}
                aria-label={t("active")}
                onCheckedChange={(on) => setDraft("isActive", on)}
              />
              <span className="text-[13.5px] font-semibold text-[#0b1738]">
                {t("coupons.usable")}
              </span>
            </label>
          </div>
        ) : null}
      </AppDialog>

      <AppDialog
        open={gift !== null}
        onOpenChange={(next) => {
          if (!next && !busy) setGift(null)
        }}
        title={t("gifts.addTitle")}
        description={t("gifts.addHint")}
        footer={
          <>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              disabled={busy}
              onClick={() => setGift(null)}
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              className={PRIMARY_BUTTON}
              disabled={busy || !gift || gift.amount <= 0}
              onClick={() => {
                if (!gift) return
                const auto = gift.auto && gift.recipientPhone.trim() !== ""
                void act(
                  () =>
                    bookingService
                      .createGiftCard({
                        amount: gift.amount,
                        recipientName: gift.recipientName.trim() || null,
                        recipientPhone: gift.recipientPhone.trim() || null,
                        purchaserName: gift.purchaserName.trim() || null,
                        message: gift.message.trim() || null,
                        sendWhatsApp: auto,
                      })
                      .then((made) => {
                        // Gone out by itself: nothing more to do. Otherwise straight on to
                        // sending it by hand.
                        if (made.whatsapp === "sent") {
                          toast.success(t("gifts.autoSent"))
                          return
                        }
                        if (auto) toast.info(t("gifts.autoFailed"))
                        setSendingGift(made)
                      }),
                  t("gifts.created"),
                  () => setGift(null)
                )
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("gifts.create")}
            </button>
          </>
        }
      >
        {gift ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={FIELD_LABEL} htmlFor="gift-amount">
                {t("gifts.amount")}
              </label>
              <AppInput
                id="gift-amount"
                type="number"
                inputMode="decimal"
                min={1}
                className={FIELD}
                value={gift.amount}
                onChange={(event) =>
                  setGift({ ...gift, amount: Math.max(0, Number(event.target.value) || 0) })
                }
              />
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="gift-buyer">
                {t("gifts.buyer")}
              </label>
              <AppInput
                id="gift-buyer"
                className={FIELD}
                maxLength={120}
                value={gift.purchaserName}
                onChange={(event) => setGift({ ...gift, purchaserName: event.target.value })}
              />
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="gift-recipient">
                {t("gifts.recipient")}
              </label>
              <AppInput
                id="gift-recipient"
                className={FIELD}
                maxLength={120}
                value={gift.recipientName}
                onChange={(event) => setGift({ ...gift, recipientName: event.target.value })}
              />
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="gift-phone">
                {t("gifts.recipientPhone")}
              </label>
              <AppInput
                id="gift-phone"
                className={FIELD}
                dir="ltr"
                inputMode="tel"
                maxLength={30}
                value={gift.recipientPhone}
                onChange={(event) => setGift({ ...gift, recipientPhone: event.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={FIELD_LABEL} htmlFor="gift-message">
                {t("gifts.message")}
              </label>
              <AppInput
                id="gift-message"
                className={FIELD}
                maxLength={300}
                value={gift.message}
                onChange={(event) => setGift({ ...gift, message: event.target.value })}
              />
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-[12px] bg-[#f0fdf4] px-3.5 py-3 sm:col-span-2">
              <AppSwitch
                checked={gift.auto}
                aria-label={t("gifts.auto")}
                onCheckedChange={(on) => setGift({ ...gift, auto: on })}
              />
              <span className="min-w-0">
                <span className="block text-[13.5px] font-bold text-[#166534]">
                  {t("gifts.auto")}
                </span>
                <span className="block text-[12.5px] leading-5 text-[#3f6212]">
                  {t("gifts.autoHint")}
                </span>
              </span>
            </label>
          </div>
        ) : null}
      </AppDialog>
      <GiftSendDialog gift={sendingGift} onClose={() => setSendingGift(null)} />
    </BookingPage>
  )
}

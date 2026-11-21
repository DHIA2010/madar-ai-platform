"use client"

// Taking a booking from inside Madar, or moving one: the service, who provides it, the day, one
// of the times that are really free, and who it is for. The staff may also book outside the free
// times ("force") -- a walk-in squeezed in, or an hour outside the provider's usual day.

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { AppDialog, AppInput, AppSwitch } from "@/components/app"

import { dayOf, instantAt, today, useBookingError, useBookingFormat } from "../hooks/use-booking"
import { bookingService } from "../services/booking.service"
import type {
  Booking,
  BookingCustomerLookup,
  BookingProvider,
  BookingQuote,
  BookingServiceItem,
  Slot,
} from "../types/booking.types"
import { Choice, DateField, TimeField } from "./shell"
import { FIELD, FIELD_LABEL, MUTED, PRIMARY_BUTTON, SECONDARY_BUTTON, TEXTAREA } from "./styles"

const ANYONE = "any"

export function BookingDialog({
  open,
  onClose,
  onSaved,
  services,
  providers,
  initial,
  moving,
}: {
  open: boolean
  onClose: () => void
  onSaved: (booking: Booking) => void
  services: BookingServiceItem[]
  providers: BookingProvider[]
  // Where the dialog starts when opened from a spot on the calendar.
  initial?: {
    date?: string
    providerId?: string
    serviceId?: string
    customerName?: string
    customerPhone?: string
  }
  // The booking being moved; absent when a new one is being taken.
  moving?: Booking | null
}) {
  const t = useTranslations("booking.dialog")
  const format = useBookingFormat()
  const errorText = useBookingError()

  const [serviceId, setServiceId] = useState("")
  const [providerId, setProviderId] = useState(ANYONE)
  const [date, setDate] = useState(today())
  const [slot, setSlot] = useState<string | null>(null)
  const [force, setForce] = useState(false)
  const [forcedTime, setForcedTime] = useState("10:00")
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [partySize, setPartySize] = useState("1")
  const [notes, setNotes] = useState("")
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [saving, setSaving] = useState(false)
  // What the price depends on, and what lowers or pays it.
  const [optionId, setOptionId] = useState("")
  const [addonIds, setAddonIds] = useState<string[]>([])
  const [couponCode, setCouponCode] = useState("")
  const [giftCode, setGiftCode] = useState("")
  const [planId, setPlanId] = useState("")
  const [redeem, setRedeem] = useState(false)
  const [known, setKnown] = useState<BookingCustomerLookup | null>(null)
  const [quote, setQuote] = useState<BookingQuote | null>(null)
  const [quoteProblem, setQuoteProblem] = useState<string | null>(null)
  // A booking that repeats: every so many weeks ("0" for once), so many visits.
  const [everyWeeks, setEveryWeeks] = useState("0")
  const [visits, setVisits] = useState("4")

  const active = useMemo(() => services.filter((service) => service.isActive), [services])
  const service = services.find((entry) => entry.id === serviceId) ?? null
  const able = useMemo(
    () =>
      providers.filter((provider) => provider.isActive && provider.serviceIds.includes(serviceId)),
    [providers, serviceId]
  )

  // Opening the dialog starts it fresh, or from the booking being moved.
  useEffect(() => {
    if (!open) return
    setServiceId(moving?.serviceId ?? initial?.serviceId ?? active[0]?.id ?? "")
    setEveryWeeks("0")
    setVisits("4")
    setProviderId(moving?.providerId ?? initial?.providerId ?? ANYONE)
    setDate(moving ? dayOf(moving.startsAt) : (initial?.date ?? today()))
    setSlot(null)
    setForce(false)
    setName(moving?.customerName ?? initial?.customerName ?? "")
    setPhone(moving?.customerPhone ?? initial?.customerPhone ?? "")
    setPartySize(String(moving?.partySize ?? 1))
    setNotes(moving?.notes ?? "")
    setAddonIds([])
    setCouponCode("")
    setGiftCode("")
    setPlanId("")
    setRedeem(false)
    setKnown(null)
    setQuote(null)
    setQuoteProblem(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when it opens
  }, [open])

  // A service with options is booked as one of them: start on the first.
  useEffect(() => {
    const options = services.find((entry) => entry.id === serviceId)?.options ?? []
    setOptionId(options[0]?.id ?? "")
    setAddonIds([])
  }, [serviceId, services])

  // Who the customer is, once a phone is typed: their packages and points.
  useEffect(() => {
    const typed = phone.trim()
    if (!open || moving || typed.replace(/\D/g, "").length < 9) {
      setKnown(null)
      setPlanId("")
      setRedeem(false)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      bookingService
        .lookupCustomer(typed)
        .then((found) => {
          if (cancelled) return
          setKnown(found)
          if (found.name) setName((current) => current || (found.name ?? ""))
        })
        .catch(() => undefined)
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, moving, phone])

  // A provider who does not do the chosen service cannot stay chosen.
  useEffect(() => {
    if (providerId !== ANYONE && serviceId && !able.some((entry) => entry.id === providerId)) {
      setProviderId(ANYONE)
    }
  }, [able, providerId, serviceId])

  const people = Math.max(1, Number(partySize) || 1)
  useEffect(() => {
    if (!open || !serviceId) {
      setSlots(null)
      return
    }
    let cancelled = false
    setSlots(null)
    setSlot(null)
    bookingService
      .availability({
        serviceId,
        date,
        providerId: providerId === ANYONE ? null : providerId,
        partySize: people,
        ignoreBookingId: moving?.id ?? null,
        optionId: moving ? null : optionId || null,
        addonIds: moving ? [] : addonIds,
      })
      .then((found) => {
        if (!cancelled) setSlots(found)
      })
      .catch(() => {
        if (!cancelled) setSlots([])
      })
    return () => {
      cancelled = true
    }
  }, [open, serviceId, date, providerId, people, moving, optionId, addonIds])

  // The price as it stands, asked for again a moment after anything it depends on changes.
  const addonKey = addonIds.join(",")
  const planOk = known?.plans.some((plan) => plan.id === planId) ? planId : ""
  useEffect(() => {
    if (!open || moving || !serviceId) return
    let cancelled = false
    const timer = setTimeout(() => {
      bookingService
        .quote({
          serviceId,
          partySize: people,
          optionId: optionId || null,
          addonIds: addonKey ? addonKey.split(",") : [],
          couponCode: couponCode.trim() || null,
          giftCode: giftCode.trim() || null,
          customerPlanId: planOk || null,
          redeemPoints: redeem ? (known?.points ?? 0) : null,
          customerId: known?.customerId ?? null,
          customerPhone: phone.trim() || null,
          date,
        })
        .then((found) => {
          if (cancelled) return
          setQuote(found)
          setQuoteProblem(null)
        })
        .catch((error: unknown) => {
          if (cancelled) return
          setQuote(null)
          setQuoteProblem(errorText(error))
        })
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [
    open,
    moving,
    serviceId,
    people,
    optionId,
    addonKey,
    couponCode,
    giftCode,
    planOk,
    redeem,
    known,
    phone,
    date,
    errorText,
  ])

  const startsAt = force ? instantAt(date, forcedTime) : slot
  const ready = Boolean(serviceId && startsAt && (moving || (name.trim() && !quoteProblem)))

  const save = async () => {
    if (!ready || !startsAt) return
    setSaving(true)
    try {
      const chosen = providerId === ANYONE ? null : providerId
      if (moving) {
        onSaved(await bookingService.reschedule(moving.id, { startsAt, providerId: chosen, force }))
        toast.success(t("moved"))
        onClose()
        return
      }
      const repeat =
        everyWeeks === "0"
          ? null
          : {
              everyWeeks: Number(everyWeeks),
              count: Math.min(26, Math.max(2, Math.round(Number(visits) || 2))),
            }
      const result = await bookingService.createBooking({
        serviceId,
        providerId: chosen,
        startsAt,
        customerName: name.trim(),
        customerPhone: phone.trim() || null,
        partySize: people,
        notes: notes.trim() || null,
        force,
        optionId: optionId || null,
        addonIds,
        couponCode: couponCode.trim() || null,
        giftCode: giftCode.trim() || null,
        customerPlanId: planOk || null,
        redeemPoints: redeem ? (known?.points ?? 0) : null,
        repeat,
      })
      if ("created" in result) {
        // A repeating booking: say how many visits were made, and how many weeks were full.
        toast.success(
          result.skipped.length > 0
            ? t("seriesSavedSome", {
                made: result.created.length,
                skipped: result.skipped.length,
              })
            : t("seriesSaved", { made: result.created.length })
        )
        onSaved(result.created[0])
      } else {
        toast.success(t("saved"))
        onSaved(result)
      }
      onClose()
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) onClose()
      }}
      title={moving ? t("moveTitle") : t("newTitle")}
      description={moving ? t("moveHint", { name: moving.customerName }) : undefined}
      footer={
        <>
          <button type="button" className={SECONDARY_BUTTON} onClick={onClose} disabled={saving}>
            {t("cancel")}
          </button>
          <button
            type="button"
            className={PRIMARY_BUTTON}
            onClick={() => void save()}
            disabled={!ready || saving}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {moving ? t("move") : t("save")}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <span className={FIELD_LABEL}>{t("service")}</span>
          <Choice
            value={serviceId}
            onChange={setServiceId}
            disabled={Boolean(moving)}
            ariaLabel={t("service")}
            options={active.map((entry) => ({
              value: entry.id,
              label: entry.name,
              hint: `${format.duration(entry.durationMinutes)} · ${format.money(entry.price)}`,
            }))}
          />
        </div>
        <div>
          <span className={FIELD_LABEL}>{t("provider")}</span>
          <Choice
            value={providerId}
            onChange={setProviderId}
            ariaLabel={t("provider")}
            options={[
              { value: ANYONE, label: t("anyProvider") },
              ...able.map((entry) => ({ value: entry.id, label: entry.name })),
            ]}
          />
        </div>
        <div>
          <span className={FIELD_LABEL}>{t("date")}</span>
          <DateField value={date} onChange={setDate} ariaLabel={t("date")} />
        </div>
        {service && service.capacity > 1 && !moving ? (
          <div>
            <label className={FIELD_LABEL} htmlFor="booking-people">
              {t("people")}
            </label>
            <AppInput
              id="booking-people"
              type="number"
              inputMode="numeric"
              min={1}
              max={service.capacity}
              className={FIELD}
              value={partySize}
              onChange={(event) => setPartySize(event.target.value)}
            />
          </div>
        ) : null}

        {service && service.options.length > 0 && !moving ? (
          <div>
            <span className={FIELD_LABEL}>{t("option")}</span>
            <Choice
              value={optionId}
              onChange={setOptionId}
              ariaLabel={t("option")}
              options={service.options.map((entry) => ({
                value: entry.id ?? "",
                label: entry.name,
                hint: `${format.duration(entry.durationMinutes)} · ${format.money(entry.price)}`,
              }))}
            />
          </div>
        ) : null}
        {service && service.addons.length > 0 && !moving ? (
          <div className="sm:col-span-2">
            <span className={FIELD_LABEL}>{t("addons")}</span>
            <div className="flex flex-wrap gap-2">
              {service.addons.map((addon) => {
                const id = addon.id ?? ""
                const on = addonIds.includes(id)
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setAddonIds(on ? addonIds.filter((entry) => entry !== id) : [...addonIds, id])
                    }
                    className={cn(
                      "h-10 rounded-full border px-4 text-[13px] font-semibold transition",
                      on
                        ? "border-[#6d28d9] bg-[#f5f3ff] text-[#6d28d9]"
                        : "border-[#e1e7f0] bg-white text-[#3b4a66] hover:border-[#6d28d9]/40"
                    )}
                  >
                    {addon.name} · +{format.money(addon.price)}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        <div className="sm:col-span-2">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[12.5px] font-semibold text-[#344054]">{t("time")}</span>
            <label className="flex items-center gap-2 text-[12.5px] text-[#52607a]">
              <AppSwitch checked={force} onCheckedChange={setForce} aria-label={t("force")} />
              {t("force")}
            </label>
          </div>
          {force ? (
            <>
              <TimeField
                className="max-w-[180px]"
                ariaLabel={t("time")}
                value={forcedTime}
                onChange={setForcedTime}
              />
              <p className={cn("mt-1.5 text-[12px] leading-5", MUTED)}>{t("forceHint")}</p>
            </>
          ) : slots === null ? (
            <p className={cn("flex items-center gap-2 py-3 text-[13px]", MUTED)}>
              <Loader2 className="size-4 animate-spin" />
              {t("loadingTimes")}
            </p>
          ) : slots.length === 0 ? (
            <p className="rounded-[12px] bg-[#f7f9fc] px-3 py-3 text-[13px] leading-6 text-[#52607a]">
              {able.length === 0 ? t("noProviderForService") : t("noTimes")}
            </p>
          ) : (
            <div className="grid max-h-[176px] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
              {slots.map((entry) => (
                <button
                  key={entry.startsAt}
                  type="button"
                  onClick={() => setSlot(entry.startsAt)}
                  className={cn(
                    "h-11 rounded-[10px] border text-[13px] font-semibold transition",
                    slot === entry.startsAt
                      ? "border-[#6d28d9] bg-[#6d28d9] text-white"
                      : "border-[#e1e7f0] bg-white text-[#0b1738] hover:border-[#6d28d9]/50"
                  )}
                >
                  {format.time(entry.startsAt)}
                </button>
              ))}
            </div>
          )}
        </div>

        {moving ? null : (
          <>
            <div>
              <label className={FIELD_LABEL} htmlFor="booking-name">
                {t("customerName")}
              </label>
              <AppInput
                id="booking-name"
                className={FIELD}
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="booking-phone">
                {t("customerPhone")}
              </label>
              <AppInput
                id="booking-phone"
                className={FIELD}
                dir="ltr"
                inputMode="tel"
                maxLength={30}
                placeholder="05xxxxxxxx"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </div>
            <div className="space-y-3 rounded-[12px] bg-[#f7f9fc] p-3 sm:col-span-2">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={FIELD_LABEL} htmlFor="booking-coupon">
                    {t("coupon")}
                  </label>
                  <AppInput
                    id="booking-coupon"
                    className={FIELD}
                    dir="ltr"
                    maxLength={40}
                    disabled={Boolean(planOk)}
                    value={couponCode}
                    onChange={(event) => setCouponCode(event.target.value)}
                  />
                </div>
                <div>
                  <label className={FIELD_LABEL} htmlFor="booking-gift">
                    {t("giftCard")}
                  </label>
                  <AppInput
                    id="booking-gift"
                    className={FIELD}
                    dir="ltr"
                    maxLength={40}
                    disabled={Boolean(planOk)}
                    value={giftCode}
                    onChange={(event) => setGiftCode(event.target.value)}
                  />
                </div>
              </div>
              {known && known.plans.length > 0 ? (
                <div>
                  <span className={FIELD_LABEL}>{t("plan")}</span>
                  <Choice
                    value={planOk || "none"}
                    onChange={(next) => setPlanId(next === "none" ? "" : next)}
                    ariaLabel={t("plan")}
                    options={[
                      { value: "none", label: t("noPlan") },
                      ...known.plans
                        .filter(
                          (plan) =>
                            plan.serviceIds.length === 0 || plan.serviceIds.includes(serviceId)
                        )
                        .map((plan) => ({
                          value: plan.id,
                          label: plan.planName,
                          hint:
                            plan.usesLeft === null
                              ? t("planUnlimited")
                              : t("planLeft", { count: plan.usesLeft }),
                        })),
                    ]}
                  />
                </div>
              ) : null}
              {known && known.points > 0 && !planOk ? (
                <label className="flex items-center gap-2 text-[13px] text-[#0b1738]">
                  <AppSwitch
                    checked={redeem}
                    onCheckedChange={setRedeem}
                    aria-label={t("usePoints")}
                  />
                  {t("usePoints")}
                  <span className={MUTED}>{t("pointsBalance", { count: known.points })}</span>
                </label>
              ) : null}
              {quoteProblem ? (
                <p role="alert" className="text-[13px] font-semibold text-[#b42318]">
                  {quoteProblem}
                </p>
              ) : quote ? (
                <dl className="space-y-1 border-t border-[#e4e9f2] pt-2 text-[13px]">
                  <div className="flex justify-between">
                    <dt className={MUTED}>{t("subtotal")}</dt>
                    <dd>{format.money(quote.subtotal)}</dd>
                  </div>
                  {quote.customerPlanId ? (
                    <div className="flex justify-between text-[#137a41]">
                      <dt>{t("coveredByPlan")}</dt>
                      <dd>−{format.money(quote.subtotal)}</dd>
                    </div>
                  ) : null}
                  {!quote.customerPlanId && quote.discount > 0 ? (
                    <div className="flex justify-between text-[#137a41]">
                      <dt>{t("couponDiscount")}</dt>
                      <dd>−{format.money(quote.discount)}</dd>
                    </div>
                  ) : null}
                  {quote.loyaltyDiscount > 0 ? (
                    <div className="flex justify-between text-[#137a41]">
                      <dt>{t("pointsDiscount", { count: quote.loyaltyPoints })}</dt>
                      <dd>−{format.money(quote.loyaltyDiscount)}</dd>
                    </div>
                  ) : null}
                  {quote.giftAmount > 0 ? (
                    <div className="flex justify-between text-[#137a41]">
                      <dt>{t("giftPays")}</dt>
                      <dd>−{format.money(quote.giftAmount)}</dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between text-[14.5px] font-extrabold text-[#0b1738]">
                    <dt>{t("total")}</dt>
                    <dd>{format.money(quote.total)}</dd>
                  </div>
                </dl>
              ) : null}
            </div>
            <div>
              <span className={FIELD_LABEL}>{t("repeat")}</span>
              <Choice
                value={everyWeeks}
                onChange={setEveryWeeks}
                ariaLabel={t("repeat")}
                options={[
                  { value: "0", label: t("repeatNone") },
                  { value: "1", label: t("repeatWeekly") },
                  { value: "2", label: t("repeatTwoWeeks") },
                  { value: "4", label: t("repeatFourWeeks") },
                ]}
              />
            </div>
            {everyWeeks === "0" ? null : (
              <div>
                <label className={FIELD_LABEL} htmlFor="booking-visits">
                  {t("repeatCount")}
                </label>
                <AppInput
                  id="booking-visits"
                  type="number"
                  inputMode="numeric"
                  min={2}
                  max={26}
                  className={FIELD}
                  value={visits}
                  onChange={(event) => setVisits(event.target.value)}
                />
                <p className={cn("mt-1 text-[12px] leading-5", MUTED)}>{t("repeatHint")}</p>
              </div>
            )}
            <div className="sm:col-span-2">
              <label className={FIELD_LABEL} htmlFor="booking-notes">
                {t("notes")}
              </label>
              <textarea
                id="booking-notes"
                rows={2}
                maxLength={1000}
                className={TEXTAREA}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          </>
        )}
      </div>
    </AppDialog>
  )
}

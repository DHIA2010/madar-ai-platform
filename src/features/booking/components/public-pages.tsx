"use client"

// What a customer sees, with no login: a business's booking page (service, who, day, time, name
// and phone), and their own booking by its link -- to check it or cancel it within the business's
// deadline.

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { CalendarCheck, Check, Loader2, MapPin, Phone, Star, Users } from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { addDays, dayOf, today, useBookingFormat } from "../hooks/use-booking"
import { accountMemory } from "../services/account-memory"
import { publicBookingService } from "../services/booking.service"
import { removeMoyasarForm, showMoyasarForm } from "../services/moyasar-form"
import type { BookingQuote, PublicBooking, PublicBookingPage, Slot } from "../types/booking.types"
import { DEFAULT_ACCENT, Storefront } from "./storefront"
import { STATUS_TINT } from "./styles"

import { cairo } from "@/components/design/fonts"
import { type Locale, localeDirection } from "@/i18n/locales"

const CARD =
  "rounded-[18px] border border-[#e4e9f2] bg-white shadow-[0_1px_3px_rgba(11,23,56,0.05)]"
const INPUT =
  "h-12 w-full rounded-[12px] border border-[#d5dce8] bg-white px-3.5 text-[15px] text-[#0b1738] outline-none transition placeholder:text-[#a3b0c6] focus:border-[var(--bk-accent)] focus:ring-2 focus:ring-[var(--bk-accent)]/15"
const BUTTON =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-[var(--bk-accent)] px-5 text-[15px] font-bold text-white transition hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-60"
const ANYONE = "any"

function Frame({ children, accent }: { children: React.ReactNode; accent?: string | null }) {
  const locale = useLocale() as Locale
  const t = useTranslations("booking.public")
  return (
    <div
      dir={localeDirection(locale)}
      // The business's own colour, where it chose one.
      style={{ "--bk-accent": accent ?? DEFAULT_ACCENT } as React.CSSProperties}
      className={cn(cairo.className, "min-h-dvh bg-[#f6f7fb] px-4 py-6 text-[#0b1738]")}
    >
      <div className="mx-auto w-full max-w-[560px] space-y-4">{children}</div>
      <p className="mt-6 text-center text-[12px] text-[#98a2b3]">{t("poweredBy")}</p>
    </div>
  )
}

function Business({
  business,
}: {
  business: { name: string; logoUrl: string | null; phone: string | null; address: string | null }
}) {
  return (
    <div className={cn(CARD, "flex items-center gap-3 p-4")}>
      {business.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- the business's own logo, shown as-is
        <img
          src={business.logoUrl}
          alt=""
          className="size-14 shrink-0 rounded-[14px] object-cover"
        />
      ) : (
        <span className="flex size-14 shrink-0 items-center justify-center rounded-[14px] bg-[#f5f3ff] text-[var(--bk-accent)]">
          <CalendarCheck className="size-7" />
        </span>
      )}
      <div className="min-w-0">
        <h1 className="truncate text-[20px] font-extrabold">{business.name}</h1>
        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-[#52607a]">
          {business.address ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" />
              {business.address}
            </span>
          ) : null}
          {business.phone ? (
            <a href={`tel:${business.phone}`} className="inline-flex items-center gap-1" dir="ltr">
              <Phone className="size-3.5" />
              {business.phone}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function Message({ title, hint }: { title: string; hint?: string }) {
  return (
    <Frame>
      <div className={cn(CARD, "px-6 py-14 text-center")}>
        <p className="text-[17px] font-extrabold">{title}</p>
        {hint ? <p className="mt-2 text-[13.5px] leading-6 text-[#52607a]">{hint}</p> : null}
      </div>
    </Frame>
  )
}

// The summary of a booking, as the customer keeps it.
function Summary({ booking }: { booking: PublicBooking }) {
  const t = useTranslations("booking.public")
  const status = useTranslations("booking.status")
  const format = useBookingFormat()
  const rows: Array<[string, string]> = [
    [
      t("summary.service"),
      [
        booking.serviceName + (booking.optionName ? ` - ${booking.optionName}` : ""),
        booking.partySize > 1 ? `× ${booking.partySize}` : null,
        ...booking.addons.map((addon) => `+ ${addon}`),
      ]
        .filter(Boolean)
        .join(" "),
    ],
    [t("summary.day"), format.day(dayOf(booking.startsAt))],
    [t("summary.time"), `${format.time(booking.startsAt)} – ${format.time(booking.endsAt)}`],
    [t("summary.provider"), booking.providerName ?? t("providerOnArrival")],
    ...(booking.reduction > 0
      ? ([[t("summary.reduction"), `−${format.money(booking.reduction)}`]] as Array<
          [string, string]
        >)
      : []),
    [t("summary.price"), format.money(booking.price)],
  ]
  return (
    <div className={cn(CARD, "p-5")}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[15px] font-extrabold">
          {t("summary.title", { number: booking.number })}
        </p>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[12px] font-bold",
            STATUS_TINT[booking.status]
          )}
        >
          {status(booking.status)}
        </span>
      </div>
      <dl className="mt-3 divide-y divide-[#eef1f6]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 py-2.5">
            <dt className="text-[13px] text-[#6b7b96]">{label}</dt>
            <dd className="text-end text-[14px] font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function PublicBookingPageView({ slug }: { slug: string }) {
  const t = useTranslations("booking.public")
  const format = useBookingFormat()
  const [page, setPage] = useState<PublicBookingPage | null>(null)
  const [missing, setMissing] = useState(false)
  const [serviceId, setServiceId] = useState<string | null>(null)
  const [providerId, setProviderId] = useState(ANYONE)
  const [date, setDate] = useState(today())
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [notes, setNotes] = useState("")
  const [people, setPeople] = useState(1)
  const [website, setWebsite] = useState("")
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [optionId, setOptionId] = useState<string | null>(null)
  const [addonIds, setAddonIds] = useState<string[]>([])
  const [codesOpen, setCodesOpen] = useState(false)
  const [couponCode, setCouponCode] = useState("")
  const [giftCode, setGiftCode] = useState("")
  const [quote, setQuote] = useState<BookingQuote | null>(null)
  const [codeProblem, setCodeProblem] = useState<string | null>(null)
  // The waiting list, offered on a day with no free time.
  const [waiting, setWaiting] = useState<"closed" | "open" | "sending" | "done">("closed")
  const [done, setDone] = useState<{ token: string | null; booking: PublicBooking | null } | null>(
    null
  )
  // Who this browser is on the page, once it has booked here before.
  const [account, setAccount] = useState<{ name: string; unread: number } | null>(null)

  // Coming from a gift card's page: its code is already written in.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("gift")
    if (!code) return
    setGiftCode(code.slice(0, 40))
    setCodesOpen(true)
  }, [])

  useEffect(() => {
    const token = accountMemory.read(slug)
    if (!token) return
    publicBookingService
      .accountBrief(slug, token)
      .then((brief) => {
        setAccount(brief)
        // Their name and phone are already known: the form starts filled in.
        setName((current) => current || brief.name)
        setPhone((current) => current || (brief.phone ?? ""))
      })
      .catch((error: unknown) => {
        if ((error as { code?: string }).code === "BOOKING_NOT_FOUND") accountMemory.forget(slug)
      })
  }, [slug])

  useEffect(() => {
    publicBookingService
      .page(slug)
      .then(setPage)
      .catch(() => setMissing(true))
  }, [slug])

  const service = page?.services.find((entry) => entry.id === serviceId) ?? null
  const able = useMemo(
    () =>
      page && service
        ? page.providers.filter((entry) => service.providerIds.includes(entry.id))
        : [],
    [page, service]
  )
  const days = useMemo(
    () =>
      Array.from({ length: Math.min(page?.advanceDays ?? 14, 60) + 1 }, (_, index) =>
        addDays(today(), index)
      ),
    [page?.advanceDays]
  )

  useEffect(() => {
    if (!serviceId) return
    let cancelled = false
    setSlots(null)
    setSlot(null)
    setWaiting("closed")
    publicBookingService
      .availability(slug, {
        serviceId,
        date,
        providerId: providerId === ANYONE ? null : providerId,
        partySize: people,
        optionId,
        addonIds,
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
  }, [slug, serviceId, date, providerId, people, optionId, addonIds])

  // The price as it stands, asked for again a moment after anything it depends on changes.
  const addonKey = addonIds.join(",")
  useEffect(() => {
    if (!serviceId) {
      setQuote(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      publicBookingService
        .quote(slug, {
          serviceId,
          partySize: people,
          optionId,
          addonIds: addonKey ? addonKey.split(",") : [],
          couponCode: couponCode.trim() || null,
          giftCode: giftCode.trim() || null,
          customerPhone: phone.trim() || null,
          date,
        })
        .then((found) => {
          if (cancelled) return
          setQuote(found)
          setCodeProblem(null)
        })
        .catch((error: unknown) => {
          if (cancelled) return
          const code = (error as { code?: string }).code
          setCodeProblem(
            code === "BOOKING_COUPON_INVALID"
              ? t("errors.coupon")
              : code === "BOOKING_GIFT_INVALID"
                ? t("errors.gift")
                : code === "BOOKING_RATE_LIMITED"
                  ? t("errors.limited")
                  : null
          )
        })
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [slug, serviceId, people, optionId, addonKey, couponCode, giftCode, phone, date, t])

  if (missing) return <Message title={t("closedTitle")} hint={t("closedHint")} />
  if (!page) {
    return (
      <Frame>
        <p className="flex items-center justify-center gap-2 py-24 text-[14px] text-[#6b7b96]">
          <Loader2 className="size-4 animate-spin" />
          {t("loading")}
        </p>
      </Frame>
    )
  }

  const send = async () => {
    if (!service || !slot) return
    setSending(true)
    setProblem(null)
    try {
      const result = await publicBookingService.create(slug, {
        serviceId: service.id,
        providerId: providerId === ANYONE ? null : providerId,
        startsAt: slot.startsAt,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        partySize: people,
        notes: notes.trim() || null,
        website: website || undefined,
        optionId,
        addonIds,
        couponCode: couponCode.trim() || null,
        giftCode: giftCode.trim() || null,
        accountToken: accountMemory.read(slug),
      })
      accountMemory.keep(slug, result.accountToken)
      // Something is due online: the customer's own booking page takes the payment.
      if (result.token && result.booking?.payment) {
        window.location.assign(ROUTES.publicBookingManage(result.token))
        return
      }
      setDone(result)
    } catch (error) {
      const code = (error as { code?: string }).code
      setProblem(
        code === "BOOKING_TIME_TAKEN" || code === "BOOKING_TOO_SOON"
          ? t("errors.taken")
          : code === "BOOKING_COUPON_INVALID"
            ? t("errors.coupon")
            : code === "BOOKING_GIFT_INVALID"
              ? t("errors.gift")
              : code === "BOOKING_RATE_LIMITED"
                ? t("errors.limited")
                : t("errors.generic")
      )
      if (code === "BOOKING_TIME_TAKEN" || code === "BOOKING_TOO_SOON") {
        setSlot(null)
        setDate((current) => current)
        publicBookingService
          .availability(slug, { serviceId: service.id, date, partySize: people })
          .then(setSlots)
          .catch(() => undefined)
      }
    } finally {
      setSending(false)
    }
  }

  if (done) {
    return (
      <Frame accent={page.accentColor}>
        <Business business={page} />
        <div className={cn(CARD, "p-6 text-center")}>
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-[#e7f8ee] text-[#137a41]">
            <Check className="size-7" />
          </span>
          <p className="mt-3 text-[19px] font-extrabold">
            {done.booking?.status === "pending" ? t("done.pendingTitle") : t("done.title")}
          </p>
          <p className="mt-1.5 text-[13.5px] leading-6 text-[#52607a]">
            {done.booking?.status === "pending" ? t("done.pendingHint") : t("done.hint")}
          </p>
        </div>
        {done.booking ? <Summary booking={done.booking} /> : null}
        {done.token ? (
          <Link href={ROUTES.publicBookingManage(done.token)} className={BUTTON}>
            {t("done.manage")}
          </Link>
        ) : null}
        <Link
          href={ROUTES.publicBookingAccount(slug)}
          className="flex h-12 w-full items-center justify-center rounded-[12px] border border-[#e1e7f0] bg-white text-[15px] font-bold"
        >
          {t("done.account")}
        </Link>
      </Frame>
    )
  }

  const ready = Boolean(
    slot && name.trim().length >= 2 && phone.replace(/\D/g, "").length >= 8 && !codeProblem
  )
  const chosenOption = service?.options.find((entry) => entry.id === optionId) ?? null

  // Before a service is chosen the page is the business's shop front.
  if (!service) {
    return (
      <Storefront
        page={page}
        slug={slug}
        account={account}
        onPick={(entry) => {
          setServiceId(entry.id)
          setProviderId(ANYONE)
          setPeople(1)
          setOptionId(entry.options[0]?.id ?? null)
          setAddonIds([])
          window.scrollTo({ top: 0 })
        }}
      />
    )
  }

  return (
    <Frame accent={page.accentColor}>
      <Business business={page} />
      <div className={cn(CARD, "flex items-center gap-3 p-4")}>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold">{service.name}</p>
          <p className="text-[12.5px] text-[#52607a]">
            {format.duration(
              quote?.durationMinutes ?? chosenOption?.durationMinutes ?? service.durationMinutes
            )}
            {" · "}
            {format.money(quote?.subtotal ?? chosenOption?.price ?? service.price)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setServiceId(null)}
          className="h-10 shrink-0 rounded-[10px] border border-[#e1e7f0] px-3 text-[13px] font-semibold text-[var(--bk-accent)]"
        >
          {t("change")}
        </button>
      </div>

      {service.options.length > 0 ? (
        <div className={cn(CARD, "p-4")}>
          <p className="text-[14px] font-extrabold">{t("chooseOption")}</p>
          <div className="mt-2.5 space-y-2">
            {service.options.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={optionId === option.id}
                onClick={() => setOptionId(option.id)}
                className={cn(
                  "flex min-h-12 w-full items-center justify-between gap-3 rounded-[12px] border px-4 py-2 text-start transition",
                  optionId === option.id
                    ? "border-[var(--bk-accent)] bg-[#f5f3ff]"
                    : "border-[#e1e7f0] bg-white"
                )}
              >
                <span>
                  <span className="block text-[14px] font-bold">{option.name}</span>
                  <span className="block text-[12.5px] text-[#52607a]">
                    {format.duration(option.durationMinutes)}
                  </span>
                </span>
                <span className="shrink-0 text-[14px] font-extrabold text-[var(--bk-accent)]">
                  {format.money(option.price)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {service.addons.length > 0 ? (
        <div className={cn(CARD, "p-4")}>
          <p className="text-[14px] font-extrabold">{t("chooseAddons")}</p>
          <div className="mt-2.5 space-y-2">
            {service.addons.map((addon) => {
              const on = addonIds.includes(addon.id)
              return (
                <button
                  key={addon.id}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() =>
                    setAddonIds(
                      on ? addonIds.filter((id) => id !== addon.id) : [...addonIds, addon.id]
                    )
                  }
                  className={cn(
                    "flex min-h-12 w-full items-center gap-3 rounded-[12px] border px-4 py-2 text-start transition",
                    on ? "border-[var(--bk-accent)] bg-[#f5f3ff]" : "border-[#e1e7f0] bg-white"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-[6px] border",
                      on
                        ? "border-[var(--bk-accent)] bg-[var(--bk-accent)] text-white"
                        : "border-[#c4cddb]"
                    )}
                  >
                    {on ? <Check className="size-3.5" /> : null}
                  </span>
                  <span className="min-w-0 flex-1 text-[14px] font-semibold">{addon.name}</span>
                  <span className="shrink-0 text-[13.5px] font-bold text-[var(--bk-accent)]">
                    +{format.money(addon.price)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {able.length > 1 ? (
        <div className={cn(CARD, "p-4")}>
          <p className="text-[14px] font-extrabold">{t("chooseProvider")}</p>
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {[
              { id: ANYONE, name: t("anyProvider"), title: t("anyProviderHint"), imageUrl: null },
              ...able,
            ].map((entry) => {
              const picked = providerId === entry.id
              return (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={picked}
                  onClick={() => setProviderId(entry.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-[16px] border p-3 text-start transition",
                    picked
                      ? "border-[var(--bk-accent)] bg-[color-mix(in_srgb,var(--bk-accent)_8%,white)]"
                      : "border-[#e1e7f0] bg-white hover:border-[#c4cddb]"
                  )}
                >
                  <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--bk-accent)_14%,white)] text-[16px] font-extrabold text-[var(--bk-accent)]">
                    {entry.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- the provider's own uploaded picture
                      <img src={entry.imageUrl} alt="" className="size-full object-cover" />
                    ) : entry.id === ANYONE ? (
                      <Users className="size-5" />
                    ) : (
                      entry.name.trim().charAt(0)
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-extrabold text-[#0b1738]">
                      {entry.name}
                    </span>
                    {entry.title ? (
                      <span className="block truncate text-[12.5px] text-[#6b7b96]">
                        {entry.title}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border",
                      picked
                        ? "border-[var(--bk-accent)] bg-[var(--bk-accent)] text-white"
                        : "border-[#c4cddb]"
                    )}
                  >
                    {picked ? <Check className="size-3.5" /> : null}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {service.capacity > 1 ? (
        <div className={cn(CARD, "flex items-center justify-between gap-3 p-4")}>
          <p className="text-[14px] font-extrabold">{t("people")}</p>
          <div className="flex items-center gap-3" dir="ltr">
            <button
              type="button"
              aria-label={t("fewer")}
              disabled={people <= 1}
              onClick={() => setPeople(people - 1)}
              className="size-11 rounded-full border border-[#e1e7f0] text-[18px] font-bold disabled:opacity-40"
            >
              −
            </button>
            <span className="w-6 text-center text-[16px] font-extrabold">{people}</span>
            <button
              type="button"
              aria-label={t("more")}
              disabled={people >= service.capacity}
              onClick={() => setPeople(people + 1)}
              className="size-11 rounded-full border border-[#e1e7f0] text-[18px] font-bold disabled:opacity-40"
            >
              +
            </button>
          </div>
        </div>
      ) : null}

      <div className={cn(CARD, "p-4")}>
        <p className="text-[14px] font-extrabold">{t("chooseDay")}</p>
        <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1">
          {days.map((entry) => (
            <button
              key={entry}
              type="button"
              aria-pressed={date === entry}
              onClick={() => setDate(entry)}
              className={cn(
                "flex h-[66px] w-[62px] shrink-0 flex-col items-center justify-center rounded-[14px] border text-center transition",
                date === entry
                  ? "border-[var(--bk-accent)] bg-[var(--bk-accent)] text-white"
                  : "border-[#e1e7f0] bg-white text-[#0b1738]"
              )}
            >
              <span className="text-[11.5px] opacity-80">
                {format.weekday(new Date(`${entry}T00:00:00Z`).getUTCDay(), "short")}
              </span>
              <span className="text-[17px] font-extrabold">{Number(entry.slice(8))}</span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[13px] font-semibold text-[#52607a]">{format.day(date)}</p>
        {slots === null ? (
          <p className="flex items-center gap-2 py-5 text-[13.5px] text-[#6b7b96]">
            <Loader2 className="size-4 animate-spin" />
            {t("loadingTimes")}
          </p>
        ) : slots.length === 0 ? (
          <div className="mt-2 rounded-[12px] bg-[#f7f9fc] px-3 py-4 text-center">
            <p className="text-[13.5px] text-[#52607a]">{t("noTimes")}</p>
            {waiting === "done" ? (
              <p className="mt-3 text-[13.5px] font-bold text-[#137a41]">{t("wait.done")}</p>
            ) : waiting === "closed" ? (
              <button
                type="button"
                className="mt-2 min-h-11 text-[13.5px] font-bold text-[var(--bk-accent)]"
                onClick={() => setWaiting("open")}
              >
                {t("wait.offer")}
              </button>
            ) : (
              <form
                className="mt-3 space-y-2 text-start"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (name.trim().length < 2 || phone.replace(/\D/g, "").length < 8) return
                  setWaiting("sending")
                  publicBookingService
                    .joinWaitlist(slug, {
                      serviceId: service.id,
                      providerId: providerId === ANYONE ? null : providerId,
                      customerName: name.trim(),
                      customerPhone: phone.trim(),
                      preferredDate: date,
                      website: website || undefined,
                      accountToken: accountMemory.read(slug),
                    })
                    .then((joined) => {
                      accountMemory.keep(slug, joined.accountToken)
                      setWaiting("done")
                    })
                    .catch(() => setWaiting("open"))
                }}
              >
                <p className="text-[13px] leading-6 text-[#52607a]">{t("wait.hint")}</p>
                <input
                  className={INPUT}
                  aria-label={t("name")}
                  placeholder={t("name")}
                  autoComplete="name"
                  maxLength={120}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
                <input
                  className={INPUT}
                  dir="ltr"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  aria-label={t("phone")}
                  placeholder="05xxxxxxxx"
                  maxLength={30}
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
                <button type="submit" className={BUTTON} disabled={waiting === "sending"}>
                  {waiting === "sending" ? <Loader2 className="size-4 animate-spin" /> : null}
                  {t("wait.join")}
                </button>
              </form>
            )}
          </div>
        ) : (
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((entry) => (
              <button
                key={entry.startsAt}
                type="button"
                aria-pressed={slot?.startsAt === entry.startsAt}
                onClick={() => setSlot(entry)}
                className={cn(
                  "h-12 rounded-[12px] border text-[14px] font-bold transition",
                  slot?.startsAt === entry.startsAt
                    ? "border-[var(--bk-accent)] bg-[var(--bk-accent)] text-white"
                    : "border-[#e1e7f0] bg-white text-[#0b1738]"
                )}
              >
                {format.time(entry.startsAt)}
              </button>
            ))}
          </div>
        )}
      </div>

      {slot ? (
        <form
          className={cn(CARD, "space-y-3 p-4")}
          onSubmit={(event) => {
            event.preventDefault()
            if (ready) void send()
          }}
        >
          <p className="text-[14px] font-extrabold">{t("yourDetails")}</p>
          <div>
            <label
              className="mb-1.5 block text-[13px] font-semibold text-[#344054]"
              htmlFor="public-name"
            >
              {t("name")}
            </label>
            <input
              id="public-name"
              className={INPUT}
              autoComplete="name"
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div>
            <label
              className="mb-1.5 block text-[13px] font-semibold text-[#344054]"
              htmlFor="public-phone"
            >
              {t("phone")}
            </label>
            <input
              id="public-phone"
              className={INPUT}
              dir="ltr"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={30}
              placeholder="05xxxxxxxx"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>
          <div>
            <label
              className="mb-1.5 block text-[13px] font-semibold text-[#344054]"
              htmlFor="public-notes"
            >
              {t("notes")}
            </label>
            <textarea
              id="public-notes"
              rows={2}
              maxLength={500}
              className={cn(INPUT, "h-auto py-2.5")}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          {/* A field people never see or fill in; a filled one marks an automated sender. */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="hidden"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
          />
          {codesOpen ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  className="mb-1.5 block text-[13px] font-semibold text-[#344054]"
                  htmlFor="public-coupon"
                >
                  {t("coupon")}
                </label>
                <input
                  id="public-coupon"
                  className={INPUT}
                  dir="ltr"
                  maxLength={40}
                  autoCapitalize="characters"
                  value={couponCode}
                  onChange={(event) => setCouponCode(event.target.value)}
                />
              </div>
              <div>
                <label
                  className="mb-1.5 block text-[13px] font-semibold text-[#344054]"
                  htmlFor="public-gift"
                >
                  {t("giftCard")}
                </label>
                <input
                  id="public-gift"
                  className={INPUT}
                  dir="ltr"
                  maxLength={40}
                  autoCapitalize="characters"
                  value={giftCode}
                  onChange={(event) => setGiftCode(event.target.value)}
                />
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="min-h-11 text-[13px] font-bold text-[var(--bk-accent)]"
              onClick={() => setCodesOpen(true)}
            >
              {t("haveCode")}
            </button>
          )}
          {codeProblem ? (
            <p
              role="alert"
              className="rounded-[12px] bg-[#fef3f2] px-3 py-2.5 text-[13.5px] text-[#b42318]"
            >
              {codeProblem}
            </p>
          ) : null}
          <div className="rounded-[12px] bg-[#f5f3ff] px-3 py-2.5 text-[#5b21b6]">
            <p className="text-[13.5px] font-semibold">
              {t("confirmLine", {
                service: service.name + (chosenOption ? ` - ${chosenOption.name}` : ""),
                day: format.day(date),
                time: format.time(slot.startsAt),
              })}
            </p>
            {quote ? (
              <dl className="mt-2 space-y-1 border-t border-[#ddd6fe] pt-2 text-[13px]">
                {quote.subtotal !== quote.total ? (
                  <>
                    <div className="flex justify-between">
                      <dt>{t("price.before")}</dt>
                      <dd>{format.money(quote.subtotal)}</dd>
                    </div>
                    {quote.discount > 0 ? (
                      <div className="flex justify-between">
                        <dt>{t("price.coupon")}</dt>
                        <dd>−{format.money(quote.discount)}</dd>
                      </div>
                    ) : null}
                    {quote.giftAmount > 0 ? (
                      <div className="flex justify-between">
                        <dt>{t("price.gift")}</dt>
                        <dd>−{format.money(quote.giftAmount)}</dd>
                      </div>
                    ) : null}
                  </>
                ) : null}
                <div className="flex justify-between text-[15px] font-extrabold">
                  <dt>{t("price.total")}</dt>
                  <dd>{format.money(quote.total)}</dd>
                </div>
              </dl>
            ) : null}
          </div>
          {problem ? (
            <p
              role="alert"
              className="rounded-[12px] bg-[#fef3f2] px-3 py-2.5 text-[13.5px] text-[#b42318]"
            >
              {problem}
            </p>
          ) : null}
          <button type="submit" className={BUTTON} disabled={!ready || sending}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("book")}
          </button>
          {page.cancellationAllowed ? (
            <p className="text-center text-[12px] leading-5 text-[#6b7b96]">{t("cancelNote")}</p>
          ) : null}
        </form>
      ) : null}
    </Frame>
  )
}

export function PublicBookingManageView({ token }: { token: string }) {
  const t = useTranslations("booking.public")
  const format = useBookingFormat()
  const [booking, setBooking] = useState<PublicBooking | null>(null)
  const [missing, setMissing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const payForm = useRef<HTMLDivElement>(null)
  const [paying, setPaying] = useState<"idle" | "checking" | "paid" | "refunded" | "failed">("idle")
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState("")
  const [reviewed, setReviewed] = useState(false)

  useEffect(() => {
    publicBookingService
      .booking(token)
      .then((found) => {
        setBooking(found)
        setRating(found.review?.rating ?? 0)
        setComment(found.review?.comment ?? "")
      })
      .catch(() => setMissing(true))
  }, [token])

  // Back from Moyasar's form: the address carries the payment's id, which the server checks.
  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    const paymentId = query.get("id")
    if (!paymentId) return
    window.history.replaceState(null, "", window.location.pathname)
    if (query.get("status") && query.get("status") !== "paid") {
      setPaying("failed")
      return
    }
    setPaying("checking")
    publicBookingService
      .confirmPayment(token, paymentId)
      .then((result) => {
        setBooking(result.booking)
        setPaying(result.outcome)
      })
      .catch(() => setPaying("failed"))
  }, [token])

  // The payment form, while something is still due.
  const due = booking?.payment ?? null
  const dueKey = due ? `${due.bookingId}:${due.amount}` : ""
  useEffect(() => {
    if (!due || !payForm.current || paying === "checking") return
    const callback = `${window.location.origin}${window.location.pathname}`
    showMoyasarForm({
      element: payForm.current,
      publishable_api_key: due.publishableKey,
      amount: Math.round(due.amount * 100),
      currency: "SAR",
      description: `${booking?.business.name ?? ""} - ${booking?.serviceName ?? ""}`.slice(0, 200),
      callback_url: callback,
      metadata: { booking_id: due.bookingId },
      on_failure: () => setPaying("failed"),
    }).catch(() => setPaying("failed"))
    return removeMoyasarForm
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redrawn only when what is due changes
  }, [dueKey, paying === "checking"])

  if (missing) return <Message title={t("manage.missingTitle")} hint={t("manage.missingHint")} />
  if (!booking) {
    return (
      <Frame>
        <p className="flex items-center justify-center gap-2 py-24 text-[14px] text-[#6b7b96]">
          <Loader2 className="size-4 animate-spin" />
          {t("loading")}
        </p>
      </Frame>
    )
  }

  const cancel = async () => {
    setBusy(true)
    setProblem(null)
    try {
      setBooking(await publicBookingService.cancel(token))
      setConfirming(false)
    } catch {
      setProblem(t("manage.cancelFailed"))
    } finally {
      setBusy(false)
    }
  }
  const open = booking.status === "pending" || booking.status === "confirmed"

  return (
    <Frame accent={booking.business.accentColor}>
      <Business business={booking.business} />
      {booking.business.slug ? (
        <Link
          href={ROUTES.publicBookingAccount(booking.business.slug)}
          className="flex h-11 w-full items-center justify-center rounded-[12px] border border-[#e1e7f0] bg-white text-[14px] font-bold"
        >
          {t("allMine")}
        </Link>
      ) : null}
      <p className="px-1 text-[14px] font-semibold text-[#52607a]">
        {t("manage.greeting", { name: booking.customerName })}
      </p>
      <Summary booking={booking} />
      {paying === "checking" ? (
        <p className="flex items-center justify-center gap-2 py-4 text-[14px] text-[#52607a]">
          <Loader2 className="size-4 animate-spin" />
          {t("pay.checking")}
        </p>
      ) : null}
      {paying === "paid" ? (
        <p className="rounded-[12px] bg-[#e7f8ee] px-3 py-3 text-center text-[14px] font-bold text-[#137a41]">
          {t("pay.paid")}
        </p>
      ) : null}
      {paying === "refunded" ? (
        <p className="rounded-[12px] bg-[#fff7e6] px-3 py-3 text-center text-[13.5px] leading-6 font-semibold text-[#93370d]">
          {t("pay.refunded")}
        </p>
      ) : null}
      {paying === "failed" ? (
        <p
          role="alert"
          className="rounded-[12px] bg-[#fef3f2] px-3 py-3 text-center text-[13.5px] text-[#b42318]"
        >
          {t("pay.failed")}
        </p>
      ) : null}
      {due && paying !== "checking" ? (
        <div className={cn(CARD, "space-y-3 p-4")}>
          <p className="text-[15px] font-extrabold">
            {due.full ? t("pay.titleFull") : t("pay.titleDeposit")}
          </p>
          <p className="text-[13.5px] leading-6 text-[#52607a]">
            {t("pay.amount", { amount: format.money(due.amount) })}
            {due.expiresAt ? ` ${t("pay.until", { time: format.time(due.expiresAt) })}` : ""}
          </p>
          <div ref={payForm} dir="ltr" />
          <p className="text-center text-[12px] leading-5 text-[#6b7b96]">{t("pay.secure")}</p>
        </div>
      ) : null}
      {!due && booking.paidOnline > 0 ? (
        <p className="px-1 text-[13px] text-[#137a41]">
          {t("pay.received", { amount: format.money(booking.paidOnline) })}
        </p>
      ) : null}
      {problem ? (
        <p
          role="alert"
          className="rounded-[12px] bg-[#fef3f2] px-3 py-2.5 text-[13.5px] text-[#b42318]"
        >
          {problem}
        </p>
      ) : null}
      {booking.canReview ? (
        <div className={cn(CARD, "space-y-3 p-4")}>
          <p className="text-[14.5px] font-extrabold">
            {booking.review ? t("review.yours") : t("review.title")}
          </p>
          <div className="flex justify-center gap-1.5" dir="ltr">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                aria-label={t("review.stars", { count: value })}
                aria-pressed={rating === value}
                onClick={() => {
                  setRating(value)
                  setReviewed(false)
                }}
                className="flex size-12 items-center justify-center"
              >
                <Star
                  className={cn(
                    "size-9",
                    value <= rating ? "fill-[#f59e0b] text-[#f59e0b]" : "text-[#d5dce8]"
                  )}
                />
              </button>
            ))}
          </div>
          <textarea
            rows={3}
            maxLength={600}
            aria-label={t("review.comment")}
            placeholder={t("review.comment")}
            className={cn(INPUT, "h-auto py-2.5")}
            value={comment}
            onChange={(event) => {
              setComment(event.target.value)
              setReviewed(false)
            }}
          />
          <button
            type="button"
            className={BUTTON}
            disabled={busy || rating === 0 || reviewed}
            onClick={() => {
              setBusy(true)
              setProblem(null)
              publicBookingService
                .review(token, { rating, comment: comment.trim() || null })
                .then((saved) => {
                  setBooking(saved)
                  setReviewed(true)
                })
                .catch(() => setProblem(t("review.failed")))
                .finally(() => setBusy(false))
            }}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {reviewed ? t("review.thanks") : t("review.send")}
          </button>
        </div>
      ) : null}
      {booking.canCancel ? (
        confirming ? (
          <div className={cn(CARD, "space-y-3 p-4")}>
            <p className="text-[14.5px] font-extrabold">{t("manage.confirmTitle")}</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void cancel()}
                className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-[12px] bg-[#d92d20] text-[14.5px] font-bold text-white disabled:opacity-60"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {t("manage.confirmCancel")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(false)}
                className="h-12 flex-1 rounded-[12px] border border-[#e1e7f0] bg-white text-[14.5px] font-semibold"
              >
                {t("manage.keep")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="h-12 w-full rounded-[12px] border border-[#fecdca] bg-white text-[14.5px] font-bold text-[#b42318]"
            >
              {t("manage.cancel")}
            </button>
            <p className="text-center text-[12px] leading-5 text-[#6b7b96]">
              {t("manage.until", {
                day: format.day(dayOf(booking.cancelDeadline)),
                time: format.time(booking.cancelDeadline),
              })}
            </p>
          </>
        )
      ) : open ? (
        <p className="rounded-[12px] bg-[#f7f9fc] px-3 py-3 text-center text-[13.5px] leading-6 text-[#52607a]">
          {t("manage.closed")}
        </p>
      ) : null}
      {booking.business.slug ? (
        <Link
          href={ROUTES.publicBookingPage(booking.business.slug)}
          className="block text-center text-[13.5px] font-bold text-[var(--bk-accent)]"
        >
          {t("manage.bookAgain")}
        </Link>
      ) : null}
    </Frame>
  )
}

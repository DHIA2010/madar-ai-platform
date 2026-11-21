"use client"

// The customer's own account on a business's page: what they were told, the bookings still to
// come, their place on the waiting list, and the visits behind them. Opened from the browser the
// bookings were made on -- that browser keeps the account's secret.

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import {
  Bell,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  ChevronLeft,
  CircleCheck,
  Hourglass,
  Loader2,
  LogOut,
  Smartphone,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { dayOf, useBookingFormat } from "../hooks/use-booking"
import { accountMemory } from "../services/account-memory"
import { publicBookingService } from "../services/booking.service"
import type {
  AccountNoticeKind,
  PublicAccount,
  PublicAccountBooking,
  PublicBookingPage,
} from "../types/booking.types"
import { AccountSignIn } from "./account-sign-in"
import { DEFAULT_ACCENT } from "./storefront"
import { STATUS_TINT } from "./styles"

import { cairo } from "@/components/design/fonts"
import { type Locale, localeDirection } from "@/i18n/locales"

const CARD =
  "rounded-[18px] border border-[#e4e9f2] bg-white shadow-[0_1px_3px_rgba(11,23,56,0.05)]"
// How often the account looks for news while it is open.
const REFRESH_MS = 30_000

const NOTICE_LOOK: Record<AccountNoticeKind, { icon: typeof Bell; tone: string }> = {
  confirmed: { icon: CircleCheck, tone: "bg-[#e7f8ee] text-[#137a41]" },
  cancelled: { icon: CalendarX, tone: "bg-[#fef3f2] text-[#b42318]" },
  rescheduled: { icon: CalendarClock, tone: "bg-[#eef4ff] text-[#1d4fd8]" },
  completed: { icon: CalendarCheck, tone: "bg-[#f1f4f9] text-[#344054]" },
  waitlist_booked: { icon: CircleCheck, tone: "bg-[#e7f8ee] text-[#137a41]" },
  waitlist_removed: { icon: Hourglass, tone: "bg-[#fff7e6] text-[#b54708]" },
}

function BookingRow({ booking }: { booking: PublicAccountBooking }) {
  const t = useTranslations("booking.account")
  const status = useTranslations("booking.status")
  const format = useBookingFormat()
  return (
    <Link
      href={ROUTES.publicBookingManage(booking.token)}
      className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-[#fafbfd]"
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-extrabold">{booking.serviceName}</span>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11.5px] font-bold",
              STATUS_TINT[booking.status]
            )}
          >
            {status(booking.status)}
          </span>
        </span>
        <span className="mt-0.5 block text-[13px] text-[#52607a]">
          {format.day(dayOf(booking.startsAt))} · {format.time(booking.startsAt)} ·{" "}
          {booking.providerName}
        </span>
        {booking.needsPayment ? (
          <span className="mt-1 inline-block rounded-full bg-[#fff7e6] px-2.5 py-0.5 text-[12px] font-bold text-[#b54708]">
            {t("needsPayment")}
          </span>
        ) : booking.canReview ? (
          <span className="mt-1 inline-block rounded-full bg-[#f5f3ff] px-2.5 py-0.5 text-[12px] font-bold text-[#6d28d9]">
            {t("canReview")}
          </span>
        ) : null}
      </span>
      <ChevronLeft className="size-4 shrink-0 text-[#98a2b3] ltr:rotate-180" />
    </Link>
  )
}

export function PublicBookingAccountView({ slug }: { slug: string }) {
  const t = useTranslations("booking.account")
  const locale = useLocale() as Locale
  const format = useBookingFormat()
  const [page, setPage] = useState<PublicBookingPage | null>(null)
  const [account, setAccount] = useState<PublicAccount | null>(null)
  // loading, then: ready (an account is shown), none (this browser has no account), closed.
  const [state, setState] = useState<"loading" | "ready" | "none" | "closed">("loading")
  // Whether the page can send a sign-in code on WhatsApp, and whether its form is open.
  const [signInOffered, setSignInOffered] = useState(false)
  const [signingIn, setSigningIn] = useState(false)

  const load = useCallback(async () => {
    const token = accountMemory.read(slug)
    if (!token) {
      setState("none")
      return
    }
    try {
      const found = await publicBookingService.account(slug, token)
      setAccount(found)
      setState("ready")
      if (found.unread > 0) void publicBookingService.markAccountRead(slug, token).catch(() => {})
    } catch (error) {
      // The account is gone on the server: this browser lets go of it.
      if ((error as { code?: string }).code === "BOOKING_NOT_FOUND") accountMemory.forget(slug)
      setState((current) => (current === "ready" ? "ready" : "none"))
    }
  }, [slug])

  useEffect(() => {
    publicBookingService
      .page(slug)
      .then(setPage)
      .catch(() => setState("closed"))
    publicBookingService
      .signInOffered(slug)
      .then((answer) => setSignInOffered(answer.offered))
      .catch(() => {})
    // Asked for a moment after the page is up, then again every so often for news.
    const first = setTimeout(() => void load(), 0)
    const timer = setInterval(() => void load(), REFRESH_MS)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [slug, load])

  const noticeText = (
    kind: AccountNoticeKind,
    params: PublicAccount["notices"][number]["params"]
  ) =>
    t(`notices.${kind}`, {
      service: params.serviceName ?? "",
      when: params.startsAt
        ? `${format.day(dayOf(params.startsAt))} ${format.time(params.startsAt)}`
        : params.date
          ? format.day(params.date)
          : "",
    })

  return (
    <div
      dir={localeDirection(locale)}
      style={{ "--bk-accent": page?.accentColor ?? DEFAULT_ACCENT } as React.CSSProperties}
      className={cn(cairo.className, "min-h-dvh bg-[#f6f7fb] px-4 py-6 text-[#0b1738]")}
    >
      <div className="mx-auto w-full max-w-[640px] space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[22px] font-black">{t("title")}</h1>
            {page ? <p className="truncate text-[13.5px] text-[#52607a]">{page.name}</p> : null}
          </div>
          <Link
            href={ROUTES.publicBookingPage(slug)}
            className="inline-flex h-11 shrink-0 items-center rounded-full bg-[var(--bk-accent)] px-5 text-[14px] font-bold text-white"
          >
            {t("bookAnother")}
          </Link>
        </div>

        {state === "loading" ? (
          <p className="flex items-center justify-center gap-2 py-24 text-[14px] text-[#6b7b96]">
            <Loader2 className="size-4 animate-spin" />
            {t("loading")}
          </p>
        ) : state === "closed" ? (
          <div className={cn(CARD, "px-6 py-14 text-center")}>
            <p className="text-[16px] font-extrabold">{t("closed")}</p>
          </div>
        ) : state === "none" || !account ? (
          <div className={cn(CARD, "px-6 py-12 text-center")}>
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-[#f1f4f9] text-[#52607a]">
              <CalendarCheck className="size-7" />
            </span>
            <p className="mt-3 text-[17px] font-extrabold">
              {signInOffered ? t("signIn.title") : t("noneTitle")}
            </p>
            <p className="mx-auto mt-1.5 max-w-[420px] text-[13.5px] leading-7 text-[#52607a]">
              {signInOffered ? t("signIn.hint") : t("noneHint")}
            </p>
            {signInOffered ? (
              <div className="mt-5">
                <AccountSignIn slug={slug} onSignedIn={() => void load()} />
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <div className={cn(CARD, "flex items-center gap-3 p-4")}>
              <span className="flex size-12 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--bk-accent)_12%,white)] text-[18px] font-black text-[var(--bk-accent)]">
                {account.name.trim().charAt(0)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[16px] font-extrabold">{account.name}</span>
                {account.phone ? (
                  <span dir="ltr" className="block text-start text-[13px] text-[#52607a]">
                    {account.phone}
                  </span>
                ) : null}
              </span>
            </div>

            {signInOffered && !account.verified ? (
              <div className={cn(CARD, "p-4")}>
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#e7f8ee] text-[#137a41]">
                    <Smartphone className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-extrabold">
                      {t("signIn.confirmTitle")}
                    </span>
                    <span className="block text-[13px] leading-6 text-[#52607a]">
                      {t("signIn.confirmHint")}
                    </span>
                  </span>
                </div>
                <div className="mt-3">
                  {signingIn ? (
                    <AccountSignIn
                      slug={slug}
                      phone={account.phone}
                      onSignedIn={() => {
                        setSigningIn(false)
                        void load()
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSigningIn(true)}
                      className="inline-flex h-11 w-full items-center justify-center rounded-full border border-[var(--bk-accent)] px-5 text-[14px] font-bold text-[var(--bk-accent)]"
                    >
                      {t("signIn.confirmButton")}
                    </button>
                  )}
                </div>
              </div>
            ) : null}

            {account.notices.length > 0 ? (
              <section className={cn(CARD, "overflow-hidden")}>
                <h2 className="flex items-center gap-2 px-4 pt-4 text-[15px] font-extrabold">
                  <Bell className="size-4" />
                  {t("noticesTitle")}
                </h2>
                <ul className="mt-2 divide-y divide-[#eef1f6]">
                  {account.notices.slice(0, 8).map((notice) => {
                    const look = NOTICE_LOOK[notice.kind] ?? NOTICE_LOOK.completed
                    const Icon = look.icon
                    return (
                      <li
                        key={notice.id}
                        className={cn(
                          "flex items-start gap-3 px-4 py-3",
                          notice.read ? "" : "bg-[#fffdf5]"
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-9 shrink-0 items-center justify-center rounded-full",
                            look.tone
                          )}
                        >
                          <Icon className="size-4.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] leading-6 font-semibold">
                            {noticeText(notice.kind, notice.params)}
                          </span>
                          <span className="block text-[12px] text-[#6b7b96]">
                            {format.day(dayOf(notice.createdAt), "short")} ·{" "}
                            {format.time(notice.createdAt)}
                          </span>
                        </span>
                        {notice.read ? null : (
                          <span className="mt-2 size-2 shrink-0 rounded-full bg-[#e11d48]" />
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            ) : null}

            <section className={cn(CARD, "overflow-hidden")}>
              <h2 className="px-4 pt-4 text-[15px] font-extrabold">{t("upcoming")}</h2>
              {account.upcoming.length === 0 ? (
                <p className="px-4 py-8 text-center text-[13.5px] text-[#6b7b96]">
                  {t("upcomingEmpty")}
                </p>
              ) : (
                <div className="mt-2 divide-y divide-[#eef1f6]">
                  {account.upcoming.map((booking) => (
                    <BookingRow key={booking.token} booking={booking} />
                  ))}
                </div>
              )}
            </section>

            {account.waitlist.length > 0 ? (
              <section className={cn(CARD, "overflow-hidden")}>
                <h2 className="px-4 pt-4 text-[15px] font-extrabold">{t("waitlist")}</h2>
                <ul className="mt-2 divide-y divide-[#eef1f6]">
                  {account.waitlist.map((entry) => (
                    <li key={entry.id} className="flex items-center gap-3 px-4 py-3.5">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-extrabold">
                          {entry.serviceName}
                        </span>
                        <span className="block text-[13px] text-[#52607a]">
                          {format.day(entry.preferredDate)}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[12px] font-bold",
                          entry.status === "waiting"
                            ? "bg-[#fff7e6] text-[#b54708]"
                            : entry.status === "booked"
                              ? "bg-[#e7f8ee] text-[#137a41]"
                              : "bg-[#f1f4f9] text-[#667085]"
                        )}
                      >
                        {t(`waitStatus.${entry.status}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {account.past.length > 0 ? (
              <section className={cn(CARD, "overflow-hidden")}>
                <h2 className="px-4 pt-4 text-[15px] font-extrabold">{t("past")}</h2>
                <div className="mt-2 divide-y divide-[#eef1f6]">
                  {account.past.map((booking) => (
                    <BookingRow key={booking.token} booking={booking} />
                  ))}
                </div>
              </section>
            ) : null}

            <p className="px-2 text-center text-[12px] leading-6 text-[#98a2b3]">
              {account.verified ? t("signIn.verifiedNote") : t("deviceNote")}
            </p>
            {account.verified ? (
              <button
                type="button"
                onClick={() => {
                  accountMemory.forget(slug)
                  setAccount(null)
                  setState("none")
                }}
                className="mx-auto flex items-center gap-1.5 text-[13px] font-bold text-[#52607a] underline-offset-4 hover:underline"
              >
                <LogOut className="size-4" />
                {t("signIn.signOut")}
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

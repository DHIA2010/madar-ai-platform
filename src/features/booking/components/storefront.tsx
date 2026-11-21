"use client"

// The business's public page before a service is chosen: a small website of its own. A top bar
// with the business's logo, a wide banner (its cover picture under its own colour) with its
// name, rating and ways to reach it, then tabs: its services as wide cards with pictures, what
// it says about itself (the place, the team, where it is), and what customers said.

import { useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import {
  AtSign,
  CalendarCheck,
  CalendarDays,
  Check,
  Clock,
  Info,
  MapPin,
  MessageCircle,
  Phone,
  Scissors,
  Share2,
  Sparkles,
  Star,
  UserRound,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { useBookingFormat } from "../hooks/use-booking"
import type { PublicBookingPage } from "../types/booking.types"

import { cairo } from "@/components/design/fonts"
import { type Locale, localeDirection } from "@/i18n/locales"

export const DEFAULT_ACCENT = "#0b46b8"
const WRAP = "mx-auto w-full max-w-[1240px] px-4 sm:px-6"
const TINT = "bg-[color-mix(in_srgb,var(--bk-accent)_10%,white)]"
const ALL = "__all__"

type Service = PublicBookingPage["services"][number]

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5" dir="ltr" aria-label={`${rating}/5`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          className={cn(
            "size-4",
            value <= Math.round(rating) ? "fill-[#f59e0b] text-[#f59e0b]" : "text-[#d5dce8]"
          )}
        />
      ))}
    </span>
  )
}

// A service as a wide card: its picture at the start, what it is, its price and time, and the
// button to book it. On a phone the picture sits on top.
function ServiceCard({ service, onPick }: { service: Service; onPick: () => void }) {
  const t = useTranslations("booking.store")
  const format = useBookingFormat()
  const price =
    service.options.length > 0
      ? t("from", {
          amount: format.money(Math.min(...service.options.map((option) => option.price))),
        })
      : format.money(service.price)
  return (
    <article className="flex flex-col gap-4 rounded-[22px] border border-[#e6ebf5] bg-white p-3 shadow-[0_2px_10px_rgba(11,23,56,0.05)] transition hover:shadow-[0_14px_34px_rgba(11,23,56,0.10)] sm:flex-row sm:items-stretch sm:gap-6 sm:p-5">
      <span
        className={cn(
          "relative block aspect-[16/10] w-full shrink-0 overflow-hidden rounded-[16px] sm:aspect-[3/2] sm:w-[250px]",
          TINT
        )}
      >
        {service.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- the business's own picture, shown as-is
          <img src={service.imageUrl} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-[var(--bk-accent)]">
            <Sparkles className="size-10 opacity-60" />
          </span>
        )}
        {service.capacity > 1 ? (
          <span className="absolute start-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[11.5px] font-bold text-[#0b1738]">
            {t("group", { count: service.capacity })}
          </span>
        ) : null}
      </span>
      <div className="flex min-w-0 flex-1 flex-col px-1 pb-1 sm:px-0 sm:py-2">
        <h3 className="text-[19px] leading-8 font-black text-[#0b1738] sm:text-[21px]">
          {service.name}
        </h3>
        {service.description ? (
          <p className="mt-1 line-clamp-2 text-[14px] leading-7 text-[#5b6b85]">
            {service.description}
          </p>
        ) : null}
        <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-3 pt-4">
          <span
            className={cn(
              "rounded-full px-4 py-1.5 text-[17px] font-black text-[var(--bk-accent)]",
              TINT
            )}
          >
            {price}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#52607a]">
            <Clock className="size-4" />
            {format.duration(service.durationMinutes)}
          </span>
          <button
            type="button"
            onClick={onPick}
            className="ms-auto inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--bk-accent)] px-6 text-[14.5px] font-bold text-white transition hover:brightness-110 sm:w-auto"
          >
            <CalendarDays className="size-4" />
            {t("bookService")}
          </button>
        </div>
      </div>
    </article>
  )
}

// A phone number as WhatsApp wants it: digits only, a Saudi mobile in its international form.
function whatsappNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (/^05\d{8}$/.test(digits)) return `966${digits.slice(1)}`
  if (/^5\d{8}$/.test(digits)) return `966${digits}`
  return digits.replace(/^00/, "")
}

type Tab = "services" | "about" | "reviews"

export function Storefront({
  page,
  slug,
  onPick,
  account,
}: {
  page: PublicBookingPage
  slug: string
  onPick: (service: Service) => void
  // Who this browser is on the page, once it has booked here before.
  account: { name: string; unread: number } | null
}) {
  const t = useTranslations("booking.store")
  const locale = useLocale() as Locale
  const [category, setCategory] = useState(ALL)
  const [tab, setTab] = useState<Tab>("services")
  const [copied, setCopied] = useState(false)
  const tabsRef = useRef<HTMLDivElement>(null)
  const categories = useMemo(
    () => [
      ...new Set(page.services.map((service) => service.category).filter(Boolean) as string[]),
    ],
    [page.services]
  )
  const shown =
    category === ALL
      ? page.services
      : page.services.filter((service) => service.category === category)
  const accent = page.accentColor ?? DEFAULT_ACCENT
  const hasReviews = Boolean(page.reviews && page.reviews.count > 0)
  const dateOf = (instant: string) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(instant))

  const open = (next: Tab) => {
    setTab(next)
    tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }
  const share = async () => {
    const link = window.location.href
    try {
      if (navigator.share) {
        await navigator.share({ title: page.name, url: link })
        return
      }
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      // The share sheet was closed, or copying is not allowed here: nothing to say.
    }
  }

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: "services", label: t("tabServices"), icon: <Scissors className="size-[18px]" /> },
    { id: "about", label: t("tabAbout"), icon: <Info className="size-[18px]" /> },
    ...(hasReviews
      ? [{ id: "reviews" as const, label: t("tabReviews"), icon: <Star className="size-[18px]" /> }]
      : []),
  ]
  const PILL =
    "inline-flex h-12 items-center justify-center gap-2.5 rounded-full bg-white px-5 text-[15px] font-bold text-[#0b1738] shadow-[0_4px_14px_rgba(11,23,56,0.12)] transition hover:bg-[#f4f7fd]"
  const NAV = "rounded-full px-4 py-2 text-[14.5px] font-bold transition"

  return (
    <div
      dir={localeDirection(locale)}
      style={{ "--bk-accent": accent } as React.CSSProperties}
      className={cn(
        cairo.className,
        "min-h-dvh bg-[linear-gradient(180deg,#f3f6fc_0%,#fbfcfe_38%,#f6f8fd_100%)] text-[#0b1738]"
      )}
    >
      <header className={cn(WRAP, "flex h-[72px] items-center justify-between gap-3")}>
        <span className="flex min-w-0 items-center gap-2.5">
          {page.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- the business's own logo
            <img
              src={page.logoUrl}
              alt=""
              className="size-10 shrink-0 rounded-[12px] object-cover"
            />
          ) : (
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-[12px] text-[var(--bk-accent)]",
                TINT
              )}
            >
              <CalendarCheck className="size-5" />
            </span>
          )}
          <span className="truncate text-[17px] font-black">{page.name}</span>
        </span>
        <nav className="hidden items-center gap-1 md:flex">
          <button
            type="button"
            className={cn(NAV, TINT, "text-[var(--bk-accent)]")}
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            {t("navHome")}
          </button>
          <button
            type="button"
            className={cn(NAV, "text-[#243352] hover:bg-white")}
            onClick={() => open("services")}
          >
            {t("tabServices")}
          </button>
          <button
            type="button"
            className={cn(NAV, "text-[#243352] hover:bg-white")}
            onClick={() => open("about")}
          >
            {t("navAbout")}
          </button>
          {page.phone ? (
            <a href={`tel:${page.phone}`} className={cn(NAV, "text-[#243352] hover:bg-white")}>
              {t("navContact")}
            </a>
          ) : null}
        </nav>
        <Link
          href={ROUTES.publicBookingAccount(slug)}
          className="relative inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-white px-5 text-[14px] font-bold shadow-[0_2px_10px_rgba(11,23,56,0.07)]"
        >
          <UserRound className="size-[18px]" />
          {account ? t("myBookings") : t("myBookingsGuest")}
          {account && account.unread > 0 ? (
            <span className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#e11d48] px-1 text-[11px] font-black text-white">
              {account.unread}
            </span>
          ) : null}
        </Link>
      </header>

      <div className={WRAP}>
        <section className="relative overflow-hidden rounded-[28px] bg-[var(--bk-accent)] shadow-[0_18px_44px_rgba(11,23,56,0.16)]">
          {page.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- the business's own cover picture
            <img src={page.coverUrl} alt="" className="absolute inset-0 size-full object-cover" />
          ) : null}
          {/* The business's colour over the picture, solid where the words are and clearing
              toward the far side so the place itself shows. */}
          <div
            className={cn(
              "absolute inset-0",
              page.coverUrl
                ? "bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bk-accent)_82%,transparent),color-mix(in_srgb,var(--bk-accent)_96%,#0b1738))] sm:rtl:bg-[linear-gradient(to_left,var(--bk-accent)_0%,color-mix(in_srgb,var(--bk-accent)_88%,transparent)_38%,color-mix(in_srgb,var(--bk-accent)_18%,transparent)_72%,transparent_100%)] sm:ltr:bg-[linear-gradient(to_right,var(--bk-accent)_0%,color-mix(in_srgb,var(--bk-accent)_88%,transparent)_38%,color-mix(in_srgb,var(--bk-accent)_18%,transparent)_72%,transparent_100%)]"
                : "bg-[linear-gradient(135deg,var(--bk-accent),color-mix(in_srgb,var(--bk-accent)_60%,#0b1738))]"
            )}
          />
          <div className="relative flex flex-col gap-6 p-5 sm:p-9 lg:min-h-[330px] lg:flex-row lg:items-end lg:justify-between lg:p-11">
            <div className="flex min-w-0 flex-col gap-5 lg:justify-between lg:self-stretch">
              <div className="flex items-start gap-4 sm:gap-6">
                {page.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- the business's own logo
                  <img
                    src={page.logoUrl}
                    alt=""
                    className="size-[84px] shrink-0 rounded-[22px] object-cover shadow-[0_10px_26px_rgba(0,0,0,0.25)] sm:size-[132px] sm:rounded-[28px]"
                  />
                ) : (
                  <span className="flex size-[84px] shrink-0 items-center justify-center rounded-[22px] bg-white/15 text-white sm:size-[132px] sm:rounded-[28px]">
                    <CalendarCheck className="size-10 sm:size-14" />
                  </span>
                )}
                <div className="min-w-0 pt-1 text-white sm:pt-3">
                  <h1 className="text-[26px] leading-10 font-black sm:text-[38px] sm:leading-[54px]">
                    {page.name}
                  </h1>
                  {page.tagline ? (
                    <p className="mt-1 text-[15px] leading-7 text-white/90 sm:text-[17px]">
                      {page.tagline}
                    </p>
                  ) : null}
                  {hasReviews && page.reviews ? (
                    <button
                      type="button"
                      onClick={() => open("reviews")}
                      className="mt-2.5 inline-flex items-center gap-2.5"
                    >
                      <Stars rating={page.reviews.average ?? 0} />
                      <span className="text-[15px] font-black">
                        {page.reviews.average?.toFixed(1)}
                      </span>
                      <span className="text-[14px] text-white/85">
                        ({t("reviewCount", { count: page.reviews.count })})
                      </span>
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {page.phone ? (
                  <a href={`tel:${page.phone}`} dir="ltr" className={PILL}>
                    <Phone className="size-[18px] text-[var(--bk-accent)]" />
                    {page.phone}
                  </a>
                ) : null}
                {page.phone ? (
                  <a
                    href={`https://wa.me/${whatsappNumber(page.phone)}`}
                    target="_blank"
                    rel="noreferrer"
                    className={PILL}
                  >
                    <MessageCircle className="size-[18px] text-[#16a34a]" />
                    {t("whatsapp")}
                  </a>
                ) : null}
                <button type="button" className={PILL} onClick={() => void share()}>
                  {copied ? (
                    <Check className="size-[18px] text-[#16a34a]" />
                  ) : (
                    <Share2 className="size-[18px]" />
                  )}
                  {copied ? t("linkCopied") : t("share")}
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => open("services")}
              className="inline-flex h-14 shrink-0 items-center justify-center gap-2.5 rounded-full bg-[color-mix(in_srgb,var(--bk-accent)_78%,#0b1738)] px-8 text-[16px] font-black text-white shadow-[0_10px_26px_rgba(0,0,0,0.28)] ring-1 ring-white/25 transition hover:brightness-110"
            >
              <CalendarDays className="size-5" />
              {t("bookNow")}
            </button>
          </div>
        </section>

        <div
          ref={tabsRef}
          className="mx-0 scroll-mt-3 rounded-b-[24px] border border-t-0 border-[#e6ebf5] bg-white px-2 shadow-[0_6px_20px_rgba(11,23,56,0.05)] sm:px-8"
        >
          <div role="tablist" className="flex gap-1 overflow-x-auto sm:gap-6">
            {tabs.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tab === entry.id}
                onClick={() => setTab(entry.id)}
                className={cn(
                  "inline-flex h-[60px] shrink-0 items-center gap-2.5 border-b-[3px] px-4 text-[15.5px] font-bold transition sm:px-6",
                  tab === entry.id
                    ? "border-[var(--bk-accent)] text-[var(--bk-accent)]"
                    : "border-transparent text-[#3b4a66] hover:text-[#0b1738]"
                )}
              >
                {entry.icon}
                {entry.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === "services" ? (
        <section className={cn(WRAP, "pt-10")}>
          <h2 className="flex items-center gap-3 text-[26px] font-black sm:text-[30px]">
            <span className="h-8 w-1.5 rounded-full bg-[var(--bk-accent)]" />
            {t("services")}
          </h2>
          <p className="mt-2 text-[14.5px] text-[#5b6b85]">
            {page.tagline ?? t("serviceCount", { count: page.services.length })}
          </p>
          {categories.length > 1 ? (
            <div className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
              {[ALL, ...categories].map((entry) => (
                <button
                  key={entry}
                  type="button"
                  aria-pressed={category === entry}
                  onClick={() => setCategory(entry)}
                  className={cn(
                    "h-10 shrink-0 rounded-full border px-4 text-[13.5px] font-bold transition",
                    category === entry
                      ? "border-transparent bg-[var(--bk-accent)] text-white"
                      : "border-[#e1e7f0] bg-white text-[#344054]"
                  )}
                >
                  {entry === ALL ? t("all") : entry}
                </button>
              ))}
            </div>
          ) : null}
          {page.services.length === 0 ? (
            <p className="mt-6 rounded-[22px] border border-[#e6ebf5] bg-white px-5 py-14 text-center text-[14px] text-[#6b7b96]">
              {t("noServices")}
            </p>
          ) : (
            <div className="mx-auto mt-7 flex max-w-[1020px] flex-col gap-4">
              {shown.map((service) => (
                <ServiceCard key={service.id} service={service} onPick={() => onPick(service)} />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {tab === "about" ? (
        <section className={cn(WRAP, "pt-10")}>
          <h2 className="flex items-center gap-3 text-[26px] font-black sm:text-[30px]">
            <span className="h-8 w-1.5 rounded-full bg-[var(--bk-accent)]" />
            {t("about")}
          </h2>
          {page.description ? (
            <p className="mt-3 max-w-[820px] text-[15px] leading-8 whitespace-pre-line text-[#344054]">
              {page.description}
            </p>
          ) : null}
          {page.address || page.phone || page.instagramUrl ? (
            <div className="mt-5 flex flex-wrap gap-2.5 text-[14px] font-semibold text-[#243352]">
              {page.address ? (
                page.mapUrl ? (
                  <a
                    href={page.mapUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-[#e6ebf5] bg-white px-4 py-2.5"
                  >
                    <MapPin className="size-4 text-[var(--bk-accent)]" />
                    {page.address}
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#e6ebf5] bg-white px-4 py-2.5">
                    <MapPin className="size-4 text-[var(--bk-accent)]" />
                    {page.address}
                  </span>
                )
              ) : null}
              {page.phone ? (
                <a
                  href={`tel:${page.phone}`}
                  dir="ltr"
                  className="inline-flex items-center gap-2 rounded-full border border-[#e6ebf5] bg-white px-4 py-2.5"
                >
                  <Phone className="size-4 text-[var(--bk-accent)]" />
                  {page.phone}
                </a>
              ) : null}
              {page.instagramUrl ? (
                <a
                  href={page.instagramUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-[#e6ebf5] bg-white px-4 py-2.5"
                >
                  <AtSign className="size-4 text-[var(--bk-accent)]" />
                  {t("instagram")}
                </a>
              ) : null}
            </div>
          ) : null}
          {page.gallery.length > 0 ? (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {page.gallery.map((picture, index) => (
                <a
                  key={`${index}:${picture}`}
                  href={picture}
                  target="_blank"
                  rel="noreferrer"
                  className="block aspect-square overflow-hidden rounded-[18px] bg-[#eef1f6]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- the business's own picture */}
                  <img src={picture} alt="" loading="lazy" className="size-full object-cover" />
                </a>
              ))}
            </div>
          ) : null}
          {page.providers.length > 0 ? (
            <>
              <h3 className="mt-9 text-[20px] font-black">{t("team")}</h3>
              <div className="mt-3 flex flex-wrap gap-3">
                {page.providers.map((provider) => (
                  <div
                    key={provider.id}
                    className="flex items-center gap-3 rounded-[18px] border border-[#e6ebf5] bg-white py-2.5 ps-2.5 pe-5"
                  >
                    <span
                      className={cn(
                        "flex size-11 items-center justify-center rounded-full text-[16px] font-black text-[var(--bk-accent)]",
                        TINT
                      )}
                    >
                      {provider.name.trim().charAt(0)}
                    </span>
                    <span>
                      <span className="block text-[14px] font-bold">{provider.name}</span>
                      {provider.title ? (
                        <span className="block text-[12.5px] text-[#6b7b96]">{provider.title}</span>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
          {!page.description &&
          !page.address &&
          !page.phone &&
          page.gallery.length === 0 &&
          page.providers.length === 0 ? (
            <p className="mt-6 rounded-[22px] border border-[#e6ebf5] bg-white px-5 py-14 text-center text-[14px] text-[#6b7b96]">
              {t("aboutEmpty")}
            </p>
          ) : null}
        </section>
      ) : null}

      {tab === "reviews" && page.reviews ? (
        <section className={cn(WRAP, "pt-10")}>
          <h2 className="flex items-center gap-3 text-[26px] font-black sm:text-[30px]">
            <span className="h-8 w-1.5 rounded-full bg-[var(--bk-accent)]" />
            {t("reviews")}
          </h2>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {page.reviews.latest.map((review, index) => (
              <figure key={index} className="rounded-[20px] border border-[#e6ebf5] bg-white p-5">
                <Stars rating={review.rating} />
                {review.comment ? (
                  <blockquote className="mt-2 text-[14px] leading-7 text-[#344054]">
                    {review.comment}
                  </blockquote>
                ) : null}
                <figcaption className="mt-3 text-[12.5px] text-[#6b7b96]">
                  <span className="font-bold text-[#0b1738]">{review.customerName}</span>
                  {review.serviceName ? ` · ${review.serviceName}` : ""} ·{" "}
                  {dateOf(review.createdAt)}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ) : null}

      <footer className={cn(WRAP, "py-12 text-center text-[12px] text-[#98a2b3]")}>
        {t("poweredBy")}
      </footer>
    </div>
  )
}

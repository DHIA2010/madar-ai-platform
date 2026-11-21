"use client"

// The business's public page before a service is chosen: a shop front. A cover picture and the
// business's own colour, its services as cards with pictures (grouped by category), what it says
// about itself, pictures of the place, who works there and what customers said.

import { useMemo, useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import {
  AtSign,
  CalendarCheck,
  Clock,
  MapPin,
  Phone,
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

export const DEFAULT_ACCENT = "#6d28d9"
const WRAP = "mx-auto w-full max-w-[1120px] px-4 sm:px-6"
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
    <button
      type="button"
      onClick={onPick}
      className="group flex h-full flex-col overflow-hidden rounded-[20px] border border-[#e4e9f2] bg-white text-start shadow-[0_1px_3px_rgba(11,23,56,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(11,23,56,0.10)]"
    >
      <span className={cn("relative block aspect-[4/3] w-full overflow-hidden", TINT)}>
        {service.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- the business's own picture, shown as-is
          <img
            src={service.imageUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
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
      <span className="flex flex-1 flex-col gap-2 p-4">
        <span className="text-[16px] leading-6 font-extrabold text-[#0b1738]">{service.name}</span>
        {service.description ? (
          <span className="line-clamp-2 text-[13px] leading-6 text-[#6b7b96]">
            {service.description}
          </span>
        ) : null}
        <span className="mt-auto flex items-center justify-between gap-3 pt-2">
          <span>
            <span className="block text-[16px] font-black text-[var(--bk-accent)]">{price}</span>
            <span className="mt-0.5 inline-flex items-center gap-1 text-[12.5px] text-[#52607a]">
              <Clock className="size-3.5" />
              {format.duration(service.durationMinutes)}
            </span>
          </span>
          <span className="inline-flex h-10 shrink-0 items-center rounded-full bg-[var(--bk-accent)] px-4 text-[13.5px] font-bold text-white">
            {t("book")}
          </span>
        </span>
      </span>
    </button>
  )
}

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
  const dateOf = (instant: string) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(instant))

  return (
    <div
      dir={localeDirection(locale)}
      style={{ "--bk-accent": accent } as React.CSSProperties}
      className={cn(cairo.className, "min-h-dvh bg-[#f6f7fb] text-[#0b1738]")}
    >
      <header className="sticky top-0 z-20 border-b border-[#e4e9f2] bg-white/90 backdrop-blur">
        <div className={cn(WRAP, "flex h-14 items-center justify-between gap-3")}>
          <span className="flex min-w-0 items-center gap-2.5">
            {page.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- the business's own logo
              <img
                src={page.logoUrl}
                alt=""
                className="size-8 shrink-0 rounded-[9px] object-cover"
              />
            ) : null}
            <span className="truncate text-[15px] font-extrabold">{page.name}</span>
          </span>
          <Link
            href={ROUTES.publicBookingAccount(slug)}
            className="relative inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-[#e1e7f0] bg-white px-4 text-[13.5px] font-bold"
          >
            <UserRound className="size-4" />
            {account ? t("myBookings") : t("myBookingsGuest")}
            {account && account.unread > 0 ? (
              <span className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#e11d48] px-1 text-[11px] font-black text-white">
                {account.unread}
              </span>
            ) : null}
          </Link>
        </div>
      </header>

      <section className="relative">
        <div className="h-[180px] w-full overflow-hidden sm:h-[300px]">
          {page.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- the business's own cover picture
            <img src={page.coverUrl} alt="" className="size-full object-cover" />
          ) : (
            <div className="size-full bg-[linear-gradient(135deg,var(--bk-accent),color-mix(in_srgb,var(--bk-accent)_55%,#0b1738))]" />
          )}
        </div>
        <div className={cn(WRAP, "relative -mt-14 sm:-mt-16")}>
          <div className="rounded-[22px] border border-[#e4e9f2] bg-white p-5 shadow-[0_10px_30px_rgba(11,23,56,0.08)] sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              {page.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- the business's own logo
                <img
                  src={page.logoUrl}
                  alt=""
                  className="size-20 shrink-0 rounded-[20px] border border-[#eef1f6] object-cover sm:size-24"
                />
              ) : (
                <span
                  className={cn(
                    "flex size-20 shrink-0 items-center justify-center rounded-[20px] text-[var(--bk-accent)] sm:size-24",
                    TINT
                  )}
                >
                  <CalendarCheck className="size-10" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <h1 className="text-[24px] leading-9 font-black sm:text-[30px] sm:leading-10">
                  {page.name}
                </h1>
                {page.tagline ? (
                  <p className="mt-0.5 text-[14.5px] leading-7 text-[#52607a]">{page.tagline}</p>
                ) : null}
                {page.reviews && page.reviews.count > 0 ? (
                  <a href="#reviews" className="mt-1.5 inline-flex items-center gap-2">
                    <Stars rating={page.reviews.average ?? 0} />
                    <span className="text-[13.5px] font-bold">
                      {page.reviews.average?.toFixed(1)}
                    </span>
                    <span className="text-[12.5px] text-[#6b7b96]">
                      {t("reviewCount", { count: page.reviews.count })}
                    </span>
                  </a>
                ) : null}
              </div>
              <a
                href="#services"
                className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-[var(--bk-accent)] px-7 text-[15px] font-bold text-white"
              >
                {t("bookNow")}
              </a>
            </div>
            {page.address || page.phone || page.instagramUrl ? (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-[#eef1f6] pt-4 text-[13px] font-semibold text-[#344054]">
                {page.address ? (
                  page.mapUrl ? (
                    <a
                      href={page.mapUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#f1f4f9] px-3 py-1.5"
                    >
                      <MapPin className="size-4" />
                      {page.address}
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f1f4f9] px-3 py-1.5">
                      <MapPin className="size-4" />
                      {page.address}
                    </span>
                  )
                ) : null}
                {page.phone ? (
                  <a
                    href={`tel:${page.phone}`}
                    dir="ltr"
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#f1f4f9] px-3 py-1.5"
                  >
                    <Phone className="size-4" />
                    {page.phone}
                  </a>
                ) : null}
                {page.instagramUrl ? (
                  <a
                    href={page.instagramUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#f1f4f9] px-3 py-1.5"
                  >
                    <AtSign className="size-4" />
                    {t("instagram")}
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section id="services" className={cn(WRAP, "scroll-mt-20 pt-8")}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-[20px] font-black">{t("services")}</h2>
          <span className="text-[13px] text-[#6b7b96]">
            {t("serviceCount", { count: page.services.length })}
          </span>
        </div>
        {categories.length > 1 ? (
          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
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
          <p className="mt-4 rounded-[18px] border border-[#e4e9f2] bg-white px-5 py-14 text-center text-[14px] text-[#6b7b96]">
            {t("noServices")}
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((service) => (
              <ServiceCard key={service.id} service={service} onPick={() => onPick(service)} />
            ))}
          </div>
        )}
      </section>

      {page.description || page.gallery.length > 0 ? (
        <section className={cn(WRAP, "pt-10")}>
          <h2 className="text-[20px] font-black">{t("about")}</h2>
          {page.description ? (
            <p className="mt-2 max-w-[760px] text-[14.5px] leading-8 whitespace-pre-line text-[#344054]">
              {page.description}
            </p>
          ) : null}
          {page.gallery.length > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {page.gallery.map((picture, index) => (
                <a
                  key={`${index}:${picture}`}
                  href={picture}
                  target="_blank"
                  rel="noreferrer"
                  className="block aspect-square overflow-hidden rounded-[16px] bg-[#eef1f6]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- the business's own picture */}
                  <img src={picture} alt="" loading="lazy" className="size-full object-cover" />
                </a>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {page.providers.length > 0 ? (
        <section className={cn(WRAP, "pt-10")}>
          <h2 className="text-[20px] font-black">{t("team")}</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            {page.providers.map((provider) => (
              <div
                key={provider.id}
                className="flex items-center gap-3 rounded-[16px] border border-[#e4e9f2] bg-white py-2.5 ps-2.5 pe-5"
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
        </section>
      ) : null}

      {page.reviews && page.reviews.latest.length > 0 ? (
        <section id="reviews" className={cn(WRAP, "scroll-mt-20 pt-10")}>
          <h2 className="text-[20px] font-black">{t("reviews")}</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {page.reviews.latest.map((review, index) => (
              <figure key={index} className="rounded-[18px] border border-[#e4e9f2] bg-white p-4">
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

      <footer className={cn(WRAP, "py-10 text-center text-[12px] text-[#98a2b3]")}>
        {t("poweredBy")}
      </footer>
    </div>
  )
}

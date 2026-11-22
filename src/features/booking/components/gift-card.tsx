"use client"

// A gift card the way the person it is for sees it: the card itself (who it is from, the message
// and the amount), the page it opens on from the link they are sent, and the box the business
// sends that link from -- over WhatsApp, to the person's own number.

import { useEffect, useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { CalendarCheck, Copy, ExternalLink, Gift, Loader2, MessageCircle } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppDialog, AppInput } from "@/components/app"

import { useBookingFormat } from "../hooks/use-booking"
import { publicBookingService } from "../services/booking.service"
import { whatsAppNumber } from "../services/whatsapp-number"
import type { BookingGiftCard, PublicGift } from "../types/booking.types"
import { FIELD, FIELD_LABEL, MUTED, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./styles"

// The same colour the booking page falls back to, so the card and the page match.
const DEFAULT_ACCENT = "#0b46b8"

interface Face {
  businessName: string
  logoUrl: string | null
  accentColor: string | null
  recipientName: string | null
  purchaserName: string | null
  message: string | null
  amount: number
}

// The card itself. Drawn the same on the page and in the business's preview.
export function GiftCardFace({ gift, className }: { gift: Face; className?: string }) {
  const t = useTranslations("booking.giftPage")
  const format = useBookingFormat()
  const accent = gift.accentColor ?? DEFAULT_ACCENT
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-[26px] p-6 text-white sm:p-7",
        className
      )}
      style={{
        background: `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 52%, #05010f))`,
        boxShadow: `0 28px 60px -24px color-mix(in srgb, ${accent} 75%, #000)`,
      }}
    >
      {/* Soft shapes behind the words, and a ribbon across the corner. */}
      <span className="absolute -end-16 -top-20 -z-10 size-56 rounded-full bg-white/10" />
      <span className="absolute -start-12 -bottom-24 -z-10 size-64 rounded-full bg-white/[0.07]" />
      <span className="absolute end-10 -top-6 -z-10 h-[140%] w-9 rotate-[24deg] bg-white/[0.08]" />

      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-[13px] bg-white/95">
          {gift.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- the business's own uploaded logo
            <img src={gift.logoUrl} alt="" className="size-full object-cover" />
          ) : (
            <Gift className="size-5" style={{ color: accent }} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-extrabold">{gift.businessName}</span>
          <span className="block text-[12px] text-white/75">{t("label")}</span>
        </span>
        <Gift className="size-7 shrink-0 text-white/85" />
      </div>

      <p className="mt-7 text-[13px] text-white/75">
        {gift.recipientName ? t("to", { name: gift.recipientName }) : t("forYou")}
      </p>
      <p className="mt-1 text-[40px] leading-none font-black tracking-tight sm:text-[46px]">
        {format.money(gift.amount)}
      </p>

      {gift.message ? (
        <p className="mt-5 rounded-[14px] bg-white/[0.13] px-4 py-3 text-[14px] leading-7 whitespace-pre-line">
          {gift.message}
        </p>
      ) : null}

      {gift.purchaserName ? (
        <p className="mt-5 text-[13.5px] font-bold text-white/90">
          {t("from", { name: gift.purchaserName })}
        </p>
      ) : null}
    </div>
  )
}

// The page behind the link the person is sent.
export function PublicGiftView({ token }: { token: string }) {
  const t = useTranslations("booking.giftPage")
  const format = useBookingFormat()
  const [gift, setGift] = useState<PublicGift | null>(null)
  const [missing, setMissing] = useState(false)
  // The card comes in gently, like being handed over.
  const [shown, setShown] = useState(false)

  useEffect(() => {
    publicBookingService
      .gift(token)
      .then((found) => {
        setGift(found)
        requestAnimationFrame(() => setShown(true))
      })
      .catch(() => setMissing(true))
  }, [token])

  const accent = gift?.business.accentColor ?? DEFAULT_ACCENT
  const shell = "mx-auto flex min-h-dvh w-full max-w-[460px] flex-col justify-center px-4 py-10"

  if (missing) {
    return (
      <main dir="rtl" className={cn(shell, "items-center text-center")}>
        <Gift className="size-10 text-[#94a3b8]" />
        <h1 className="mt-4 text-[20px] font-black text-[#0b1738]">{t("missingTitle")}</h1>
        <p className={cn("mt-2 text-[14px] leading-7", MUTED)}>{t("missingHint")}</p>
      </main>
    )
  }
  if (!gift) {
    return (
      <main className={cn(shell, "items-center")}>
        <Loader2 className="size-6 animate-spin text-[#94a3b8]" />
      </main>
    )
  }

  const code = gift.code
  const bookingLink =
    gift.business.slug && code
      ? `${ROUTES.publicBookingPage(gift.business.slug)}?gift=${encodeURIComponent(code)}`
      : null
  const copyCode = () => {
    if (!code) return
    void navigator.clipboard.writeText(code).then(() => toast.success(t("copied")))
  }

  return (
    <div
      dir="rtl"
      className="min-h-dvh"
      style={{
        background: `linear-gradient(180deg, color-mix(in srgb, ${accent} 12%, white), #f8fafc 55%)`,
      }}
    >
      <main className={shell}>
        <p className="mb-4 text-center text-[15px] font-extrabold text-[#0b1738]">
          {gift.purchaserName ? t("headlineFrom", { name: gift.purchaserName }) : t("headline")}
        </p>
        <GiftCardFace
          gift={{
            businessName: gift.business.name,
            logoUrl: gift.business.logoUrl,
            accentColor: gift.business.accentColor,
            recipientName: gift.recipientName,
            purchaserName: gift.purchaserName,
            message: gift.message,
            amount: gift.amount,
          }}
          className={cn(
            "transition duration-700 ease-out",
            shown ? "translate-y-0 scale-100 opacity-100" : "translate-y-4 scale-95 opacity-0"
          )}
        />

        <div className="mt-5 rounded-[20px] border border-[#e6ebf3] bg-white p-5">
          {gift.state !== "ready" ? (
            <p className="rounded-[12px] bg-[#fff7ed] px-4 py-3 text-[13.5px] leading-6 font-semibold text-[#9a3412]">
              {gift.state === "used"
                ? t("used")
                : gift.state === "expired"
                  ? t("expired")
                  : t("stopped", { name: gift.business.name })}
            </p>
          ) : null}

          {code ? (
            <>
              <p className={cn("text-[12.5px]", MUTED, gift.state !== "ready" && "mt-4")}>
                {t("code")}
              </p>
              <button
                type="button"
                onClick={copyCode}
                className="mt-1.5 flex w-full items-center justify-between gap-3 rounded-[14px] border border-dashed border-[#cbd5e1] bg-[#f8fafc] px-4 py-3 transition hover:bg-[#f1f5f9]"
              >
                <span className="text-[19px] font-black tracking-[0.08em] text-[#0b1738]" dir="ltr">
                  {code}
                </span>
                <span
                  className="inline-flex items-center gap-1.5 text-[13px] font-bold"
                  style={{ color: accent }}
                >
                  <Copy className="size-4" />
                  {t("copyCode")}
                </span>
              </button>
            </>
          ) : null}

          <dl className="mt-4 flex flex-col gap-2 text-[13.5px]">
            <div className="flex items-center justify-between gap-3">
              <dt className={MUTED}>{t("balance")}</dt>
              <dd className="font-black text-[#0b1738]">{format.money(gift.balance)}</dd>
            </div>
            {gift.expiresOn ? (
              <div className="flex items-center justify-between gap-3">
                <dt className={MUTED}>{t("expires")}</dt>
                <dd className="font-bold text-[#0b1738]">{format.day(gift.expiresOn, "long")}</dd>
              </div>
            ) : null}
          </dl>

          {gift.state === "ready" ? (
            <>
              <p className={cn("mt-4 text-[13px] leading-6", MUTED)}>{t("how")}</p>
              {bookingLink ? (
                <Link
                  href={bookingLink}
                  className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-extrabold text-white transition hover:brightness-110"
                  style={{ background: accent }}
                >
                  <CalendarCheck className="size-5" />
                  {t("book")}
                </Link>
              ) : null}
            </>
          ) : null}
        </div>
      </main>
    </div>
  )
}

// The business's box for sending a card: what the person will see, and the link going out over
// WhatsApp to their number (or to whoever the business picks, when no number is written).
export function GiftSendDialog({
  gift,
  onClose,
}: {
  gift: BookingGiftCard | null
  onClose: () => void
}) {
  return gift ? <GiftSendBox key={gift.id} gift={gift} onClose={onClose} /> : null
}

function GiftSendBox({ gift, onClose }: { gift: BookingGiftCard; onClose: () => void }) {
  const t = useTranslations("booking.giftPage.send")
  const format = useBookingFormat()
  const [look, setLook] = useState<{ token: string; page: PublicGift } | null>(null)
  const [phone, setPhone] = useState(gift.recipientPhone ?? "")
  const token = gift.shareToken

  useEffect(() => {
    if (!token) return
    let cancelled = false
    publicBookingService
      .gift(token)
      .then((page) => {
        if (!cancelled) setLook({ token, page })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [token])

  const page = look?.token === token ? look.page : null
  const link = `${window.location.origin}${ROUTES.publicBookingGift(gift.shareToken)}`
  const businessName = page?.business.name ?? ""
  const words = {
    recipient: gift.recipientName ?? "",
    purchaser: gift.purchaserName ?? "",
    amount: format.money(gift.initialAmount),
    business: businessName,
    link,
  }
  const message = gift.purchaserName
    ? t(gift.recipientName ? "messageFull" : "messageFrom", words)
    : t(gift.recipientName ? "messageTo" : "message", words)
  const number = phone.trim() ? whatsAppNumber(phone) : null
  const badNumber = phone.trim() !== "" && number === null
  const send = () =>
    window.open(
      `https://wa.me/${number ?? ""}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener"
    )
  const copy = () => void navigator.clipboard.writeText(link).then(() => toast.success(t("copied")))

  return (
    <AppDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title={t("title")}
      description={t("hint")}
      contentClassName="max-w-[520px]"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={SECONDARY_BUTTON} onClick={copy}>
            <Copy className="size-4" />
            {t("copyLink")}
          </button>
          <a className={SECONDARY_BUTTON} href={link} target="_blank" rel="noreferrer">
            <ExternalLink className="size-4" />
            {t("open")}
          </a>
          <button
            type="button"
            className={cn(PRIMARY_BUTTON, "bg-[#16a34a] hover:bg-[#15803d]")}
            disabled={badNumber}
            onClick={send}
          >
            <MessageCircle className="size-4" />
            {t("whatsapp")}
          </button>
        </div>
      }
    >
      <GiftCardFace
        gift={{
          businessName,
          logoUrl: page?.business.logoUrl ?? null,
          accentColor: page?.business.accentColor ?? null,
          recipientName: gift.recipientName,
          purchaserName: gift.purchaserName,
          message: gift.message,
          amount: gift.initialAmount,
        }}
      />
      <div className="mt-4">
        <label className={FIELD_LABEL} htmlFor="gift-send-phone">
          {t("phone")}
        </label>
        <AppInput
          id="gift-send-phone"
          className={FIELD}
          dir="ltr"
          inputMode="tel"
          maxLength={30}
          placeholder="05XXXXXXXX"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
        <p className={cn("mt-1.5 text-[12.5px] leading-5", badNumber ? "text-[#b91c1c]" : MUTED)}>
          {badNumber ? t("badPhone") : t("phoneHint")}
        </p>
      </div>
    </AppDialog>
  )
}

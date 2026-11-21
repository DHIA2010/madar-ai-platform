"use client"

import { type ReactNode, useEffect, useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { Gift, Loader2 } from "lucide-react"
import QRCode from "qrcode"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppSearchableSelect, AppSwitch } from "@/components/app"

import { useLoyaltyAccess } from "../hooks/use-loyalty"
import { HEADING, MUTED, PANEL, SECONDARY_BUTTON } from "./styles"

import { type Locale, localeDirection } from "@/i18n/locales"

// Shown in place of every loyalty screen to an organization that doesn't have the app.
function LoyaltyLocked() {
  const t = useTranslations("loyalty.locked")
  return (
    <div className={cn(PANEL, "mx-auto max-w-xl p-8 text-center")}>
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#fdf2f8] text-[#be185d]">
        <Gift className="size-7" />
      </span>
      <h1 className={cn("mt-4 text-xl font-bold", HEADING)}>{t("title")}</h1>
      <p className={cn("mt-2 text-sm leading-6", MUTED)}>{t("description")}</p>
      <Link
        href={ROUTES.marketplaceDetails("loyalty")}
        className="mt-5 inline-flex h-11 items-center rounded-full bg-[#be185d] px-6 text-[13.5px] font-bold text-white hover:bg-[#9d174d]"
      >
        {t("cta")}
      </Link>
    </div>
  )
}

// The frame every loyalty screen sits in: the title row, then the screen.
export function LoyaltyPage({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
}) {
  const locale = useLocale() as Locale
  const { enabled } = useLoyaltyAccess()
  return (
    <div dir={localeDirection(locale)} className="flex flex-col gap-4 pb-10">
      {enabled ? (
        <>
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className={cn("text-[22px] leading-8 font-extrabold", HEADING)}>{title}</h1>
              {subtitle ? <p className={cn("mt-0.5 text-[13px]", MUTED)}>{subtitle}</p> : null}
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
          </header>
          {children}
        </>
      ) : (
        <LoyaltyLocked />
      )}
    </div>
  )
}

export function Loading() {
  const t = useTranslations("loyalty.common")
  return (
    <div className={cn("flex items-center justify-center gap-2 py-20 text-[13px]", MUTED)}>
      <Loader2 className="size-4 animate-spin" />
      {t("loading")}
    </div>
  )
}

export function LoadFailed({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("loyalty.common")
  return (
    <div className={cn(PANEL, "flex flex-col items-center gap-3 px-6 py-12 text-center")}>
      <p className={cn("text-[14px] font-semibold", HEADING)}>{t("loadFailed")}</p>
      <button type="button" className={SECONDARY_BUTTON} onClick={onRetry}>
        {t("retry")}
      </button>
    </div>
  )
}

export function Empty({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      {title ? <p className={cn("text-[15px] font-bold", HEADING)}>{title}</p> : null}
      {children ? (
        <div className={cn("mx-auto mt-1.5 max-w-[460px] text-[13px] leading-6", MUTED)}>
          {children}
        </div>
      ) : null}
    </div>
  )
}

// A choice from a list, in Madar's own dropdown instead of the browser's.
export function Choice({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: string
  onChange: (next: string) => void
  options: Array<{ value: string; label: string; hint?: string }>
  ariaLabel?: string
  className?: string
}) {
  const t = useTranslations("loyalty.common")
  return (
    <div className={cn("min-w-0", className)}>
      <AppSearchableSelect
        value={value}
        onChange={onChange}
        options={options}
        ariaLabel={ariaLabel}
        placeholder={t("choose")}
        searchPlaceholder={t("search")}
        emptyLabel={t("noResults")}
        triggerClassName="h-11 w-full rounded-[12px] border-[#e1e7f0] bg-white text-[13px]"
      />
    </div>
  )
}

// A switch with what it does written beside it.
export function ToggleRow({
  checked,
  onChange,
  title,
  hint,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  title: string
  hint?: string
  disabled?: boolean
}) {
  return (
    <label className="flex items-start gap-3">
      <AppSwitch
        checked={checked}
        disabled={disabled}
        aria-label={title}
        onCheckedChange={onChange}
        className="mt-0.5"
      />
      <span className="min-w-0">
        <span className="block text-[13.5px] font-bold text-[#0b1738]">{title}</span>
        {hint ? (
          <span className={cn("mt-0.5 block text-[12.5px] leading-5", MUTED)}>{hint}</span>
        ) : null}
      </span>
    </label>
  )
}

// A QR code for a link or a card's code.
export function QrImage({
  value,
  size = 160,
  className,
  label,
}: {
  value: string
  size?: number
  className?: string
  label: string
}) {
  const [source, setSource] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(value, { margin: 1, width: size * 3, errorCorrectionLevel: "M" })
      .then((url) => {
        if (!cancelled) setSource(url)
      })
      .catch(() => {
        if (!cancelled) setSource(null)
      })
    return () => {
      cancelled = true
    }
  }, [value, size])
  return source ? (
    // eslint-disable-next-line @next/next/no-img-element -- a QR made on the spot, not a hosted image
    <img
      src={source}
      alt={label}
      width={size}
      height={size}
      className={cn("rounded-[10px] bg-white", className)}
    />
  ) : (
    <span
      className={cn("block rounded-[10px] bg-[#f1f4f9]", className)}
      style={{ width: size, height: size }}
    />
  )
}

export interface CardLook {
  businessName: string
  cardColor: string
  textColor: string
  cardTitle: string | null
  cardNote: string | null
}

// The loyalty card as the customer sees it: the business's colours, the balance, the code.
export function LoyaltyCard({
  look,
  name,
  points,
  code,
  className,
}: {
  look: CardLook
  name: string
  points: number
  // The card's own code, drawn as a QR for the staff to scan. Absent on a sample card.
  code?: string | null
  className?: string
}) {
  const t = useTranslations("loyalty.cardFace")
  const number = new Intl.NumberFormat("en-US").format(points)
  return (
    <div
      dir="rtl"
      className={cn(
        "relative w-full max-w-[380px] overflow-hidden rounded-[22px] p-5 shadow-[0_18px_40px_rgba(11,23,56,0.22)]",
        className
      )}
      style={{ backgroundColor: look.cardColor, color: look.textColor }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -end-16 -top-20 size-56 rounded-full opacity-10"
        style={{ backgroundColor: look.textColor }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[17px] leading-6 font-extrabold">{look.businessName}</p>
          <p className="mt-0.5 text-[12px] opacity-75">{look.cardTitle ?? t("title")}</p>
        </div>
        <div className="shrink-0 text-end">
          <p className="text-[11px] opacity-75">{t("points")}</p>
          <p className="text-[26px] leading-8 font-black tabular-nums">{number}</p>
        </div>
      </div>
      <div className="relative mt-6 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] opacity-75">{t("member")}</p>
          <p className="truncate text-[15px] font-bold">{name}</p>
          {look.cardNote ? (
            <p className="mt-2 text-[11.5px] leading-5 opacity-80">{look.cardNote}</p>
          ) : null}
        </div>
        {code ? (
          <div className="shrink-0 rounded-[12px] bg-white p-1.5">
            <QrImage value={code} size={84} label={t("code")} className="rounded-[6px]" />
          </div>
        ) : (
          <span className="flex size-[60px] shrink-0 items-center justify-center rounded-[14px] bg-white/15">
            <Gift className="size-7" />
          </span>
        )}
      </div>
      {code ? (
        <p className="relative mt-3 text-center font-mono text-[12px] tracking-[0.25em] opacity-80">
          {code}
        </p>
      ) : null}
    </div>
  )
}

"use client"

import { type ReactNode, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { ArrowLeft, ArrowRight, Loader2, RefreshCw } from "lucide-react"

import { cn } from "@/lib/utils"

import { HEADING, MUTED, PANEL, SECTION_TITLE } from "./styles"

import { type Locale, localeDirection } from "@/i18n/locales"

export function PageHeader({
  title,
  subtitle,
  backHref,
  badges,
  actions,
}: {
  title: ReactNode
  subtitle?: ReactNode
  backHref?: string
  badges?: ReactNode
  actions?: ReactNode
}) {
  const tCommon = useTranslations("invoicing.common")
  const locale = useLocale() as Locale
  const Back = localeDirection(locale) === "rtl" ? ArrowRight : ArrowLeft
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {backHref ? (
          <Link
            href={backHref}
            aria-label={tCommon("back")}
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[#e1e7f0] bg-white text-[#5b6b85] hover:bg-[#f7f9fc]"
          >
            <Back className="size-4" />
          </Link>
        ) : null}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className={cn("text-[22px] leading-8 font-extrabold", HEADING)}>{title}</h1>
            {badges}
          </div>
          {subtitle ? <p className={cn("mt-0.5 text-[13px]", MUTED)}>{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export function PageLoading() {
  const tCommon = useTranslations("invoicing.common")
  return (
    <div className={cn("flex items-center justify-center gap-2 py-24 text-[13px]", MUTED)}>
      <Loader2 className="size-4 animate-spin" />
      {tCommon("loading")}
    </div>
  )
}

export function PageError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const tCommon = useTranslations("invoicing.common")
  return (
    <div className={cn(PANEL, "mx-auto max-w-lg px-6 py-12 text-center")}>
      <p className={cn("text-[15px] font-extrabold", HEADING)}>{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-full border border-[#e1e7f0] px-4 text-[13px] font-bold text-[#0b1738] hover:bg-[#f7f9fc]"
        >
          <RefreshCw className="size-3.5" />
          {tCommon("retry")}
        </button>
      ) : null}
    </div>
  )
}

export function SideCard({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn(PANEL, "p-5", className)}>
      {title || action ? (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className={SECTION_TITLE}>{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function InfoRow({
  label,
  value,
  strong,
  tone,
}: {
  label: ReactNode
  value: ReactNode
  strong?: boolean
  tone?: "danger" | "success"
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <dt className={cn("shrink-0 text-[12.5px]", strong ? cn("font-extrabold", HEADING) : MUTED)}>
        {label}
      </dt>
      <dd
        className={cn(
          "min-w-0 text-end text-[13px] tabular-nums",
          strong ? "font-extrabold" : "font-semibold",
          tone === "danger" ? "text-[#dc2626]" : tone === "success" ? "text-[#15803d]" : HEADING
        )}
      >
        {value}
      </dd>
    </div>
  )
}

const SHEET_WIDTH = 794 // 210mm at 96dpi

// The grey desk the A4 sheet lies on. The sheet keeps its true proportions and is scaled down to
// fit a narrower screen, so a phone shows the same page the printer does.
export function PaperStage({ children, className }: { children: ReactNode; className?: string }) {
  const frame = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    const node = frame.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      setZoom(Math.min(1, Math.floor((entry.contentRect.width / SHEET_WIDTH) * 1000) / 1000))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      className={cn(
        "min-w-0 rounded-[18px] border border-[#e4e9f2] bg-[#eef1f6] p-2.5 sm:p-6",
        className
      )}
    >
      <div ref={frame} className="overflow-hidden">
        <div
          style={{ zoom }}
          className="mx-auto w-[210mm] overflow-hidden rounded-[6px] bg-white shadow-[0_10px_40px_rgba(11,23,56,0.12)]"
        >
          {children}
        </div>
      </div>
    </div>
  )
}

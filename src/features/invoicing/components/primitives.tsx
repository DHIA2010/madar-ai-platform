"use client"

import { type ReactNode, useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { FileSignature, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { CELL_INPUT, FIELD, FIELD_LABEL, HEADING, MUTED, PANEL } from "./styles"

import { type Locale, localeDirection } from "@/i18n/locales"

// Shown in place of every invoicing screen until the organization subscribes to the app.
export function InvoicingLocked() {
  const t = useTranslations("invoicing.locked")
  const locale = useLocale() as Locale
  return (
    <div dir={localeDirection(locale)} className={cn(PANEL, "mx-auto max-w-xl p-8 text-center")}>
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#eef0ff] text-[#4f46e5]">
        <FileSignature className="size-7" />
      </span>
      <h1 className={cn("mt-4 text-xl font-bold", HEADING)}>{t("title")}</h1>
      <p className={cn("mt-2 text-sm leading-6", MUTED)}>{t("description")}</p>
      <Link
        href={ROUTES.marketplaceDetails("invoicing")}
        className="mt-5 inline-flex h-11 items-center rounded-full bg-[#4f46e5] px-6 text-[13.5px] font-bold text-white hover:bg-[#4338ca]"
      >
        {t("cta")}
      </Link>
    </div>
  )
}

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "accent"

const TONE: Record<Tone, string> = {
  neutral: "bg-[#f1f3f7] text-[#5b6b85]",
  info: "bg-[#eef4ff] text-[#2563eb]",
  success: "bg-[#e9f8ef] text-[#15803d]",
  warning: "bg-[#fff7e6] text-[#b45309]",
  danger: "bg-[#fef1f1] text-[#dc2626]",
  accent: "bg-[#eef0ff] text-[#4f46e5]",
}

export function Pill({
  tone,
  children,
  icon: Icon,
  className,
}: {
  tone: Tone
  children: ReactNode
  icon?: LucideIcon
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap",
        TONE[tone],
        className
      )}
    >
      {Icon ? <Icon className="size-3" strokeWidth={2.5} /> : null}
      {children}
    </span>
  )
}

// One control and its caption. `group` is for a set of controls under one caption (a choice of
// cards, a date with shortcuts): a <label> there would hand every click on it to the first one.
export function Field({
  label,
  hint,
  required,
  group = false,
  className,
  children,
}: {
  label: ReactNode
  hint?: ReactNode
  required?: boolean
  group?: boolean
  className?: string
  children: ReactNode
}) {
  const body = (
    <>
      <span className={FIELD_LABEL}>
        {label}
        {required ? <span className="ms-0.5 text-[#dc2626]">*</span> : null}
      </span>
      {children}
      {hint ? <span className={cn("mt-1 block text-[11.5px]", MUTED)}>{hint}</span> : null}
    </>
  )
  if (group) {
    return (
      <div role="group" className={cn("block min-w-0", className)}>
        {body}
      </div>
    )
  }
  return <label className={cn("block min-w-0", className)}>{body}</label>
}

export function TextInput({
  value,
  onChange,
  className,
  invalid,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange"> & {
  value: string | null
  onChange: (next: string) => void
  invalid?: boolean
}) {
  return (
    <input
      {...props}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
      className={cn(FIELD, invalid && "border-[#f3b4b4] bg-[#fffafa]", className)}
    />
  )
}

export function TextArea({
  value,
  onChange,
  className,
  ...props
}: Omit<React.ComponentProps<"textarea">, "value" | "onChange"> & {
  value: string | null
  onChange: (next: string) => void
}) {
  return (
    <textarea
      {...props}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
      className={cn(FIELD, "h-auto min-h-[88px] resize-y py-2.5 leading-6", className)}
    />
  )
}

// A number typed as text: what's being typed stays as typed ("12.", "0.0") until the field is
// left, while the parent always holds a number.
export function NumberInput({
  value,
  onChange,
  min = 0,
  max,
  cell = false,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "min" | "max"> & {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  cell?: boolean
}) {
  const [text, setText] = useState(() => String(value ?? 0))
  const [focused, setFocused] = useState(false)

  return (
    <input
      {...props}
      dir="ltr"
      inputMode="decimal"
      value={focused ? text : String(value ?? 0)}
      onFocus={(event) => {
        setText(String(value ?? 0))
        setFocused(true)
        event.target.select()
      }}
      onBlur={() => setFocused(false)}
      onChange={(event) => {
        const next = event.target.value.replace(/[٠-٩]/g, (digit) =>
          String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))
        )
        if (!/^\d*[.,]?\d*$/.test(next)) return
        setText(next)
        let parsed = Number(next.replace(",", "."))
        if (!Number.isFinite(parsed)) parsed = 0
        if (max !== undefined) parsed = Math.min(parsed, max)
        onChange(Math.max(parsed, min))
      }}
      className={cn(cell ? CELL_INPUT : FIELD, "text-center tabular-nums", className)}
    />
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  disabled,
}: {
  value: T
  options: Array<{ value: T; label: ReactNode; disabled?: boolean }>
  onChange: (next: T) => void
  className?: string
  disabled?: boolean
}) {
  return (
    <div
      className={cn(
        "inline-flex h-11 items-center gap-1 rounded-[12px] border border-[#e1e7f0] bg-[#f7f9fc] p-1",
        className
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled || option.disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-full flex-1 rounded-[9px] px-3 text-[12.5px] font-bold whitespace-nowrap transition",
            option.value === value
              ? "bg-white text-[#4f46e5] shadow-[0_1px_3px_rgba(11,23,56,0.12)]"
              : "text-[#6b7b96] hover:text-[#0b1738]",
            (disabled || option.disabled) && "cursor-not-allowed opacity-50"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "accent",
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon: LucideIcon
  tone?: Tone
}) {
  return (
    <div className={cn(PANEL, "flex items-start gap-3 p-4")}>
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-[12px]",
          TONE[tone]
        )}
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className={cn("text-[12px] font-semibold", MUTED)}>{label}</p>
        <p
          className={cn("mt-1 truncate text-[20px] leading-7 font-extrabold tabular-nums", HEADING)}
        >
          {value}
        </p>
        {hint ? <p className={cn("mt-0.5 text-[11.5px]", MUTED)}>{hint}</p> : null}
      </div>
    </div>
  )
}

export function FilterTabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: Array<{ value: T; label: string; count?: number }>
  onChange: (next: T) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-bold transition",
            option.value === value
              ? "bg-[#0b1738] text-white"
              : "border border-[#e1e7f0] bg-white text-[#5b6b85] hover:bg-[#f7f9fc]"
          )}
        >
          {option.label}
          {option.count ? (
            <span
              className={cn(
                "rounded-full px-1.5 text-[10.5px]",
                option.value === value ? "bg-white/20" : "bg-[#eef0ff] text-[#4f46e5]"
              )}
            >
              {option.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className={cn(PANEL, "px-6 py-14 text-center")}>
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#eef0ff] text-[#4f46e5]">
        <Icon className="size-7" />
      </span>
      <p className={cn("mt-4 text-[16px] font-extrabold", HEADING)}>{title}</p>
      <p className={cn("mx-auto mt-1.5 max-w-md text-[13px] leading-6", MUTED)}>{description}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  )
}

export const PRIMARY_BUTTON =
  "h-11 gap-2 rounded-full bg-[#4f46e5] px-5 text-[13.5px] font-bold text-white shadow-[0_6px_16px_rgba(79,70,229,0.25)] hover:bg-[#4338ca]"
export const SECONDARY_BUTTON =
  "h-11 gap-2 rounded-full border border-[#e1e7f0] bg-white px-4 text-[13px] font-bold text-[#0b1738] hover:bg-[#f7f9fc]"

// Radix releases its pointer-events lock on <body> as a menu closes; a dialog opened in the same
// tick mounts under that lock and leaves the page unclickable once it closes.
export const afterMenuCloses = (action: () => void) => () => setTimeout(action, 0)

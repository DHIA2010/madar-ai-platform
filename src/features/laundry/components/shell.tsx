"use client"

import Link from "next/link"
import { useLocale } from "next-intl"
import { Loader2, WashingMachine } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppDateField, AppSearchableSelect, AppSwitch } from "@/components/app"

import { getActiveApplications } from "@/features/applications"
import { usePermissions } from "@/features/authentication"
import { usePluginEnabled } from "@/features/plugins"
import { useWorkspace } from "@/features/workspace"

import { type Locale, localeDirection } from "@/i18n/locales"

// The laundry screens' look: the same panels as the other back-office pages, with the app's teal.
export const ACCENT = "#2563eb"
export const PANEL =
  "rounded-[18px] border border-[#e4e9f2] bg-white shadow-[0_1px_3px_rgba(11,23,56,0.05)]"
export const HEADING = "text-[#0b1738]"
export const MUTED = "text-[#6b7b96]"
export const FIELD =
  "h-11 w-full rounded-[12px] border border-[#e1e7f0] bg-white px-3 text-[13px] text-[#0b1738] outline-none transition placeholder:text-[#a3b0c6] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15 disabled:bg-[#f7f9fc]"
export const LABEL = "mb-1.5 block text-[12.5px] font-semibold text-[#344054]"
export const PRIMARY =
  "inline-flex h-11 items-center justify-center gap-2 rounded-[12px] bg-[#2563eb] px-5 text-[13.5px] font-bold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-60"
export const SECONDARY =
  "inline-flex h-11 items-center justify-center gap-2 rounded-[12px] border border-[#e1e7f0] bg-white px-4 text-[13px] font-semibold text-[#0b1738] transition hover:bg-[#f7f9fc] disabled:cursor-not-allowed disabled:opacity-60"
export const DANGER =
  "inline-flex h-11 items-center justify-center gap-2 rounded-[12px] border border-[#fecdca] bg-white px-4 text-[13px] font-semibold text-[#b42318] transition hover:bg-[#fef3f2] disabled:cursor-not-allowed disabled:opacity-60"
export const CHIP = (active: boolean) =>
  cn(
    "rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
    active ? "border-[#2563eb] bg-[#2563eb] text-white" : "border-[#e1e7f0] bg-white text-[#0b1738]"
  )

// Whether this organization has the Laundry app, and whether this person may change things.
export function useLaundryAccess() {
  const { currentOrganization } = useWorkspace()
  const { can } = usePermissions()
  const hasPos = getActiveApplications(currentOrganization?.settings).includes("pos")
  const pluginOn = usePluginEnabled("laundry", hasPos)
  return {
    // null while it is still being checked.
    enabled: hasPos ? pluginOn : false,
    canManage: can("pos:manage"),
  }
}

// Arabic and English side by side, picked by the reader's language.
export function useTx() {
  const ar = (useLocale() as Locale) === "ar"
  return {
    ar,
    tx: (arabic: string, english: string) => (ar ? arabic : english),
    money: (value: number) => {
      const amount = new Intl.NumberFormat(ar ? "ar-SA-u-nu-latn" : "en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value)
      return ar ? `${amount} ر.س` : `SAR ${amount}`
    },
    dateTime: (value: string | null) =>
      value
        ? new Intl.DateTimeFormat(ar ? "ar-SA-u-nu-latn-ca-gregory" : "en-US", {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
          }).format(new Date(value))
        : "—",
  }
}

export const STATUS_LABEL: Record<string, { ar: string; en: string; tone: string }> = {
  received: { ar: "مستلم", en: "Received", tone: "bg-[#eef2ff] text-[#3730a3]" },
  processing: { ar: "قيد العمل", en: "In progress", tone: "bg-[#fff7ed] text-[#c2410c]" },
  ready: { ar: "جاهز", en: "Ready", tone: "bg-[#ecfdf5] text-[#047857]" },
  delivered: { ar: "تم التسليم", en: "Collected", tone: "bg-[#f1f5f9] text-[#475569]" },
  cancelled: { ar: "ملغي", en: "Cancelled", tone: "bg-[#fef2f2] text-[#b91c1c]" },
}

export function StatusBadge({ status }: { status: string }) {
  const { ar } = useTx()
  const meta = STATUS_LABEL[status] ?? STATUS_LABEL.received
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-[11.5px] font-bold whitespace-nowrap",
        meta.tone
      )}
    >
      {ar ? meta.ar : meta.en}
    </span>
  )
}

function Locked() {
  const { tx } = useTx()
  return (
    <div className={cn(PANEL, "mx-auto max-w-xl p-8 text-center")}>
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#eff6ff] text-[#2563eb]">
        <WashingMachine className="size-7" />
      </span>
      <h1 className={cn("mt-4 text-xl font-bold", HEADING)}>
        {tx("إضافة المغاسل موقوفة", "The Laundry plugin is off")}
      </h1>
      <p className={cn("mt-2 text-sm leading-6", MUTED)}>
        {tx(
          "فعّلها مجانًا من «الإضافات». تعمل مع نقطة البيع: طلبات بمراحل، قائمة أسعار بالقطعة، رسالة جاهزية بالواتساب، ملصقات وتوصيل واشتراكات.",
          "Switch it on for free in Plugins. It works with the cashier: staged orders, a price list per piece, WhatsApp ready messages, tags, delivery and plans."
        )}
      </p>
      <Link
        href={ROUTES.plugins}
        className="mt-5 inline-flex h-11 items-center rounded-full bg-[#2563eb] px-6 text-[13.5px] font-bold text-white hover:bg-[#1d4ed8]"
      >
        {tx("الإضافات", "Plugins")}
      </Link>
    </div>
  )
}

// The frame every laundry screen sits in: the title row, then the screen.
export function LaundryPage({
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
  const { enabled } = useLaundryAccess()
  return (
    <div dir={localeDirection(locale)} className="flex flex-col gap-4 pb-10">
      {enabled === null ? (
        <Loading />
      ) : enabled ? (
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
        <Locked />
      )}
    </div>
  )
}

export function Loading() {
  return (
    <div className={cn("flex items-center justify-center py-20", MUTED)}>
      <Loader2 className="size-5 animate-spin" />
    </div>
  )
}

// The server's error in the reader's language, for the codes the app raises.
export function errorText(error: unknown, ar: boolean): string {
  const code = error && typeof error === "object" ? (error as { code?: string }).code : undefined
  const known: Record<string, [string, string]> = {
    LAUNDRY_PRICE_MISSING: [
      "هذه القطعة بلا سعر لهذه الخدمة. أضف السعر من قائمة الأسعار.",
      "This item has no price for that service.",
    ],
    LAUNDRY_CUSTOMER_REQUIRED: ["أدخل جوال العميل.", "Enter the customer's mobile."],
    LAUNDRY_DEPOSIT_INVALID: [
      "أدخل مبلغ العربون وطريقة الدفع.",
      "Enter the deposit and how it was paid.",
    ],
    LAUNDRY_ORDER_INVOICED: [
      "الطلب مفوتر: أرجع فاتورته من صفحة الفواتير.",
      "This order is invoiced: return its invoice from Invoices.",
    ],
    LAUNDRY_ORDER_CLOSED: ["الطلب مغلق.", "This order is closed."],
    POS_INVOICE_INSUFFICIENT_WALLET_BALANCE: [
      "رصيد العميل لا يكفي لخصم العربون.",
      "The customer's balance doesn't cover the deposit.",
    ],
    POS_INVOICE_INVALID_PAYMENT_METHOD: [
      "اختر طريقة دفع مفعّلة.",
      "Choose an enabled payment method.",
    ],
  }
  const entry = code ? known[code] : undefined
  if (entry) return ar ? entry[0] : entry[1]
  return ar ? "تعذر تنفيذ الطلب. حاول مرة أخرى." : "Something went wrong. Try again."
}

const FIELD_TRIGGER = "h-11 w-full rounded-[12px] border-[#e1e7f0] bg-white text-[13px]"

// A choice from a list, in Madar's own dropdown (the same one the rest of the app uses).
export function Choice({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
  className,
}: {
  value: string
  onChange: (next: string) => void
  options: Array<{ value: string; label: string; hint?: string }>
  placeholder?: string
  ariaLabel?: string
  className?: string
}) {
  const { tx } = useTx()
  return (
    <div className={cn("min-w-0", className)}>
      <AppSearchableSelect
        value={value}
        onChange={onChange}
        options={options}
        ariaLabel={ariaLabel}
        placeholder={placeholder ?? tx("اختر", "Choose")}
        searchPlaceholder={tx("بحث...", "Search...")}
        emptyLabel={tx("لا توجد نتائج", "No results")}
        triggerClassName={FIELD_TRIGGER}
      />
    </div>
  )
}

const pad = (value: number) => String(value).padStart(2, "0")

// A date and a time: Madar's calendar for the day and a quarter-hour list for the time (never
// the browser's own pickers). The value is an ISO instant, or "" for none.
export function DateTimeField({
  value,
  onChange,
  clearable = true,
}: {
  value: string
  onChange: (next: string) => void
  clearable?: boolean
}) {
  const { ar, tx } = useTx()
  const date = value ? new Date(value) : null
  const day = date ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` : ""
  const clock = date
    ? `${pad(date.getHours())}:${pad(Math.floor(date.getMinutes() / 15) * 15)}`
    : ""
  const label = (time: string) => {
    const [hours, minutes] = time.split(":").map(Number)
    return new Intl.DateTimeFormat(ar ? "ar-SA-u-nu-latn" : "en-GB", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(2026, 0, 1, hours, minutes))
  }
  const times = Array.from(
    { length: 96 },
    (_, index) => `${pad(Math.floor(index / 4))}:${pad((index % 4) * 15)}`
  )
  const build = (nextDay: string, nextClock: string) => {
    if (!nextDay) return ""
    const [year, month, dayOfMonth] = nextDay.split("-").map(Number)
    const [hours, minutes] = (nextClock || "12:00").split(":").map(Number)
    return new Date(year, month - 1, dayOfMonth, hours, minutes).toISOString()
  }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,9rem)] gap-2">
      <AppDateField
        value={day}
        clearable={clearable}
        onChange={(next) => onChange(build(next, clock))}
        triggerClassName={FIELD_TRIGGER}
      />
      <AppSearchableSelect
        value={clock}
        onChange={(next) => {
          const today = new Date()
          onChange(
            build(
              day || `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`,
              next
            )
          )
        }}
        options={times.map((time) => ({ value: time, label: label(time), keywords: time }))}
        placeholder={tx("الوقت", "Time")}
        searchPlaceholder={tx("ابحث عن وقت", "Find a time")}
        emptyLabel={tx("لا توجد نتائج", "No results")}
        triggerClassName={FIELD_TRIGGER}
      />
    </div>
  )
}

// A setting that is on or off, with what it means under it -- Madar's switch, not a checkbox.
export function SwitchRow({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  hint?: string
  disabled?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-[14px] border border-[#eef2f8] p-3.5">
      <div className="min-w-0">
        <p className={cn("text-[13px] font-bold", HEADING)}>{label}</p>
        {hint ? <p className={cn("mt-0.5 text-[12px] leading-5", MUTED)}>{hint}</p> : null}
      </div>
      <AppSwitch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-label={label}
      />
    </div>
  )
}

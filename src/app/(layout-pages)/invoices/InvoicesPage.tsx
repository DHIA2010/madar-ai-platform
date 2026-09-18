"use client"

// الفواتير -- every point-of-sale sale recorded through pos_invoices, and the page that creates
// new ones ("+ فاتورة جديدة") until the real cashier terminal exists to create them from its own
// checkout flow. Line items are real products (native or synced), payment method is the real
// per-branch payment-methods catalogue, and tax is Saudi Arabia's real 15% VAT -- there is no
// discount-code or tax-configuration system anywhere in the platform, so a discount here is a
// cashier-entered override, not a rule looked up from a table.
//
// "Send invoice" stays honestly disabled: there is no email/SMS/WhatsApp channel wired to an
// invoice anywhere in the platform. "Print" is real -- it calls window.print() against the same
// ThermalInvoiceReceipt the cashier's own post-checkout print uses (see the hidden portal target
// near the bottom of this file), not the page itself, so printing an already-completed invoice
// from here produces the same real 80mm receipt a customer would have gotten at the till.

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import QRCode from "qrcode"
import {
  addMonths,
  endOfMonth,
  format,
  getMonth,
  getYear,
  setMonth,
  setYear,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns"
import type { DateRange } from "react-day-picker"
import {
  Calculator,
  CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Minus,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Send,
  Trash2,
  Wallet,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { AppError } from "@/lib/errors/app-error"
import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"
import { useWorkspace } from "@/features/workspace"
import { ThermalInvoiceReceipt } from "@/app/(layout-pages)/pos/ThermalInvoiceReceipt"
import { CreditNoteReceipt } from "@/app/(layout-pages)/pos/CreditNoteReceipt"
import {
  posInvoicesService,
  VAT_RATE,
  type CreateInvoiceItemInput,
  type Invoice,
  type InvoiceReturn,
  type InvoiceStatus,
  type InvoiceSummary,
} from "@/features/pos/services/pos-invoices.service"
import { posPaymentMethodsService } from "@/features/pos/services/pos-payment-methods.service"
import { taxRatesService } from "@/features/pos/services/tax-rates.service"
import {
  productListService,
  type ProductRecord,
} from "@/features/products/services/product-list.service"

import {
  AppSearchableSelect,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
  type AppSearchableSelectOption,
} from "@/components/app"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

const PANEL =
  "rounded-2xl border border-[#e8edf3] bg-white shadow-[0_1px_4px_rgba(15,30,62,0.07),0_0_1px_rgba(15,30,62,0.05)]"
const HEADING = "text-[#0d1b3e]"
const MUTED = "text-[#8098b4]"
const FIELD_CLASS =
  "h-11 rounded-[10px] border-[#e8edf3] bg-white text-[13px] text-[#0d1b3e] placeholder:text-[#8098b4]"
// Matches ProductsPage.tsx's own FILTER_TRIGGER_CLASS -- same searchable-combobox filter look,
// reused here so the two pages' filter bars read as the same control, not two different ones.
const FILTER_TRIGGER_CLASS =
  "h-10 w-[150px] rounded-[10px] border-[#e8edf3] bg-white text-[12.5px] text-[#0d1b3e]"
const PAGE_SIZE_OPTIONS = [10, 25, 50]

const STATUS_FILTER_OPTIONS: AppSearchableSelectOption[] = [
  { value: "all", label: "جميع الحالات" },
  { value: "completed", label: "مكتملة" },
  { value: "cancelled", label: "ملغاة" },
  { value: "returned", label: "مرتجعة" },
  { value: "partially_returned", label: "مرتجعة جزئياً" },
]

const AMOUNT_FORMAT = new Intl.NumberFormat("ar-SA-u-nu-latn", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatAmount(value: number): string {
  return `${AMOUNT_FORMAT.format(value)} ر.س`
}

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

function formatDateTime(value: string): string {
  return DATE_TIME_FORMAT.format(new Date(value))
}

// The rest of this section (ARABIC_DATE through DateRangeFilter) is the same calendar-popover
// date-range control ProductsPage.tsx built for its own filter bar -- reproduced here rather than
// imported from a shared module so this page's filters can be redesigned to match it without
// touching that already-shipped page at all.
const ARABIC_DATE = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  day: "numeric",
  month: "long",
  year: "numeric",
})

const MONTH_OPTIONS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]
const YEAR_OPTIONS = Array.from({ length: 21 }, (_, index) => 2018 + index)

function getDateRangePresets(): Array<{ label: string; range: DateRange }> {
  const today = new Date()
  const lastMonth = subMonths(today, 1)

  return [
    { label: "Yesterday", range: { from: subDays(today, 1), to: subDays(today, 1) } },
    { label: "Last 7 Days", range: { from: subDays(today, 6), to: today } },
    { label: "Last 30 Days", range: { from: subDays(today, 29), to: today } },
    { label: "This Month", range: { from: startOfMonth(today), to: endOfMonth(today) } },
    { label: "Last Month", range: { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) } },
  ]
}

function formatDateRangeLabel(range: DateRange | undefined) {
  if (!range?.from) return "الفترة الزمنية"
  if (!range.to) return ARABIC_DATE.format(range.from)
  return `${ARABIC_DATE.format(range.from)} - ${ARABIC_DATE.format(range.to)}`
}

function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRange | undefined
  onChange: (next: DateRange | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const [displayMonth, setDisplayMonth] = useState<Date>(value?.from ?? new Date())
  const [rangeAnchor, setRangeAnchor] = useState<Date | undefined>(undefined)
  const monthIndex = getMonth(displayMonth)
  const yearValue = getYear(displayMonth)

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) {
          setDisplayMonth(value?.from ?? new Date())
          setRangeAnchor(value?.from && !value?.to ? value.from : undefined)
        } else {
          setRangeAnchor(undefined)
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-10 w-[205px] justify-between gap-2 rounded-[10px] border-[#e1e7f0] bg-white px-3.5 text-[12.5px] font-normal text-[#0b1738] hover:border-[#c4d5f0] hover:bg-white"
        >
          <CalendarIcon className="size-4 shrink-0 text-[#95a4bd]" />
          <span className="truncate">{formatDateRangeLabel(value)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={10}
        dir="ltr"
        collisionPadding={16}
        className="max-h-[var(--radix-popover-content-available-height)] w-[min(23rem,calc(100vw-2rem))] overflow-y-auto rounded-[20px] border border-sky-400/15 bg-card p-3.5 text-foreground shadow-[0_28px_90px_-38px_rgba(14,165,233,0.55)] ring-1 ring-sky-400/10 backdrop-blur-2xl"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 rounded-full border border-border bg-muted/60 text-muted-foreground transition-all hover:border-sky-400/45 hover:bg-sky-500/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-sky-400/35"
            onClick={() => setDisplayMonth((current) => addMonths(current, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </Button>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
            <Select
              value={String(monthIndex)}
              onValueChange={(next) => {
                setDisplayMonth((current) => setMonth(current, Number(next)))
              }}
            >
              <SelectTrigger className="h-9 w-[7.75rem] rounded-full border border-border bg-muted/60 px-3 text-sm font-semibold text-foreground shadow-none transition-all hover:border-sky-400/35 hover:bg-sky-500/10 focus-visible:ring-2 focus-visible:ring-sky-400/35">
                <span>{MONTH_OPTIONS[monthIndex]}</span>
              </SelectTrigger>
              <SelectContent
                position="popper"
                className="rounded-2xl border border-border bg-card p-1.5 text-foreground shadow-[0_18px_40px_-20px_rgba(2,6,23,0.88)]"
                align="center"
                sideOffset={4}
              >
                {MONTH_OPTIONS.map((monthLabel, index) => (
                  <SelectItem
                    key={monthLabel}
                    value={String(index)}
                    className="rounded-xl px-3 py-2 text-sm text-foreground focus:bg-sky-500/10 data-[state=checked]:bg-sky-500/15"
                  >
                    {monthLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={String(yearValue)}
              onValueChange={(next) => {
                setDisplayMonth((current) => setYear(current, Number(next)))
              }}
            >
              <SelectTrigger className="h-9 w-[6rem] rounded-full border border-border bg-muted/60 px-3 text-sm font-semibold text-foreground shadow-none transition-all hover:border-sky-400/35 hover:bg-sky-500/10 focus-visible:ring-2 focus-visible:ring-sky-400/35">
                <span>{yearValue}</span>
              </SelectTrigger>
              <SelectContent
                position="popper"
                className="max-h-56 rounded-2xl border border-border bg-card p-1.5 text-foreground shadow-[0_18px_40px_-20px_rgba(2,6,23,0.88)]"
                align="center"
                sideOffset={4}
              >
                {YEAR_OPTIONS.map((yearOption) => (
                  <SelectItem
                    key={yearOption}
                    value={String(yearOption)}
                    className="rounded-xl px-3 py-2 text-sm text-foreground focus:bg-sky-500/10 data-[state=checked]:bg-sky-500/15"
                  >
                    {yearOption}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 rounded-full border border-border bg-muted/60 text-muted-foreground transition-all hover:border-sky-400/45 hover:bg-sky-500/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-sky-400/35"
            onClick={() => setDisplayMonth((current) => addMonths(current, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <Calendar
          mode="range"
          animate
          month={displayMonth}
          onMonthChange={setDisplayMonth}
          selected={value}
          onSelect={(next, selectedDay) => {
            if (!selectedDay) {
              onChange(next)
              return
            }

            if (!rangeAnchor) {
              onChange({ from: selectedDay, to: undefined })
              setRangeAnchor(selectedDay)
              return
            }

            const from = selectedDay < rangeAnchor ? selectedDay : rangeAnchor
            const to = selectedDay < rangeAnchor ? rangeAnchor : selectedDay

            onChange({ from, to })
            setRangeAnchor(undefined)
            setOpen(false)
          }}
          numberOfMonths={1}
          startMonth={new Date(2018, 0)}
          endMonth={new Date(2038, 11)}
          captionLayout="label"
          formatters={{
            formatWeekdayName: (date) => format(date, "EEE"),
          }}
          className="rounded-[18px] bg-transparent p-0 [--cell-size:32px]"
          classNames={{
            root: "w-full",
            months: "w-full",
            month: "w-full gap-2",
            nav: "hidden",
            button_previous:
              "size-8 rounded-full border border-border bg-muted/60 text-muted-foreground transition-all hover:border-sky-400/45 hover:bg-sky-500/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-sky-400/35",
            button_next:
              "size-8 rounded-full border border-border bg-muted/60 text-muted-foreground transition-all hover:border-sky-400/45 hover:bg-sky-500/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-sky-400/35",
            month_caption: "hidden",
            caption_label: "text-base font-semibold text-foreground",
            weekdays: "mb-1.5 grid grid-cols-7 gap-1.5",
            weekday:
              "h-6 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
            week: "mt-1.5 grid grid-cols-7 gap-1.5",
            day: "rounded-full text-foreground",
            day_button:
              "size-8 rounded-full border border-transparent bg-transparent text-xs font-medium text-foreground transition-all duration-200 ease-out hover:border-sky-300/40 hover:bg-sky-500/14 hover:text-foreground focus-visible:ring-2 focus-visible:ring-sky-400/35",
            today:
              "rounded-full border border-sky-400/60 bg-transparent text-foreground shadow-none",
            selected:
              "rounded-full border border-sky-300 bg-sky-400 text-foreground shadow-[0_0_0_1px_rgba(125,211,252,0.2),0_10px_30px_rgba(14,165,233,0.32)] hover:bg-sky-300 hover:text-foreground",
            range_middle: "rounded-full border border-transparent bg-sky-500/14 text-foreground",
            range_start:
              "rounded-full border border-sky-300 bg-sky-400 text-foreground shadow-[0_0_0_1px_rgba(125,211,252,0.2),0_10px_30px_rgba(14,165,233,0.32)]",
            range_end:
              "rounded-full border border-sky-300 bg-sky-400 text-foreground shadow-[0_0_0_1px_rgba(125,211,252,0.2),0_10px_30px_rgba(14,165,233,0.32)]",
            outside: "text-muted-foreground opacity-40",
            disabled: "text-muted-foreground opacity-35",
          }}
        />

        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
          {getDateRangePresets().map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="rounded-full border border-border bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-all hover:border-sky-400/35 hover:bg-sky-500/10 hover:text-foreground"
              onClick={() => {
                onChange(preset.range)
                setRangeAnchor(undefined)
                setDisplayMonth(preset.range.from ?? new Date())
                setOpen(false)
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 rounded-xl border-border bg-muted/60 px-3.5 text-sm font-medium text-muted-foreground transition-all hover:border-sky-400/35 hover:bg-sky-500/10 hover:text-foreground"
            onClick={() => {
              onChange(undefined)
              setRangeAnchor(undefined)
              setOpen(false)
            }}
          >
            Clear Date
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-9 rounded-xl bg-sky-500 px-3.5 text-sm font-medium text-white hover:bg-sky-400"
            onClick={() => {
              const today = new Date()
              onChange({ from: today, to: today })
              setRangeAnchor(undefined)
              setDisplayMonth(today)
              setOpen(false)
            }}
          >
            Today
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

const STATUS_META: Record<
  InvoiceStatus,
  { label: string; tint: string; dot: string; Icon: typeof CheckCircle2 }
> = {
  completed: {
    label: "مكتملة",
    tint: "bg-[#f0fdf4] text-[#15803d]",
    dot: "bg-[#22c55e]",
    Icon: CheckCircle2,
  },
  cancelled: {
    label: "ملغاة",
    tint: "bg-[#fef2f2] text-[#dc2626]",
    dot: "bg-[#ef4444]",
    Icon: XCircle,
  },
  returned: {
    label: "مرتجعة",
    tint: "bg-[#fffbeb] text-[#b45309]",
    dot: "bg-[#f59e0b]",
    Icon: RotateCcw,
  },
  partially_returned: {
    label: "مرتجعة جزئياً",
    tint: "bg-[#fff7ed] text-[#c2410c]",
    dot: "bg-[#fb923c]",
    Icon: RotateCcw,
  },
}

type StatusFilter = "all" | InvoiceStatus

export default function InvoicesPage() {
  const { availableWorkspaces, currentOrganization } = useWorkspace()

  const workspaceName = useMemo(() => {
    const map = new Map(availableWorkspaces.map((workspace) => [workspace.id, workspace.name]))
    return (id: string) => map.get(id) ?? "—"
  }, [availableWorkspaces])

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [summary, setSummary] = useState<InvoiceSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [workspaceFilter, setWorkspaceFilter] = useState<string>("all")
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("all")
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [search, setSearch] = useState("")

  // The list endpoint still takes plain YYYY-MM-DD strings (unchanged) -- only the control that
  // produces them changed, from two separate date fields to one calendar-popover range.
  const backendFilter = useMemo(
    () => ({
      workspaceId: workspaceFilter === "all" ? undefined : workspaceFilter,
      status: statusFilter === "all" ? undefined : statusFilter,
      paymentMethodCode: paymentMethodFilter === "all" ? undefined : paymentMethodFilter,
      from: dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : undefined,
      to: dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : undefined,
    }),
    [workspaceFilter, statusFilter, paymentMethodFilter, dateRange]
  )

  const load = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [items, stats] = await Promise.all([
        posInvoicesService.list({ ...backendFilter, search: search.trim() || undefined }),
        posInvoicesService.summary(backendFilter),
      ])
      setInvoices(items)
      setSummary(stats)
    } catch (error) {
      const status = error instanceof AppError ? error.status : undefined
      setLoadError(
        status === 403 ? "لا تملك صلاحية عرض الفواتير." : "تعذر تحميل الفواتير. حاول مرة أخرى."
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendFilter])

  // Search is debounced against a fresh request rather than filtered client-side over `invoices`
  // -- the table only ever holds the current page's worth of real matches, not everything.
  useEffect(() => {
    const timeout = setTimeout(() => void load(), 350)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(invoices.length / pageSize))
  const clampedPage = Math.min(page, pageCount)
  const pagedInvoices = invoices.slice((clampedPage - 1) * pageSize, clampedPage * pageSize)

  useEffect(() => {
    setPage(1)
  }, [invoices.length, pageSize])

  const [paymentMethods, setPaymentMethods] = useState<
    Array<{ code: string; name: string; enabled: boolean }>
  >([])
  useEffect(() => {
    void posPaymentMethodsService
      .list()
      .then((methods) =>
        setPaymentMethods(methods.map((m) => ({ code: m.code, name: m.name, enabled: m.enabled })))
      )
      .catch(() => {
        // The filter/create dialog just show fewer options -- not worth blocking the page over.
      })
  }, [])
  const paymentMethodName = useMemo(() => {
    const map = new Map(paymentMethods.map((method) => [method.code, method.name]))
    return (code: string) => map.get(code) ?? code
  }, [paymentMethods])
  // Localized display name per code, for the printed receipt -- ThermalInvoiceReceipt shows one
  // name per real payment line (an invoice can be split across more than one method), unlike the
  // detail panel's own paymentMethodName() above which only ever resolves the invoice's single
  // summary code.
  const paymentMethodNameByCode = useMemo(
    () => Object.fromEntries(paymentMethods.map((method) => [method.code, method.name])),
    [paymentMethods]
  )
  // The table/detail-panel label -- an invoice settled by more than one method really did use
  // more than one (pos_invoice_payments has one real row per method with its own real amount, not
  // a single flattened code), so this reads that same array instead of showing the backend's own
  // internal "split" sentinel code, which is only ever meant to mark the case, not to be shown to
  // anyone. Two methods print as "مدى، نقدي" -- their real names, not the raw code string.
  function paymentMethodLabel(invoice: Invoice): string {
    if (invoice.payments.length > 1) {
      return invoice.payments
        .map((payment) => paymentMethodName(payment.paymentMethodCode))
        .join("، ")
    }
    return paymentMethodName(invoice.paymentMethodCode)
  }

  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)

  // A real, itemized return (إشعار دائن) -- see PosInvoicesService.createReturn(). Replaces what
  // used to be a single "mark the whole invoice returned" click: the dialog lets the cashier name
  // exactly which lines, and how many units of each, are actually being returned, defaulting
  // every line's quantity to nothing so an accidental full return can never happen by mistake.
  const [returnTarget, setReturnTarget] = useState<Invoice | null>(null)
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({})
  const [returnNotes, setReturnNotes] = useState("")
  // Which method the refund is actually being given back through -- required by createReturn()
  // on the backend, and what decides whether a linked customer's account balance gets credited
  // (only for a credit/prepaid-kind method; cash/card/transfer/bnpl are assumed already handled
  // outside the system).
  const [returnPaymentMethodCode, setReturnPaymentMethodCode] = useState("")
  const [submittingReturn, setSubmittingReturn] = useState(false)
  // The just-created credit note, printed once immediately after submitting a return -- same
  // "straight to print, no confirmation screen" pattern CashierPage's own checkout uses. Cleared
  // right after that one print so the shared print target (see the bottom of this file) reverts
  // to printing whichever invoice is selected, same as before.
  const [lastReturn, setLastReturn] = useState<InvoiceReturn | null>(null)
  const [lastReturnQrDataUrl, setLastReturnQrDataUrl] = useState<string | null>(null)

  function openReturnDialog(invoice: Invoice) {
    setReturnTarget(invoice)
    // Default every line to its own full remaining quantity -- returning the whole invoice is
    // then just "open and submit"; a partial return is still one edit away by typing over a
    // line's own number.
    setReturnQuantities(
      Object.fromEntries(
        invoice.items
          .filter((item) => item.quantity - item.returnedQuantity > 0)
          .map((item) => [item.id, String(item.quantity - item.returnedQuantity)])
      )
    )
    setReturnNotes("")
    const enabledMethods = paymentMethods.filter((method) => method.enabled)
    const sameAsOriginal = enabledMethods.find(
      (method) => method.code === invoice.paymentMethodCode
    )
    setReturnPaymentMethodCode(sameAsOriginal?.code ?? enabledMethods[0]?.code ?? "")
  }

  const submitReturn = async () => {
    if (!returnTarget) return
    const items = returnTarget.items
      .map((item) => ({
        invoiceItemId: item.id,
        quantity: Math.trunc(Number(returnQuantities[item.id]) || 0),
      }))
      .filter((entry) => entry.quantity > 0)
    if (items.length === 0) {
      toast.error("حدد كمية عنصر واحد على الأقل لإرجاعه.")
      return
    }
    if (!returnPaymentMethodCode) {
      toast.error("حدد طريقة الدفع المستخدمة لإعادة المبلغ.")
      return
    }

    setSubmittingReturn(true)
    try {
      const created = await posInvoicesService.createReturn(returnTarget.id, {
        items,
        paymentMethodCode: returnPaymentMethodCode,
        notes: returnNotes.trim() || null,
      })
      toast.success(`تم تسجيل إشعار الإرجاع ${created.returnNumber}.`)
      void load()
      void posInvoicesService.summary(backendFilter).then(setSummary)
      setSelectedInvoice(null)
      setReturnTarget(null)

      // Same QR-ready-before-print discipline CashierPage's own checkout uses -- generate the
      // image up front so window.print() never fires onto a still-loading QR.
      const qrDataUrl = created.qrCode
        ? await QRCode.toDataURL(created.qrCode, { margin: 0, width: 180 }).catch(() => null)
        : null
      setLastReturnQrDataUrl(qrDataUrl)
      setLastReturn(created)
      window.setTimeout(() => {
        window.print()
        setLastReturn(null)
      }, 150)
    } catch {
      toast.error("تعذر تسجيل الإرجاع.")
    } finally {
      setSubmittingReturn(false)
    }
  }

  const [isCreateOpen, setIsCreateOpen] = useState(false)

  const statCards = [
    {
      key: "average",
      label: "متوسط قيمة الفاتورة",
      value: summary ? formatAmount(summary.averageCompletedValue) : "—",
      Icon: Calculator,
      tint: "bg-[#eff6ff] text-[#2563eb]",
    },
    {
      key: "cancelled",
      label: "الفواتير الملغاة",
      value: summary ? String(summary.cancelledCount) : "—",
      Icon: XCircle,
      tint: "bg-[#fef2f2] text-[#dc2626]",
    },
    {
      key: "completed",
      label: "الفواتير المكتملة",
      value: summary ? String(summary.completedCount) : "—",
      Icon: CheckCircle2,
      tint: "bg-[#f0fdf4] text-[#15803d]",
    },
    {
      key: "total",
      label: "إجمالي الفواتير",
      value: summary ? String(summary.totalCount) : "—",
      Icon: FileText,
      tint: "bg-[#eff6ff] text-[#2563eb]",
    },
  ]

  if (loading && invoices.length === 0 && !loadError) {
    return (
      <div dir="rtl" className={cn("flex items-center gap-2 p-8 text-[13px]", MUTED)}>
        <Loader2 className="size-4 animate-spin" />
        جارٍ تحميل الفواتير...
      </div>
    )
  }

  if (loadError) {
    return (
      <div dir="rtl" className={cn(PANEL, "flex flex-col items-start gap-3 p-6")}>
        <p className={cn("text-[13px]", HEADING)}>{loadError}</p>
        <Button variant="outline" onClick={() => void load()}>
          <RotateCcw className="size-4" />
          إعادة المحاولة
        </Button>
      </div>
    )
  }

  return (
    <div dir="rtl" className="flex flex-col gap-5 pb-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className={cn("text-[22px] font-extrabold leading-tight", HEADING)}>الفواتير</h1>
          <p className={cn("mt-1 text-[13px]", MUTED)}>إدارة ومراجعة جميع فواتير المبيعات.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="outline"
            className="h-11 gap-2 rounded-[10px] border-[#e8edf3] px-4 text-[13px] font-semibold text-[#5b6b85] hover:border-[#c7d9ff] hover:text-[#0d1b3e]"
          >
            <Link href={ROUTES.invoicesReturns}>
              <RotateCcw className="size-4" />
              الفواتير المرتجعة
            </Link>
          </Button>
          <Button
            className="h-11 gap-2 rounded-[10px] bg-[#2563eb] px-4 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus className="size-4" />
            فاتورة جديدة
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map((card) => (
          <div key={card.key} className={cn(PANEL, "flex items-center justify-between gap-3 p-4")}>
            <div>
              <p className={cn("text-[11.5px]", MUTED)}>{card.label}</p>
              <p className={cn("mt-1 text-[19px] font-extrabold", HEADING)}>{card.value}</p>
            </div>
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl",
                card.tint
              )}
            >
              <card.Icon className="size-[18px]" />
            </span>
          </div>
        ))}
      </div>

      <div
        className={cn("grid gap-5", selectedInvoice ? "lg:grid-cols-[minmax(0,1fr)_360px]" : "")}
      >
        <section className={cn(PANEL, "p-5")}>
          <div className="mb-4 flex flex-col gap-2.5 lg:flex-row lg:items-center lg:flex-wrap">
            <div className="relative flex-1 lg:min-w-[200px]">
              <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-[#8098b4]" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="البحث برقم الفاتورة أو اسم العميل..."
                className={cn(FIELD_CLASS, "ps-9")}
              />
            </div>

            <DateRangeFilter value={dateRange} onChange={setDateRange} />

            <AppSearchableSelect
              value={statusFilter}
              onChange={(value) => setStatusFilter(value as StatusFilter)}
              options={STATUS_FILTER_OPTIONS}
              ariaLabel="الحالة"
              triggerClassName={FILTER_TRIGGER_CLASS}
            />

            <AppSearchableSelect
              value={workspaceFilter}
              onChange={setWorkspaceFilter}
              options={[
                { value: "all", label: "جميع الفروع" },
                ...availableWorkspaces.map((workspace) => ({
                  value: workspace.id,
                  label: workspace.name,
                })),
              ]}
              ariaLabel="الفرع"
              triggerClassName={FILTER_TRIGGER_CLASS}
            />

            <AppSearchableSelect
              value={paymentMethodFilter}
              onChange={setPaymentMethodFilter}
              options={[
                { value: "all", label: "جميع طرق الدفع" },
                ...paymentMethods.map((method) => ({ value: method.code, label: method.name })),
              ]}
              ariaLabel="طريقة الدفع"
              triggerClassName={FILTER_TRIGGER_CLASS}
            />
          </div>

          {invoices.length === 0 ? (
            <div
              className={cn(
                "rounded-[12px] border border-dashed border-[#e8edf3] px-4 py-10 text-center text-[12.5px]",
                MUTED
              )}
            >
              لا توجد فواتير مطابقة.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-center">
                  <thead>
                    <tr>
                      {[
                        { key: "number", label: "رقم الفاتورة", align: "text-right" },
                        { key: "date", label: "التاريخ والوقت", align: "text-center" },
                        { key: "customer", label: "العميل", align: "text-center" },
                        { key: "branch", label: "الفرع", align: "text-center" },
                        { key: "payment", label: "طريقة الدفع", align: "text-center" },
                        { key: "amount", label: "المبلغ", align: "text-center" },
                        { key: "status", label: "الحالة", align: "text-center" },
                        { key: "actions", label: "الإجراءات", align: "text-center" },
                      ].map((column) => (
                        <th
                          key={column.key}
                          className={cn(
                            "border-b border-[#eef2f8] bg-[#f4f7fc] px-3 py-3 text-[11px] font-semibold",
                            MUTED,
                            column.align
                          )}
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedInvoices.map((invoice, index) => {
                      const meta = STATUS_META[invoice.status]
                      return (
                        <tr
                          key={invoice.id}
                          onClick={() => setSelectedInvoice(invoice)}
                          className={cn(
                            "cursor-pointer border-b border-[#f4f7fb] last:border-b-0 hover:bg-[#f7faff]",
                            selectedInvoice?.id === invoice.id
                              ? "bg-[#eff6ff]"
                              : index % 2 === 0
                                ? "bg-white"
                                : "bg-[#fafbfd]"
                          )}
                        >
                          <td
                            className={cn(
                              "px-3 py-3.5 text-right text-[12.5px] font-bold",
                              HEADING
                            )}
                          >
                            {invoice.invoiceNumber}
                          </td>
                          <td className={cn("px-3 py-3.5 text-[12px]", HEADING)}>
                            {formatDateTime(invoice.createdAt)}
                          </td>
                          <td className={cn("px-3 py-3.5 text-[12px]", HEADING)}>
                            {invoice.customerName ?? "عميل نقدي"}
                          </td>
                          <td className={cn("px-3 py-3.5 text-[12px]", HEADING)}>
                            {workspaceName(invoice.workspaceId)}
                          </td>
                          <td className={cn("px-3 py-3.5 text-[12px]", HEADING)}>
                            {paymentMethodLabel(invoice)}
                          </td>
                          <td className={cn("px-3 py-3.5 text-[12px] font-semibold", HEADING)}>
                            {formatAmount(invoice.totalAmount)}
                          </td>
                          <td className="px-3 py-3.5">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                                meta.tint
                              )}
                            >
                              <span className={cn("size-1.5 rounded-full", meta.dot)} />
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-3 py-3.5" onClick={(event) => event.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  aria-label="إجراءات الفاتورة"
                                  className="mx-auto flex size-8 items-center justify-center rounded-lg text-[#8098b4] transition-colors hover:bg-[#f2f5fa] hover:text-[#0d1b3e]"
                                >
                                  ···
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="w-40 rounded-[12px] [direction:rtl]"
                              >
                                <DropdownMenuItem
                                  className="cursor-pointer text-[12.5px]"
                                  onSelect={() => setSelectedInvoice(invoice)}
                                >
                                  عرض التفاصيل
                                </DropdownMenuItem>
                                {invoice.status === "completed" ||
                                invoice.status === "partially_returned" ? (
                                  <DropdownMenuItem
                                    className="cursor-pointer text-[12.5px] text-[#b45309]"
                                    // Radix locks pointer events on <body> while the dropdown
                                    // menu is open and only releases them once it finishes
                                    // closing. Opening a real Dialog (ReturnDialog) in that same
                                    // synchronous tick mounts it under that still-active lock, so
                                    // the whole page stops responding to any click until a
                                    // refresh -- deferring by one tick lets the menu's own close
                                    // finish first. Same fix ProductsPage.tsx's own row actions
                                    // menu already uses for exactly this reason.
                                    onSelect={() => setTimeout(() => openReturnDialog(invoice), 0)}
                                  >
                                    تسجيل إرجاع
                                  </DropdownMenuItem>
                                ) : null}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#eef2f8] pt-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-[76px]">
                    <AppSelect
                      value={String(pageSize)}
                      onValueChange={(value) => setPageSize(Number(value))}
                    >
                      <AppSelectTrigger className="h-9 w-full rounded-[8px] border-[#e8edf3] text-[12px]">
                        <AppSelectValue />
                      </AppSelectTrigger>
                      <AppSelectContent>
                        {PAGE_SIZE_OPTIONS.map((size) => (
                          <AppSelectItem key={size} value={String(size)}>
                            {size}
                          </AppSelectItem>
                        ))}
                      </AppSelectContent>
                    </AppSelect>
                  </div>
                  <span className={cn("text-[12px]", MUTED)}>
                    عرض {(clampedPage - 1) * pageSize + 1} -{" "}
                    {Math.min(clampedPage * pageSize, invoices.length)} من {invoices.length} فاتورة
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={clampedPage <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    aria-label="الصفحة السابقة"
                    className="flex size-7 items-center justify-center rounded-[7px] border border-[#e8edf3] bg-white text-[#8098b4] transition-colors hover:border-[#c7d9ff] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronRight className="size-3.5" />
                  </button>
                  <span className="flex size-7 items-center justify-center rounded-[7px] bg-[#2563eb] text-[12.5px] font-bold text-white">
                    {clampedPage}
                  </span>
                  <button
                    type="button"
                    disabled={clampedPage >= pageCount}
                    onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                    aria-label="الصفحة التالية"
                    className="flex size-7 items-center justify-center rounded-[7px] border border-[#e8edf3] bg-white text-[#8098b4] transition-colors hover:border-[#c7d9ff] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="size-3.5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        {selectedInvoice ? (
          <InvoiceDetailPanel
            invoice={selectedInvoice}
            workspaceName={workspaceName(selectedInvoice.workspaceId)}
            paymentMethodName={paymentMethodLabel(selectedInvoice)}
            onClose={() => setSelectedInvoice(null)}
          />
        ) : null}
      </div>

      <CreateInvoiceDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        paymentMethods={paymentMethods.filter((method) => method.enabled)}
        onCreated={(invoice) => {
          setInvoices((current) => [invoice, ...current])
          void posInvoicesService.summary(backendFilter).then(setSummary)
          setIsCreateOpen(false)
          toast.success(`تم إنشاء الفاتورة ${invoice.invoiceNumber}.`)
        }}
      />

      <ReturnDialog
        invoice={returnTarget}
        quantities={returnQuantities}
        onQuantitiesChange={setReturnQuantities}
        notes={returnNotes}
        onNotesChange={setReturnNotes}
        paymentMethods={paymentMethods.filter((method) => method.enabled)}
        paymentMethodCode={returnPaymentMethodCode}
        onPaymentMethodCodeChange={setReturnPaymentMethodCode}
        submitting={submittingReturn}
        onSubmit={() => void submitReturn()}
        onClose={() => setReturnTarget(null)}
      />

      {/* "طباعة" in the detail panel below just calls window.print() -- what actually makes that
          print the real thermal receipt instead of this whole page (sidebar, filters, table and
          all) is this hidden target plus the @media print rule collapsing every other direct
          child of <body>. Same pattern CashierPage's own post-checkout print uses; portaled
          straight to <body> (not rendered in place) for the same reason -- a fixed/hidden element
          left inside the page's own layout still repeats across however many pages the FULL
          (uncollapsed) document would paginate into. Kept mounted for as long as an invoice is
          selected, not just at print time, so ThermalInvoiceReceipt's own QR generation has
          already finished by the time anyone actually clicks طباعة.
          One shared target, not two -- lastReturn (set only for the one auto-print right after
          submitReturn, then cleared) takes priority over selectedInvoice, so a just-created
          credit note prints instead of whatever invoice happens to still be selected underneath
          it; the rest of the time this is simply the selected invoice's own receipt. */}
      {(lastReturn || selectedInvoice) &&
        typeof document !== "undefined" &&
        createPortal(
          <div id="invoice-print-target" className="hidden print:block">
            {lastReturn ? (
              <CreditNoteReceipt
                creditNote={lastReturn}
                qrDataUrl={lastReturnQrDataUrl}
                sellerLogoUrl={currentOrganization?.logoUrl ?? null}
              />
            ) : selectedInvoice ? (
              <ThermalInvoiceReceipt
                invoice={selectedInvoice}
                paymentMethodNames={paymentMethodNameByCode}
                sellerLogoUrl={currentOrganization?.logoUrl ?? null}
              />
            ) : null}
          </div>,
          document.body
        )}
      <style>{`
        @media print {
          body > *:not(#invoice-print-target) { display: none !important; }
          #invoice-print-target { width: 72mm; }
        }
        @page { size: 80mm auto; margin: 0; }
      `}</style>
    </div>
  )
}

function InvoiceDetailPanel({
  invoice,
  workspaceName,
  paymentMethodName,
  onClose,
}: {
  invoice: Invoice
  workspaceName: string
  paymentMethodName: string
  onClose: () => void
}) {
  const meta = STATUS_META[invoice.status]
  // Derived from this invoice's own stored numbers, not the organization's CURRENT default rate
  // -- a real sale keeps the rate it was actually charged at forever, even after the org's
  // configured default later changes (Settings -> الضرائب). Falls back to VAT_RATE's own 15%
  // only for the (should-be-impossible) case of a taxable amount of exactly zero.
  const taxableForInvoice = invoice.subtotalAmount - invoice.discountAmount
  const effectiveRatePercent =
    taxableForInvoice > 0
      ? Math.round((invoice.taxAmount / taxableForInvoice) * 100)
      : Math.round(VAT_RATE * 100)

  return (
    <section className={cn(PANEL, "flex h-fit flex-col gap-4 p-5")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={cn("text-[15px] font-extrabold", HEADING)}>#{invoice.invoiceNumber}</p>
          <span
            className={cn(
              "mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
              meta.tint
            )}
          >
            <span className={cn("size-1.5 rounded-full", meta.dot)} />
            {meta.label}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق"
          className="flex size-8 items-center justify-center rounded-lg text-[#8098b4] hover:bg-[#f2f5fa]"
        >
          ×
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-y-2.5 text-[12px]">
        <dt className={MUTED}>التاريخ والوقت</dt>
        <dd className={cn("text-right font-semibold", HEADING)}>
          {formatDateTime(invoice.createdAt)}
        </dd>
        <dt className={MUTED}>العميل</dt>
        <dd className={cn("text-right font-semibold", HEADING)}>
          {invoice.customerName ?? "عميل نقدي"}
        </dd>
        <dt className={MUTED}>رقم الجوال</dt>
        <dd className={cn("text-right font-semibold", HEADING)}>{invoice.customerPhone ?? "—"}</dd>
        <dt className={MUTED}>الفرع</dt>
        <dd className={cn("text-right font-semibold", HEADING)}>{workspaceName}</dd>
        <dt className={MUTED}>طريقة الدفع</dt>
        <dd className={cn("text-right font-semibold", HEADING)}>{paymentMethodName}</dd>
      </dl>

      <div className="border-t border-[#eef2f8] pt-3">
        <p className={cn("mb-2 text-[12.5px] font-bold", HEADING)}>
          المنتجات ({invoice.items.length})
        </p>
        <div className="flex flex-col gap-2.5">
          {invoice.items.map((item, index) => (
            <div key={index} className="flex items-center justify-between text-[12px]">
              <div>
                <p className={cn("font-semibold", HEADING)}>{item.productName}</p>
                <p className={MUTED}>
                  {item.quantity} × {formatAmount(item.unitPrice)}
                </p>
              </div>
              <p className={cn("font-semibold", HEADING)}>{formatAmount(item.lineTotal)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-[#eef2f8] pt-3 text-[12.5px]">
        <div className="flex items-center justify-between">
          <span className={MUTED}>المجموع الفرعي</span>
          <span className={HEADING}>{formatAmount(invoice.subtotalAmount)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className={MUTED}>الخصم</span>
          <span className={HEADING}>-{formatAmount(invoice.discountAmount)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className={MUTED}>الضريبة ({effectiveRatePercent}٪)</span>
          <span className={HEADING}>{formatAmount(invoice.taxAmount)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between rounded-[10px] bg-[#f4f7fc] px-3 py-2.5 text-[14px] font-extrabold">
          <span className={HEADING}>الإجمالي</span>
          <span className="text-[#2563eb]">{formatAmount(invoice.totalAmount)}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          className="h-10 flex-1 gap-2 rounded-[10px] border-[#e8edf3] text-[12.5px] font-semibold text-[#5b6b85] hover:border-[#c7d9ff] hover:text-[#0d1b3e]"
          onClick={() => window.print()}
        >
          <Printer className="size-4" />
          طباعة
        </Button>
        <Button
          disabled
          title="إرسال الفاتورة يتطلب ربط قناة تواصل (بريد أو رسالة) بالفاتورة، وهذا غير متاح بعد"
          className="h-10 flex-1 cursor-not-allowed gap-2 rounded-[10px] bg-[#eff6ff] text-[12.5px] font-semibold text-[#2563eb] opacity-70"
        >
          <Send className="size-4" />
          إرسال الفاتورة
        </Button>
      </div>
    </section>
  )
}

// A per-line quantity picker, not a single "return everything" click -- see createReturn() on
// the backend, which validates every requested quantity against what that specific line still
// actually has left (quantity - returnedQuantity), across however many separate return events
// have already touched it.
function ReturnDialog({
  invoice,
  quantities,
  onQuantitiesChange,
  notes,
  onNotesChange,
  paymentMethods,
  paymentMethodCode,
  onPaymentMethodCodeChange,
  submitting,
  onSubmit,
  onClose,
}: {
  invoice: Invoice | null
  quantities: Record<string, string>
  onQuantitiesChange: (next: Record<string, string>) => void
  notes: string
  onNotesChange: (next: string) => void
  paymentMethods: Array<{ code: string; name: string }>
  paymentMethodCode: string
  onPaymentMethodCodeChange: (next: string) => void
  submitting: boolean
  onSubmit: () => void
  onClose: () => void
}) {
  const returnableItems = (invoice?.items ?? []).filter(
    (item) => item.quantity - item.returnedQuantity > 0
  )

  return (
    <Dialog open={invoice !== null} onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-[32rem] [direction:rtl]">
        <DialogHeader className="text-right">
          <DialogTitle className={cn("text-[15px] font-extrabold", HEADING)}>
            تسجيل إرجاع
          </DialogTitle>
          <DialogDescription className={cn("text-[12.5px] leading-6", MUTED)}>
            {invoice ? `الفاتورة #${invoice.invoiceNumber}` : ""} -- حدد كمية كل صنف يُرجعه العميل
            فعلياً. الأصناف المُرجعة بالكامل من قبل لا تظهر هنا.
          </DialogDescription>
        </DialogHeader>

        {returnableItems.length === 0 ? (
          <p className={cn("py-6 text-center text-[12.5px]", MUTED)}>
            لا توجد أصناف متبقية لإرجاعها على هذه الفاتورة.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {returnableItems.map((item) => {
              const remaining = item.quantity - item.returnedQuantity
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-[10px] border border-[#e8edf3] p-3"
                >
                  <div className="min-w-0">
                    <p className={cn("truncate text-[12.5px] font-semibold", HEADING)}>
                      {item.productName}
                    </p>
                    <p className={cn("text-[11px]", MUTED)}>
                      المتبقي القابل للإرجاع: {remaining} من {item.quantity}
                    </p>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={remaining}
                    step="1"
                    value={quantities[item.id] ?? ""}
                    onChange={(event) =>
                      onQuantitiesChange({ ...quantities, [item.id]: event.target.value })
                    }
                    placeholder="0"
                    className="h-10 w-20 rounded-[8px] border-[#e8edf3] text-center text-[13px]"
                  />
                </div>
              )
            })}

            <div>
              <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                طريقة استرداد المبلغ <span className="text-[#e0484d]">*</span>
              </Label>
              <AppSelect value={paymentMethodCode} onValueChange={onPaymentMethodCodeChange}>
                <AppSelectTrigger className="h-10 w-full rounded-[8px] border-[#e8edf3] text-[13px]">
                  <AppSelectValue placeholder="اختر طريقة الدفع" />
                </AppSelectTrigger>
                <AppSelectContent>
                  {paymentMethods.map((method) => (
                    <AppSelectItem key={method.code} value={method.code}>
                      {method.name}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
            </div>

            <div>
              <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                ملاحظة (اختياري)
              </Label>
              <Textarea
                value={notes}
                onChange={(event) => onNotesChange(event.target.value)}
                rows={2}
                placeholder="سبب الإرجاع، مثلاً..."
                className="resize-none text-[13px]"
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {returnableItems.length > 0 ? (
            <Button
              className="h-11 gap-2 rounded-[10px] bg-[#b45309] px-6 text-[13px] font-semibold text-white hover:bg-[#92400e]"
              disabled={submitting}
              onClick={onSubmit}
            >
              {submitting ? "جارٍ التسجيل..." : "تسجيل الإرجاع"}
            </Button>
          ) : null}
          <Button
            variant="outline"
            className="h-11 rounded-[10px] border-[#e8edf3] px-5 text-[13px] font-semibold text-[#5b6b85]"
            disabled={submitting}
            onClick={onClose}
          >
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface DraftLine extends CreateInvoiceItemInput {
  key: string
}

function CreateInvoiceDialog({
  open,
  onOpenChange,
  paymentMethods,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  paymentMethods: Array<{ code: string; name: string }>
  onCreated: (invoice: Invoice) => void
}) {
  const { currentOrganization } = useWorkspace()

  const [products, setProducts] = useState<ProductRecord[]>([])
  useEffect(() => {
    if (!open) return
    void productListService
      .listProducts()
      .catch(() => [])
      .then((list) => setProducts(list ?? []))
  }, [open])

  // The organization's real configured tax rate (Settings -> الضرائب), not the hardcoded 15%
  // VAT_RATE fallback -- see CashierPage.tsx's own identical fix for why: this dialog's own
  // preview total has to match what POST /v1/pos/invoices will actually charge, or a payment
  // amount that looked correct here gets rejected as a mismatch by the real backend calculation.
  const [vatRate, setVatRate] = useState(VAT_RATE)
  useEffect(() => {
    if (!open) return
    taxRatesService
      .getDefaultRate()
      .then((rate) =>
        setVatRate(currentOrganization?.settings.taxAutoApplyToProducts === false ? 0 : rate)
      )
      .catch(() => {})
  }, [open, currentOrganization?.settings.taxAutoApplyToProducts])

  const [productQuery, setProductQuery] = useState("")
  const [lines, setLines] = useState<DraftLine[]>([])
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [paymentMethodCode, setPaymentMethodCode] = useState("")
  const [discountAmount, setDiscountAmount] = useState("0")
  const [saving, setSaving] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  useEffect(() => {
    if (open) {
      setProductQuery("")
      setLines([])
      setCustomerName("")
      setCustomerPhone("")
      setPaymentMethodCode(paymentMethods[0]?.code ?? "")
      setDiscountAmount("0")
      setShowErrors(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const matchingProducts = useMemo(() => {
    const query = productQuery.trim()
    if (!query) return []
    return products
      .filter((product) => product.name.includes(query) || product.sku.includes(query))
      .slice(0, 8)
  }, [products, productQuery])

  function addLine(product: ProductRecord) {
    setLines((current) => {
      const existing = current.find((line) => line.productId === product.id)
      if (existing) {
        return current.map((line) =>
          line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line
        )
      }
      return [
        ...current,
        {
          key: product.id,
          productId: product.id,
          productName: product.name,
          unitPrice: product.sellingPrice,
          quantity: 1,
        },
      ]
    })
    setProductQuery("")
  }

  function updateQuantity(key: string, quantity: number) {
    setLines((current) =>
      current.map((line) =>
        line.key === key ? { ...line, quantity: Math.max(1, quantity) } : line
      )
    )
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((line) => line.key !== key))
  }

  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
  const discount = Number(discountAmount) || 0
  const taxable = Math.max(0, subtotal - discount)
  const tax = Math.round(taxable * vatRate * 100) / 100
  const total = Math.round((taxable + tax) * 100) / 100

  const errors = {
    items: lines.length > 0 ? null : "أضف منتجا واحدا على الأقل",
    paymentMethod: paymentMethodCode ? null : "اختر طريقة الدفع",
  }
  const isValid = Object.values(errors).every((error) => error === null)

  const submit = async () => {
    setShowErrors(true)
    if (!isValid) return

    setSaving(true)
    try {
      const invoice = await posInvoicesService.create({
        customerName: customerName.trim() || null,
        customerPhone: customerPhone.trim() || null,
        customerId: null,
        // This quick-add form only ever picks one method for the whole total -- splitting a
        // sale across several is the cashier checkout's own flow (CashierPage.tsx).
        payments: [{ paymentMethodCode, amount: total }],
        discountAmount: discount,
        // This form has no note field of its own -- the cashier screen's "ملاحظة" button is the
        // one place a note gets typed.
        notes: null,
        items: lines.map((line) => ({
          productId: line.productId,
          productName: line.productName,
          unitPrice: line.unitPrice,
          quantity: line.quantity,
        })),
      })
      onCreated(invoice)
    } catch (error) {
      const status = error instanceof AppError ? error.status : undefined
      toast.error(status === 403 ? "لا تملك صلاحية إنشاء الفواتير." : "تعذر إنشاء الفاتورة.", {
        description: status === 403 ? "تواصل مع مالك الحساب لمنحك صلاحية pos:manage." : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-[30rem] [direction:rtl]">
        <DialogHeader className="text-right">
          <DialogTitle className={cn("text-[15px] font-extrabold", HEADING)}>
            فاتورة جديدة
          </DialogTitle>
          <DialogDescription className={cn("text-[12.5px] leading-6", MUTED)}>
            ابحث عن المنتجات وأضفها، ثم أدخل بيانات العميل وطريقة الدفع.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pe-1">
          <div>
            <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
              إضافة منتج <span className="text-[#e0484d]">*</span>
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-[#8098b4]" />
              <Input
                value={productQuery}
                onChange={(event) => setProductQuery(event.target.value)}
                placeholder="ابحث بالاسم أو رمز المنتج..."
                className={cn(FIELD_CLASS, "ps-9")}
              />
            </div>
            {matchingProducts.length > 0 ? (
              <div className="mt-1.5 flex flex-col gap-1 rounded-[10px] border border-[#e8edf3] p-1.5">
                {matchingProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addLine(product)}
                    className="flex items-center justify-between rounded-[8px] px-2.5 py-2 text-right text-[12.5px] hover:bg-[#f7faff]"
                  >
                    <span className={HEADING}>{product.name}</span>
                    <span className={MUTED}>{formatAmount(product.sellingPrice)}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {showErrors && errors.items ? (
              <p className="mt-1.5 text-[10.5px] text-[#e0484d]">{errors.items}</p>
            ) : null}
          </div>

          {lines.length > 0 ? (
            <div className="flex flex-col gap-2 rounded-[10px] border border-[#e8edf3] p-2.5">
              {lines.map((line) => (
                <div key={line.key} className="flex items-center gap-2">
                  <div className="flex-1">
                    <p className={cn("text-[12.5px] font-semibold", HEADING)}>{line.productName}</p>
                    <p className={cn("text-[11px]", MUTED)}>{formatAmount(line.unitPrice)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => updateQuantity(line.key, line.quantity - 1)}
                      className="flex size-7 items-center justify-center rounded-lg border border-[#e8edf3] text-[#5b6b85] hover:border-[#c7d9ff]"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className={cn("w-6 text-center text-[12.5px] font-semibold", HEADING)}>
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(line.key, line.quantity + 1)}
                      className="flex size-7 items-center justify-center rounded-lg border border-[#e8edf3] text-[#5b6b85] hover:border-[#c7d9ff]"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(line.key)}
                    aria-label="حذف"
                    className="flex size-7 items-center justify-center rounded-lg text-[#dc2626] hover:bg-[#fef2f2]"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                العميل (اختياري)
              </Label>
              <Input
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder="عميل نقدي"
                className={FIELD_CLASS}
              />
            </div>
            <div>
              <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                رقم الجوال (اختياري)
              </Label>
              <Input
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
                placeholder="05xxxxxxxx"
                className={FIELD_CLASS}
              />
            </div>
          </div>

          <div>
            <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
              طريقة الدفع <span className="text-[#e0484d]">*</span>
            </Label>
            <AppSelect value={paymentMethodCode} onValueChange={setPaymentMethodCode}>
              <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                <AppSelectValue placeholder="اختر طريقة الدفع" />
              </AppSelectTrigger>
              <AppSelectContent>
                {paymentMethods.map((method) => (
                  <AppSelectItem key={method.code} value={method.code}>
                    {method.name}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelect>
            {showErrors && errors.paymentMethod ? (
              <p className="mt-1.5 text-[10.5px] text-[#e0484d]">{errors.paymentMethod}</p>
            ) : null}
          </div>

          <div>
            <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
              الخصم (اختياري)
            </Label>
            <div className="relative">
              <Wallet className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-[#8098b4]" />
              <Input
                type="number"
                min={0}
                step="0.01"
                value={discountAmount}
                onChange={(event) => setDiscountAmount(event.target.value)}
                className={cn(FIELD_CLASS, "ps-9")}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5 rounded-[10px] bg-[#f4f7fc] p-3 text-[12.5px]">
            <div className="flex items-center justify-between">
              <span className={MUTED}>المجموع الفرعي</span>
              <span className={HEADING}>{formatAmount(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className={MUTED}>الخصم</span>
              <span className={HEADING}>-{formatAmount(discount)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className={MUTED}>الضريبة ({Math.round(vatRate * 100)}٪)</span>
              <span className={HEADING}>{formatAmount(tax)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[14px] font-extrabold">
              <span className={HEADING}>الإجمالي</span>
              <span className="text-[#2563eb]">{formatAmount(total)}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            className="h-11 gap-2 rounded-[10px] bg-[#2563eb] px-6 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
            disabled={saving}
            onClick={() => void submit()}
          >
            {saving ? "جارٍ الحفظ..." : "إنشاء الفاتورة"}
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          </Button>
          <Button
            variant="outline"
            className="h-11 rounded-[10px] border-[#e8edf3] px-5 text-[13px] font-semibold text-[#5b6b85] hover:border-[#c7d9ff] hover:text-[#0d1b3e]"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

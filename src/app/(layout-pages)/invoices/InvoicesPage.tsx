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
import { format } from "date-fns"
import { useLocale, useTranslations } from "next-intl"
import type { DateRange } from "react-day-picker"
import {
  Calculator,
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
  ShieldCheck,
  Trash2,
  Wallet,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { AppError } from "@/lib/errors/app-error"
import { printThermalReceipt } from "@/lib/print-thermal-receipt"
import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"
import { localeDirection, type Locale } from "@/i18n/locales"
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
import {
  posSettingsService,
  DEFAULT_POS_SETTINGS,
  type PosSettings,
} from "@/features/pos/services/pos-settings.service"
import { taxRatesService } from "@/features/pos/services/tax-rates.service"
import {
  productListService,
  type ProductRecord,
} from "@/features/products/services/product-list.service"

import {
  AppDateRangeFilter,
  AppSearchableSelect,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
  type AppSearchableSelectOption,
} from "@/components/app"
import { Button } from "@/components/ui/button"
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

type InvoicesTranslator = ReturnType<typeof useTranslations<"invoices">>

function getStatusFilterOptions(t: InvoicesTranslator): AppSearchableSelectOption[] {
  return [
    { value: "all", label: t("status.all") },
    { value: "completed", label: t("status.completed") },
    { value: "cancelled", label: t("status.cancelled") },
    { value: "returned", label: t("status.returned") },
    { value: "partially_returned", label: t("status.partiallyReturned") },
  ]
}

function amountFormatter(locale: Locale) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatAmount(value: number, locale: Locale): string {
  const amount = amountFormatter(locale).format(value)
  return locale === "ar" ? `${amount} ر.س` : `SAR ${amount}`
}

function dateTimeFormatter(locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function formatDateTime(value: string, locale: Locale): string {
  return dateTimeFormatter(locale).format(new Date(value))
}

// Module-level data+function split -- see translatedPlanTierMeta (plan-tiers.ts) /
// translatedCampaignStatusMeta (campaign-status.service.ts) for the established pattern: icons/
// colors stay plain data, the label comes from a function that takes `t`.
const STATUS_META: Record<InvoiceStatus, { tint: string; dot: string; Icon: typeof CheckCircle2 }> =
  {
    completed: {
      tint: "bg-[#f0fdf4] text-[#15803d]",
      dot: "bg-[#22c55e]",
      Icon: CheckCircle2,
    },
    cancelled: {
      tint: "bg-[#fef2f2] text-[#dc2626]",
      dot: "bg-[#ef4444]",
      Icon: XCircle,
    },
    returned: {
      tint: "bg-[#fffbeb] text-[#b45309]",
      dot: "bg-[#f59e0b]",
      Icon: RotateCcw,
    },
    partially_returned: {
      tint: "bg-[#fff7ed] text-[#c2410c]",
      dot: "bg-[#fb923c]",
      Icon: RotateCcw,
    },
  }

function getStatusLabel(status: InvoiceStatus, t: InvoicesTranslator): string {
  switch (status) {
    case "completed":
      return t("status.completed")
    case "cancelled":
      return t("status.cancelled")
    case "returned":
      return t("status.returned")
    case "partially_returned":
      return t("status.partiallyReturned")
  }
}

type StatusFilter = "all" | InvoiceStatus

export default function InvoicesPage() {
  const t = useTranslations("invoices")
  const tCashierCommon = useTranslations("pos.cashier.common")
  const locale = useLocale() as Locale
  const { availableWorkspaces, currentOrganization } = useWorkspace()

  const workspaceName = useMemo(() => {
    const map = new Map(availableWorkspaces.map((workspace) => [workspace.id, workspace.name]))
    return (id: string) => map.get(id) ?? "—"
  }, [availableWorkspaces])

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [summary, setSummary] = useState<InvoiceSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Settings -> إعدادات الإيصال -- read live here too (not just on the Cashier screen) so a
  // reprint of an older invoice from this page shows today's title/description, same as
  // ThermalInvoiceReceipt's own sellerLogoUrl prop already does.
  const [posSettings, setPosSettings] = useState<PosSettings>(DEFAULT_POS_SETTINGS)
  useEffect(() => {
    let cancelled = false
    posSettingsService
      .get()
      .then((settings) => {
        if (!cancelled) setPosSettings(settings)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

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
      setLoadError(status === 403 ? t("page.loadError.forbidden") : t("page.loadError.generic"))
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

  // "الإبلاغ إلى الهيئة" -- see PosInvoicesService.reportToZatca(). Never automatic at checkout;
  // only ever offered once an invoice was actually signed by a ZATCA production device
  // (zatcaSigned) and hasn't been reported yet. Updates both the selected-detail copy and the
  // list row in place, so the panel reflects the new status without a full reload.
  const [reportingZatcaId, setReportingZatcaId] = useState<string | null>(null)
  async function reportInvoiceToZatca(invoice: Invoice) {
    setReportingZatcaId(invoice.id)
    try {
      const result = await posInvoicesService.reportToZatca(invoice.id)
      const reportedAt = new Date().toISOString()
      const patch = { zatcaStatus: result.status, zatcaReportedAt: reportedAt }
      setInvoices((current) =>
        current.map((item) => (item.id === invoice.id ? { ...item, ...patch } : item))
      )
      setSelectedInvoice((current) =>
        current && current.id === invoice.id ? { ...current, ...patch } : current
      )
      toast.success(t("detail.toasts.reportSuccess", { status: result.status }))
    } catch (error) {
      const code = error instanceof AppError ? error.code : undefined
      toast.error(
        code === "POS_INVOICE_ALREADY_REPORTED_TO_ZATCA"
          ? t("detail.toasts.alreadyReported")
          : code === "POS_INVOICE_NOT_ZATCA_SIGNED"
            ? t("detail.toasts.notSigned")
            : t("detail.toasts.reportFailed")
      )
    } finally {
      setReportingZatcaId(null)
    }
  }

  // A real, itemized return (إشعار دائن) -- see PosInvoicesService.createReturn(). Replaces what
  // used to be a single "mark the whole invoice returned" click: the dialog lets the cashier name
  // exactly which lines, and how many units of each, are actually being returned, defaulting
  // every line's quantity to nothing so an accidental full return can never happen by mistake.
  const [returnTarget, setReturnTarget] = useState<Invoice | null>(null)
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({})
  const [returnNotes, setReturnNotes] = useState("")
  // One entry per method the refund is actually being given back through, keyed by code -- a
  // refund can now be split across more than one, the same way a sale's own checkout can (see
  // CashierPage's own paymentAmounts). Only a credit/prepaid-kind method's own share ever credits
  // a linked customer's real account balance; cash/card/transfer/bnpl are assumed already handled
  // outside the system.
  const [returnPaymentAmounts, setReturnPaymentAmounts] = useState<Record<string, string>>({})
  const [submittingReturn, setSubmittingReturn] = useState(false)
  // The just-created credit note, printed once immediately after submitting a return -- same
  // "straight to print, no confirmation screen" pattern CashierPage's own checkout uses. Cleared
  // right after that one print so the shared print target (see the bottom of this file) reverts
  // to printing whichever invoice is selected, same as before.
  const [lastReturn, setLastReturn] = useState<InvoiceReturn | null>(null)
  const [lastReturnQrDataUrl, setLastReturnQrDataUrl] = useState<string | null>(null)

  // A live estimate of what this return will actually total, from the same per-unit net/tax rate
  // createReturn() itself prorates from (item.netAmount + item.taxAmount, divided by the line's
  // own full quantity) -- close enough to size the payment tiles below by; the backend re-derives
  // the real figure from line_net_amount and is what actually gets charged.
  const returnPreviewTotal = useMemo(() => {
    if (!returnTarget) return 0
    const raw = returnTarget.items.reduce((sum, item) => {
      const quantity = Math.trunc(Number(returnQuantities[item.id]) || 0)
      if (quantity <= 0 || item.quantity <= 0) return sum
      const perUnit = (item.netAmount + item.taxAmount) / item.quantity
      return sum + perUnit * quantity
    }, 0)
    return Math.round(raw * 100) / 100
  }, [returnTarget, returnQuantities])

  const returnPaymentEntries = useMemo(
    () =>
      Object.entries(returnPaymentAmounts)
        .map(([code, value]) => ({ code, amount: Math.round((Number(value) || 0) * 100) / 100 }))
        .filter((entry) => entry.amount > 0),
    [returnPaymentAmounts]
  )
  const returnPaymentTotal = useMemo(
    () =>
      Math.round(returnPaymentEntries.reduce((sum, entry) => sum + entry.amount, 0) * 100) / 100,
    [returnPaymentEntries]
  )

  function openReturnDialog(invoice: Invoice) {
    setReturnTarget(invoice)
    // Default every line to its own full remaining quantity -- returning the whole invoice is
    // then just "open and submit"; a partial return is still one edit away by typing over a
    // line's own number.
    const fullQuantities = Object.fromEntries(
      invoice.items
        .filter((item) => item.quantity - item.returnedQuantity > 0)
        .map((item) => [item.id, String(item.quantity - item.returnedQuantity)])
    )
    setReturnQuantities(fullQuantities)
    setReturnNotes("")
    // Pre-selects the invoice's own original method for the full (currently full-remaining)
    // total, so a straight full return is still just "open and submit" -- tapping a different
    // tile, or editing quantities and re-tapping one, replaces this.
    const enabledMethods = paymentMethods.filter((method) => method.enabled)
    const sameAsOriginal = enabledMethods.find(
      (method) => method.code === invoice.paymentMethodCode
    )
    const defaultCode = sameAsOriginal?.code ?? enabledMethods[0]?.code
    const previewTotal = invoice.items.reduce((sum, item) => {
      const quantity = Math.trunc(Number(fullQuantities[item.id]) || 0)
      if (quantity <= 0 || item.quantity <= 0) return sum
      return sum + ((item.netAmount + item.taxAmount) / item.quantity) * quantity
    }, 0)
    setReturnPaymentAmounts(
      defaultCode ? { [defaultCode]: (Math.round(previewTotal * 100) / 100).toFixed(2) } : {}
    )
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
      toast.error(t("returnDialog.toasts.selectQuantity"))
      return
    }
    if (returnPaymentEntries.length === 0) {
      toast.error(t("returnDialog.toasts.selectPaymentMethod"))
      return
    }
    if (Math.abs(returnPaymentTotal - returnPreviewTotal) > 0.01) {
      toast.error(
        t("returnDialog.toasts.amountMismatch", {
          amount: formatAmount(returnPaymentTotal, locale),
        })
      )
      return
    }

    setSubmittingReturn(true)
    try {
      const created = await posInvoicesService.createReturn(returnTarget.id, {
        items,
        payments: returnPaymentEntries.map((entry) => ({
          paymentMethodCode: entry.code,
          amount: entry.amount,
        })),
        notes: returnNotes.trim() || null,
      })
      toast.success(t("returnDialog.toasts.success", { number: created.returnNumber }))
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
        printThermalReceipt("invoice-print-target")
        setLastReturn(null)
      }, 150)
    } catch {
      toast.error(t("returnDialog.toasts.failed"))
    } finally {
      setSubmittingReturn(false)
    }
  }

  const [isCreateOpen, setIsCreateOpen] = useState(false)

  const statCards = [
    {
      key: "average",
      label: t("page.stats.average"),
      value: summary ? formatAmount(summary.averageCompletedValue, locale) : "—",
      Icon: Calculator,
      tint: "bg-[#eff6ff] text-[#2563eb]",
    },
    {
      key: "cancelled",
      label: t("page.stats.cancelled"),
      value: summary ? String(summary.cancelledCount) : "—",
      Icon: XCircle,
      tint: "bg-[#fef2f2] text-[#dc2626]",
    },
    {
      key: "completed",
      label: t("page.stats.completed"),
      value: summary ? String(summary.completedCount) : "—",
      Icon: CheckCircle2,
      tint: "bg-[#f0fdf4] text-[#15803d]",
    },
    {
      key: "total",
      label: t("page.stats.total"),
      value: summary ? String(summary.totalCount) : "—",
      Icon: FileText,
      tint: "bg-[#eff6ff] text-[#2563eb]",
    },
  ]

  if (loading && invoices.length === 0 && !loadError) {
    return (
      <div
        dir={localeDirection(locale)}
        className={cn("flex items-center gap-2 p-8 text-[13px]", MUTED)}
      >
        <Loader2 className="size-4 animate-spin" />
        {t("page.loading")}
      </div>
    )
  }

  if (loadError) {
    return (
      <div
        dir={localeDirection(locale)}
        className={cn(PANEL, "flex flex-col items-start gap-3 p-6")}
      >
        <p className={cn("text-[13px]", HEADING)}>{loadError}</p>
        <Button variant="outline" onClick={() => void load()}>
          <RotateCcw className="size-4" />
          {t("page.retry")}
        </Button>
      </div>
    )
  }

  return (
    <div dir={localeDirection(locale)} className="flex flex-col gap-5 pb-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className={cn("text-[22px] font-extrabold leading-tight", HEADING)}>
            {t("page.title")}
          </h1>
          <p className={cn("mt-1 text-[13px]", MUTED)}>{t("page.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="outline"
            className="h-11 gap-2 rounded-[10px] border-[#e8edf3] px-4 text-[13px] font-semibold text-[#5b6b85] hover:border-[#c7d9ff] hover:text-[#0d1b3e]"
          >
            <Link href={ROUTES.invoicesReturns}>
              <RotateCcw className="size-4" />
              {t("page.returnedInvoicesLink")}
            </Link>
          </Button>
          <Button
            className="h-11 gap-2 rounded-[10px] bg-[#2563eb] px-4 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus className="size-4" />
            {t("page.newInvoiceButton")}
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
          <div className="mb-4 flex flex-col gap-2.5">
            <div className="relative w-full">
              <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-[#8098b4]" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("page.searchPlaceholder")}
                className={cn(FIELD_CLASS, "ps-9")}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <AppDateRangeFilter value={dateRange} onChange={setDateRange} />

              <AppSearchableSelect
                value={statusFilter}
                onChange={(value) => setStatusFilter(value as StatusFilter)}
                options={getStatusFilterOptions(t)}
                ariaLabel={t("page.filters.statusAriaLabel")}
                triggerClassName={FILTER_TRIGGER_CLASS}
              />

              <AppSearchableSelect
                value={workspaceFilter}
                onChange={setWorkspaceFilter}
                options={[
                  { value: "all", label: t("page.filters.allWorkspaces") },
                  ...availableWorkspaces.map((workspace) => ({
                    value: workspace.id,
                    label: workspace.name,
                  })),
                ]}
                ariaLabel={t("page.filters.workspaceAriaLabel")}
                triggerClassName={cn(FILTER_TRIGGER_CLASS, "w-[190px]")}
              />

              <AppSearchableSelect
                value={paymentMethodFilter}
                onChange={setPaymentMethodFilter}
                options={[
                  { value: "all", label: t("page.filters.allPaymentMethods") },
                  ...paymentMethods.map((method) => ({ value: method.code, label: method.name })),
                ]}
                ariaLabel={t("page.filters.paymentMethodAriaLabel")}
                triggerClassName={FILTER_TRIGGER_CLASS}
              />
            </div>
          </div>

          {invoices.length === 0 ? (
            <div
              className={cn(
                "rounded-[12px] border border-dashed border-[#e8edf3] px-4 py-10 text-center text-[12.5px]",
                MUTED
              )}
            >
              {t("page.empty")}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-center">
                  <thead>
                    <tr>
                      {[
                        {
                          key: "number",
                          label: t("page.table.columns.number"),
                          align: "text-right",
                        },
                        { key: "date", label: t("page.table.columns.date"), align: "text-center" },
                        {
                          key: "customer",
                          label: t("page.table.columns.customer"),
                          align: "text-center",
                        },
                        {
                          key: "workspace",
                          label: t("page.table.columns.workspace"),
                          align: "text-center",
                        },
                        {
                          key: "payment",
                          label: t("page.table.columns.payment"),
                          align: "text-center",
                        },
                        {
                          key: "amount",
                          label: t("page.table.columns.amount"),
                          align: "text-center",
                        },
                        {
                          key: "status",
                          label: t("page.table.columns.status"),
                          align: "text-center",
                        },
                        {
                          key: "actions",
                          label: t("page.table.columns.actions"),
                          align: "text-center",
                        },
                      ].map((column) => (
                        <th
                          key={column.key}
                          className={cn(
                            "border-b border-[#eef2f8] bg-[#f4f7fc] px-3 py-3 text-[11px] font-semibold",
                            HEADING,
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
                            {formatDateTime(invoice.createdAt, locale)}
                          </td>
                          <td className={cn("px-3 py-3.5 text-[12px]", HEADING)}>
                            {invoice.customerName ?? tCashierCommon("cashCustomer")}
                          </td>
                          <td className={cn("px-3 py-3.5 text-[12px]", HEADING)}>
                            {workspaceName(invoice.workspaceId)}
                          </td>
                          <td className={cn("px-3 py-3.5 text-[12px]", HEADING)}>
                            {paymentMethodLabel(invoice)}
                          </td>
                          <td className={cn("px-3 py-3.5 text-[12px] font-semibold", HEADING)}>
                            {formatAmount(invoice.totalAmount, locale)}
                          </td>
                          <td className="px-3 py-3.5">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                                meta.tint
                              )}
                            >
                              <span className={cn("size-1.5 rounded-full", meta.dot)} />
                              {getStatusLabel(invoice.status, t)}
                            </span>
                          </td>
                          <td className="px-3 py-3.5" onClick={(event) => event.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  aria-label={t("page.table.rowActionsAriaLabel")}
                                  className="mx-auto flex size-8 items-center justify-center rounded-lg text-[#0d1b3e] transition-colors hover:bg-[#f2f5fa]"
                                >
                                  ···
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className={cn(
                                  "w-40 rounded-[12px]",
                                  locale === "ar" ? "[direction:rtl]" : "[direction:ltr]"
                                )}
                              >
                                <DropdownMenuItem
                                  className="cursor-pointer text-[12.5px]"
                                  onSelect={() => setSelectedInvoice(invoice)}
                                >
                                  {t("page.table.viewDetails")}
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
                                    {t("page.table.registerReturnAction")}
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
                    {t("page.pagination.showing", {
                      from: (clampedPage - 1) * pageSize + 1,
                      to: Math.min(clampedPage * pageSize, invoices.length),
                      total: invoices.length,
                    })}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={clampedPage <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    aria-label={t("page.pagination.previousAriaLabel")}
                    className="flex size-7 items-center justify-center rounded-[7px] border border-[#e8edf3] bg-white text-[#8098b4] transition-colors hover:border-[#c7d9ff] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="size-3.5 rtl:rotate-180" />
                  </button>
                  <span className="flex size-7 items-center justify-center rounded-[7px] bg-[#2563eb] text-[12.5px] font-bold text-white">
                    {clampedPage}
                  </span>
                  <button
                    type="button"
                    disabled={clampedPage >= pageCount}
                    onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                    aria-label={t("page.pagination.nextAriaLabel")}
                    className="flex size-7 items-center justify-center rounded-[7px] border border-[#e8edf3] bg-white text-[#8098b4] transition-colors hover:border-[#c7d9ff] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronRight className="size-3.5 rtl:rotate-180" />
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
            reportingZatca={reportingZatcaId === selectedInvoice.id}
            onReportZatca={() => void reportInvoiceToZatca(selectedInvoice)}
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
          toast.success(t("page.toasts.createSuccess", { number: invoice.invoiceNumber }))
        }}
      />

      <ReturnDialog
        invoice={returnTarget}
        quantities={returnQuantities}
        onQuantitiesChange={setReturnQuantities}
        notes={returnNotes}
        onNotesChange={setReturnNotes}
        paymentMethods={paymentMethods.filter((method) => method.enabled)}
        paymentAmounts={returnPaymentAmounts}
        onPaymentAmountsChange={setReturnPaymentAmounts}
        previewTotal={returnPreviewTotal}
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
                paymentMethodNames={paymentMethodNameByCode}
              />
            ) : selectedInvoice ? (
              <ThermalInvoiceReceipt
                invoice={selectedInvoice}
                paymentMethodNames={paymentMethodNameByCode}
                sellerLogoUrl={currentOrganization?.logoUrl ?? null}
                receiptTitleLines={
                  posSettings.showReceiptTitle ? posSettings.receiptTitleLines : null
                }
                receiptDescriptionLines={
                  posSettings.showReceiptTitle ? posSettings.receiptDescriptionLines : null
                }
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
        /* The @page height is set dynamically by printThermalReceipt() right before printing --
           see src/lib/print-thermal-receipt.ts for why a fixed height doesn't work reliably. */
      `}</style>
    </div>
  )
}

function InvoiceDetailPanel({
  invoice,
  workspaceName,
  paymentMethodName,
  reportingZatca,
  onReportZatca,
  onClose,
}: {
  invoice: Invoice
  workspaceName: string
  paymentMethodName: string
  reportingZatca: boolean
  onReportZatca: () => void
  onClose: () => void
}) {
  const t = useTranslations("invoices")
  const tCashierCommon = useTranslations("pos.cashier.common")
  const locale = useLocale() as Locale
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
            {getStatusLabel(invoice.status, t)}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("detail.closeAriaLabel")}
          className="flex size-8 items-center justify-center rounded-lg text-[#8098b4] hover:bg-[#f2f5fa]"
        >
          ×
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-y-2.5 text-[12px]">
        <dt className={MUTED}>{t("detail.dateTime")}</dt>
        <dd className={cn("text-right font-semibold", HEADING)}>
          {formatDateTime(invoice.createdAt, locale)}
        </dd>
        <dt className={MUTED}>{t("detail.customer")}</dt>
        <dd className={cn("text-right font-semibold", HEADING)}>
          {invoice.customerName ?? tCashierCommon("cashCustomer")}
        </dd>
        <dt className={MUTED}>{t("detail.phone")}</dt>
        <dd className={cn("text-right font-semibold", HEADING)}>{invoice.customerPhone ?? "—"}</dd>
        <dt className={MUTED}>{t("detail.workspace")}</dt>
        <dd className={cn("text-right font-semibold", HEADING)}>{workspaceName}</dd>
        <dt className={MUTED}>{t("detail.paymentMethod")}</dt>
        <dd className={cn("text-right font-semibold", HEADING)}>{paymentMethodName}</dd>
        {invoice.zatcaSigned ? (
          <>
            <dt className={MUTED}>{t("detail.zatcaStatusLabel")}</dt>
            <dd className={cn("text-right font-semibold", HEADING)}>
              {invoice.zatcaReportedAt
                ? t("detail.zatcaReported", { status: invoice.zatcaStatus ?? "—" })
                : t("detail.zatcaAwaitingReport")}
            </dd>
          </>
        ) : null}
      </dl>

      <div className="border-t border-[#eef2f8] pt-3">
        <p className={cn("mb-2 text-[12.5px] font-bold", HEADING)}>
          {t("detail.productsCount", { count: invoice.items.length })}
        </p>
        <div className="flex flex-col gap-2.5">
          {invoice.items.map((item, index) => (
            <div key={index} className="flex items-center justify-between text-[12px]">
              <div>
                <p className={cn("font-semibold", HEADING)}>{item.productName}</p>
                <p className={MUTED}>
                  {item.quantity} × {formatAmount(item.unitPrice, locale)}
                </p>
              </div>
              <p className={cn("font-semibold", HEADING)}>{formatAmount(item.lineTotal, locale)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-[#eef2f8] pt-3 text-[12.5px]">
        <div className="flex items-center justify-between">
          <span className={MUTED}>{t("detail.subtotal")}</span>
          <span className={HEADING}>{formatAmount(invoice.subtotalAmount, locale)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className={MUTED}>{t("detail.discount")}</span>
          <span className={HEADING}>-{formatAmount(invoice.discountAmount, locale)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className={MUTED}>
            {t("detail.taxWithPercent", { percent: effectiveRatePercent })}
          </span>
          <span className={HEADING}>{formatAmount(invoice.taxAmount, locale)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between rounded-[10px] bg-[#f4f7fc] px-3 py-2.5 text-[14px] font-extrabold">
          <span className={HEADING}>{t("detail.total")}</span>
          <span className="text-[#2563eb]">{formatAmount(invoice.totalAmount, locale)}</span>
        </div>
      </div>

      {invoice.zatcaSigned && !invoice.zatcaReportedAt ? (
        <Button
          className="h-10 w-full gap-2 rounded-[10px] bg-[#1f9d55] text-[12.5px] font-bold text-white hover:bg-[#188045]"
          disabled={reportingZatca}
          onClick={onReportZatca}
        >
          {reportingZatca ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ShieldCheck className="size-4" />
          )}
          {t("detail.reportToZatca")}
        </Button>
      ) : null}

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          className="h-10 flex-1 gap-2 rounded-[10px] border-[#e8edf3] text-[12.5px] font-semibold text-[#5b6b85] hover:border-[#c7d9ff] hover:text-[#0d1b3e]"
          onClick={() => printThermalReceipt("invoice-print-target")}
        >
          <Printer className="size-4" />
          {t("detail.print")}
        </Button>
        <Button
          disabled
          title={t("detail.sendInvoiceDisabledTitle")}
          className="h-10 flex-1 cursor-not-allowed gap-2 rounded-[10px] bg-[#eff6ff] text-[12.5px] font-semibold text-[#2563eb] opacity-70"
        >
          <Send className="size-4" />
          {t("detail.sendInvoice")}
        </Button>
      </div>
    </section>
  )
}

// A per-line quantity picker, not a single "return everything" click -- see createReturn() on
// the backend, which validates every requested quantity against what that specific line still
// actually has left (quantity - returnedQuantity), across however many separate return events
// have already touched it.
// One refund method tile -- tapping the card makes it the sole method for the whole return total
// (clearing any other tile), typing directly into the field builds a deliberate split across more
// than one. Same interaction CashierPage's own checkout payment tiles already use.
function ReturnPaymentTile({
  name,
  amount,
  selected,
  onAmountChange,
  onSelectFull,
}: {
  name: string
  amount: string
  selected: boolean
  onAmountChange: (value: string) => void
  onSelectFull: () => void
}) {
  const t = useTranslations("invoices")
  return (
    <div
      onClick={onSelectFull}
      className={cn(
        "flex min-w-0 cursor-pointer flex-col gap-2 rounded-[12px] border bg-white p-3 transition-colors",
        selected ? "border-black" : "border-[#e5e9f0]"
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded-full border-2",
            selected ? "border-black bg-black" : "border-[#c7d2e0] bg-white"
          )}
        >
          {selected ? <span className="size-1.5 rounded-full bg-white" /> : null}
        </span>
        <span className={cn("truncate text-[13px] font-bold", HEADING)}>{name}</span>
      </div>
      <div dir="ltr" className="relative">
        <Input
          type="number"
          min={0}
          step="0.01"
          value={amount}
          onChange={(event) => onAmountChange(event.target.value)}
          onFocus={(event) => event.target.select()}
          onClick={(event) => event.stopPropagation()}
          placeholder="0.00"
          className="h-10 rounded-[8px] border-[#e8edf3] pe-9 text-left text-[13px]"
        />
        <span className="pointer-events-none absolute inset-y-0 end-3 my-auto h-fit text-[11px] font-semibold text-[#8098b4]">
          {t("returnDialog.currencyUnit")}
        </span>
      </div>
    </div>
  )
}

function ReturnDialog({
  invoice,
  quantities,
  onQuantitiesChange,
  notes,
  onNotesChange,
  paymentMethods,
  paymentAmounts,
  onPaymentAmountsChange,
  previewTotal,
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
  paymentAmounts: Record<string, string>
  onPaymentAmountsChange: (next: Record<string, string>) => void
  previewTotal: number
  submitting: boolean
  onSubmit: () => void
  onClose: () => void
}) {
  const t = useTranslations("invoices")
  const tCommon = useTranslations("common")
  const locale = useLocale() as Locale
  const returnableItems = (invoice?.items ?? []).filter(
    (item) => item.quantity - item.returnedQuantity > 0
  )

  return (
    <Dialog open={invoice !== null} onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent
        className={cn(
          "flex max-h-[85vh] flex-col sm:max-w-[50rem]",
          locale === "ar" ? "[direction:rtl]" : "[direction:ltr]"
        )}
      >
        <DialogHeader className="text-right">
          <DialogTitle className={cn("text-[15px] font-extrabold", HEADING)}>
            {t("returnDialog.title")}
          </DialogTitle>
          <DialogDescription className={cn("text-[12.5px] leading-6", MUTED)}>
            {invoice ? t("returnDialog.description", { number: invoice.invoiceNumber }) : ""}
          </DialogDescription>
        </DialogHeader>

        {returnableItems.length === 0 ? (
          <p className={cn("py-6 text-center text-[12.5px]", MUTED)}>
            {t("returnDialog.noItemsLeft")}
          </p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pe-1">
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
                    <p className="text-[11px] text-[#e0484d]">
                      {t("returnDialog.remainingLabel", { remaining, quantity: item.quantity })}
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

            <div className="flex items-center justify-between rounded-[10px] bg-[#f4f7fc] px-3 py-2.5">
              <span className={cn("text-[13px] font-extrabold", HEADING)}>
                {t("returnDialog.total")}
              </span>
              <span className={cn("text-[14px] font-extrabold", HEADING)}>
                {formatAmount(previewTotal, locale)}
              </span>
            </div>

            <div>
              <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                {t("returnDialog.refundMethodLabel")} <span className="text-[#e0484d]">*</span>
              </Label>
              <div className="grid grid-cols-3 gap-2.5">
                {paymentMethods.map((method) => (
                  <ReturnPaymentTile
                    key={method.code}
                    name={method.name}
                    amount={paymentAmounts[method.code] ?? ""}
                    selected={(Number(paymentAmounts[method.code]) || 0) > 0}
                    onAmountChange={(value) =>
                      onPaymentAmountsChange({ ...paymentAmounts, [method.code]: value })
                    }
                    onSelectFull={() =>
                      onPaymentAmountsChange({ [method.code]: previewTotal.toFixed(2) })
                    }
                  />
                ))}
              </div>
            </div>

            <div>
              <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                {t("returnDialog.notesLabel")}
              </Label>
              <Textarea
                value={notes}
                onChange={(event) => onNotesChange(event.target.value)}
                rows={2}
                placeholder={t("returnDialog.notesPlaceholder")}
                className="resize-none rounded-[10px] border-[#e8edf3] bg-white text-[13px] text-[#0d1b3e] placeholder:text-[#8098b4]"
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {returnableItems.length > 0 ? (
            <Button
              className="h-11 gap-2 rounded-[10px] bg-black px-6 text-[13px] font-semibold text-white hover:bg-[#1a1a1a]"
              disabled={submitting}
              onClick={onSubmit}
            >
              {submitting ? t("returnDialog.submitting") : t("returnDialog.submit")}
            </Button>
          ) : null}
          <Button
            variant="outline"
            className="h-11 rounded-[10px] border-[#e8edf3] px-5 text-[13px] font-semibold text-[#5b6b85]"
            disabled={submitting}
            onClick={onClose}
          >
            {tCommon("cancel")}
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
  const t = useTranslations("invoices")
  const tCommon = useTranslations("common")
  const tCashierCommon = useTranslations("pos.cashier.common")
  const locale = useLocale() as Locale
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
    items: lines.length > 0 ? null : t("createDialog.validation.itemsRequired"),
    paymentMethod: paymentMethodCode ? null : t("createDialog.validation.paymentMethodRequired"),
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
      if (status === 403) {
        toast.error(t("createDialog.toasts.forbidden"), {
          description: t("createDialog.toasts.forbiddenDescription"),
        })
      } else if (
        error instanceof AppError &&
        error.code === "POS_INVOICE_OUT_OF_STOCK_SALE_NOT_ALLOWED"
      ) {
        // See CashierPage.tsx's identical handling for why the product name is pulled out of the
        // message text itself (INVOICE_ERRORS.outOfStockSaleNotAllowed, invoices-service.ts).
        const product = /^"([^"]+)"/.exec(error.message)?.[1]
        toast.error(
          product
            ? t("createDialog.toasts.outOfStock", { product })
            : t("createDialog.toasts.outOfStockGeneric"),
          { description: t("createDialog.toasts.outOfStockDescription") }
        )
      } else {
        toast.error(t("createDialog.toasts.genericError"))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent
        className={cn("sm:max-w-[30rem]", locale === "ar" ? "[direction:rtl]" : "[direction:ltr]")}
      >
        <DialogHeader className="text-right">
          <DialogTitle className={cn("text-[15px] font-extrabold", HEADING)}>
            {t("createDialog.title")}
          </DialogTitle>
          <DialogDescription className={cn("text-[12.5px] leading-6", MUTED)}>
            {t("createDialog.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pe-1">
          <div>
            <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
              {t("createDialog.addProductLabel")} <span className="text-[#e0484d]">*</span>
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-[#8098b4]" />
              <Input
                value={productQuery}
                onChange={(event) => setProductQuery(event.target.value)}
                placeholder={t("createDialog.productSearchPlaceholder")}
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
                    <span className={MUTED}>{formatAmount(product.sellingPrice, locale)}</span>
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
                    <p className={cn("text-[11px]", MUTED)}>
                      {formatAmount(line.unitPrice, locale)}
                    </p>
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
                    aria-label={tCommon("delete")}
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
                {t("createDialog.customerLabel")}
              </Label>
              <Input
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder={tCashierCommon("cashCustomer")}
                className={FIELD_CLASS}
              />
            </div>
            <div>
              <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                {t("createDialog.phoneLabel")}
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
              {t("createDialog.paymentMethodLabel")} <span className="text-[#e0484d]">*</span>
            </Label>
            <AppSelect value={paymentMethodCode} onValueChange={setPaymentMethodCode}>
              <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                <AppSelectValue placeholder={t("createDialog.paymentMethodPlaceholder")} />
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
              {t("createDialog.discountLabel")}
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
              <span className={MUTED}>{t("createDialog.subtotal")}</span>
              <span className={HEADING}>{formatAmount(subtotal, locale)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className={MUTED}>{t("createDialog.discount")}</span>
              <span className={HEADING}>-{formatAmount(discount, locale)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className={MUTED}>
                {t("createDialog.taxWithPercent", { percent: Math.round(vatRate * 100) })}
              </span>
              <span className={HEADING}>{formatAmount(tax, locale)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[14px] font-extrabold">
              <span className={HEADING}>{t("createDialog.total")}</span>
              <span className="text-[#2563eb]">{formatAmount(total, locale)}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            className="h-11 gap-2 rounded-[10px] bg-[#2563eb] px-6 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
            disabled={saving}
            onClick={() => void submit()}
          >
            {saving ? t("createDialog.saving") : t("createDialog.submit")}
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          </Button>
          <Button
            variant="outline"
            className="h-11 rounded-[10px] border-[#e8edf3] px-5 text-[13px] font-semibold text-[#5b6b85] hover:border-[#c7d9ff] hover:text-[#0d1b3e]"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            {tCommon("cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

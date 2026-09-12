"use client"

// الفواتير -- every point-of-sale sale recorded through pos_invoices, and the page that creates
// new ones ("+ فاتورة جديدة") until the real cashier terminal exists to create them from its own
// checkout flow. Line items are real products (native or synced), payment method is the real
// per-branch payment-methods catalogue, and tax is Saudi Arabia's real 15% VAT -- there is no
// discount-code or tax-configuration system anywhere in the platform, so a discount here is a
// cashier-entered override, not a rule looked up from a table.
//
// "Send invoice" stays honestly disabled: there is no email/SMS/WhatsApp channel wired to an
// invoice anywhere in the platform. "Print" is real -- printing a web page is something a
// browser can actually do, unlike opening a COM port, so it calls window.print() rather than
// pretending and disabling it too.

import { useEffect, useMemo, useState } from "react"
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
  Trash2,
  Wallet,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { AppError } from "@/lib/errors/app-error"
import { cn } from "@/lib/utils"
import { useWorkspace } from "@/features/workspace"
import { DateField } from "@/app/(layout-pages)/eCommerce/add-product/date-field"
import {
  posInvoicesService,
  VAT_RATE,
  type CreateInvoiceItemInput,
  type Invoice,
  type InvoiceStatus,
  type InvoiceSummary,
} from "@/features/pos/services/pos-invoices.service"
import { posPaymentMethodsService } from "@/features/pos/services/pos-payment-methods.service"
import {
  productListService,
  type ProductRecord,
} from "@/features/products/services/product-list.service"

import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
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

const PANEL =
  "rounded-2xl border border-[#e8edf3] bg-white shadow-[0_1px_4px_rgba(15,30,62,0.07),0_0_1px_rgba(15,30,62,0.05)]"
const HEADING = "text-[#0d1b3e]"
const MUTED = "text-[#8098b4]"
const FIELD_CLASS =
  "h-11 rounded-[10px] border-[#e8edf3] bg-white text-[13px] text-[#0d1b3e] placeholder:text-[#8098b4]"
const PAGE_SIZE_OPTIONS = [10, 25, 50]

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
    label: "مردودة",
    tint: "bg-[#fffbeb] text-[#b45309]",
    dot: "bg-[#f59e0b]",
    Icon: RotateCcw,
  },
}

type StatusFilter = "all" | InvoiceStatus

export default function InvoicesPage() {
  const { availableWorkspaces } = useWorkspace()

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
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [search, setSearch] = useState("")

  const backendFilter = useMemo(
    () => ({
      workspaceId: workspaceFilter === "all" ? undefined : workspaceFilter,
      status: statusFilter === "all" ? undefined : statusFilter,
      paymentMethodCode: paymentMethodFilter === "all" ? undefined : paymentMethodFilter,
      from: fromDate || undefined,
      to: toDate || undefined,
    }),
    [workspaceFilter, statusFilter, paymentMethodFilter, fromDate, toDate]
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

  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null)

  const changeStatus = async (invoice: Invoice, status: "cancelled" | "returned") => {
    setStatusBusyId(invoice.id)
    try {
      const updated = await posInvoicesService.setStatus(invoice.id, status)
      toast.success(status === "cancelled" ? "تم إلغاء الفاتورة." : "تم تسجيل الإرجاع.")
      setInvoices((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setSelectedInvoice((current) => (current?.id === updated.id ? updated : current))
      void posInvoicesService.summary(backendFilter).then(setSummary)
    } catch {
      toast.error("تعذر تحديث حالة الفاتورة.")
    } finally {
      setStatusBusyId(null)
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
        <Button
          className="h-11 gap-2 rounded-[10px] bg-[#2563eb] px-4 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
          onClick={() => setIsCreateOpen(true)}
        >
          <Plus className="size-4" />
          فاتورة جديدة
        </Button>
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

            <div className="flex items-center gap-2">
              <DateField
                value={fromDate}
                onChange={setFromDate}
                placeholder="من تاريخ"
                ariaLabel="من تاريخ"
              />
              <span className={cn("text-[12px]", MUTED)}>-</span>
              <DateField
                value={toDate}
                onChange={setToDate}
                placeholder="إلى تاريخ"
                ariaLabel="إلى تاريخ"
              />
            </div>

            <div className="w-[150px]">
              <AppSelect
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as StatusFilter)}
              >
                <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                  <AppSelectValue />
                </AppSelectTrigger>
                <AppSelectContent>
                  <AppSelectItem value="all">جميع الحالات</AppSelectItem>
                  <AppSelectItem value="completed">مكتملة</AppSelectItem>
                  <AppSelectItem value="cancelled">ملغاة</AppSelectItem>
                  <AppSelectItem value="returned">مردودة</AppSelectItem>
                </AppSelectContent>
              </AppSelect>
            </div>

            <div className="w-[150px]">
              <AppSelect value={workspaceFilter} onValueChange={setWorkspaceFilter}>
                <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                  <AppSelectValue />
                </AppSelectTrigger>
                <AppSelectContent>
                  <AppSelectItem value="all">جميع الفروع</AppSelectItem>
                  {availableWorkspaces.map((workspace) => (
                    <AppSelectItem key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
            </div>

            <div className="w-[160px]">
              <AppSelect value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
                <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                  <AppSelectValue />
                </AppSelectTrigger>
                <AppSelectContent>
                  <AppSelectItem value="all">جميع طرق الدفع</AppSelectItem>
                  {paymentMethods.map((method) => (
                    <AppSelectItem key={method.code} value={method.code}>
                      {method.name}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
            </div>
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
                          <td className={cn("px-3 py-3.5 text-[12px]", MUTED)}>
                            {formatDateTime(invoice.createdAt)}
                          </td>
                          <td className={cn("px-3 py-3.5 text-[12px]", MUTED)}>
                            {invoice.customerName ?? "عميل نقدي"}
                          </td>
                          <td className={cn("px-3 py-3.5 text-[12px]", MUTED)}>
                            {workspaceName(invoice.workspaceId)}
                          </td>
                          <td className={cn("px-3 py-3.5 text-[12px]", MUTED)}>
                            {paymentMethodName(invoice.paymentMethodCode)}
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
                                  disabled={statusBusyId === invoice.id}
                                  className="mx-auto flex size-8 items-center justify-center rounded-lg text-[#8098b4] transition-colors hover:bg-[#f2f5fa] hover:text-[#0d1b3e]"
                                >
                                  {statusBusyId === invoice.id ? (
                                    <Loader2 className="size-4 animate-spin" />
                                  ) : (
                                    "···"
                                  )}
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
                                {invoice.status === "completed" ? (
                                  <>
                                    <DropdownMenuItem
                                      className="cursor-pointer text-[12.5px] text-[#b45309]"
                                      onSelect={() => void changeStatus(invoice, "returned")}
                                    >
                                      تسجيل إرجاع
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="cursor-pointer text-[12.5px] text-[#dc2626]"
                                      onSelect={() => void changeStatus(invoice, "cancelled")}
                                    >
                                      إلغاء الفاتورة
                                    </DropdownMenuItem>
                                  </>
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
            paymentMethodName={paymentMethodName(selectedInvoice.paymentMethodCode)}
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
          <span className={MUTED}>الضريبة ({Math.round(VAT_RATE * 100)}٪)</span>
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
  const [products, setProducts] = useState<ProductRecord[]>([])
  useEffect(() => {
    if (!open) return
    void productListService
      .listProducts()
      .catch(() => [])
      .then((list) => setProducts(list ?? []))
  }, [open])

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
  const tax = Math.round(taxable * VAT_RATE * 100) / 100
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
        paymentMethodCode,
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
              <span className={MUTED}>الضريبة ({Math.round(VAT_RATE * 100)}٪)</span>
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

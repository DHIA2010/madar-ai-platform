"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableEmpty,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
} from "@/components/app"
import {
  AppButton,
  AppSearchInput,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/app"

import { crmService, formatDate, platformAdminService } from "../services"
import type {
  CrmInvoice,
  CrmQuote,
  InvoicePaymentMethod,
  InvoiceStatus,
  QuoteStatus,
} from "../types/crm.types"
import type { AdminReceipt } from "../types/platform-admin.types"
import { CustomerPickerDialog } from "./crm-customer-picker"
import { CrmDateRange, SavedViews } from "./crm-filters"
import { INVOICE_STATUS_META, PAYMENT_METHOD_LABEL } from "./madar-admin-crm-invoice"
import { QUOTE_STATUS_META } from "./madar-admin-crm-quote"
import { ReceiptDialog } from "./receipt-dialog"

const money = (amount: number) =>
  `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} ر.س`

function StatusTabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T | "all"
  options: [T | "all", string][]
  onChange: (value: T | "all") => void
}) {
  return (
    <div className="flex w-fit flex-wrap rounded-[10px] border border-border/60 bg-card p-1">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            "rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors",
            value === key
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// The search box, date range and saved views every documents list shares.
function DocumentsToolbar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      {children}
    </div>
  )
}

interface QuoteFilters extends Record<string, unknown> {
  status: QuoteStatus | "all"
  search: string
  from?: string
  to?: string
}

interface InvoiceFilters extends Record<string, unknown> {
  status: InvoiceStatus | "all"
  method: InvoicePaymentMethod | "all"
  search: string
  dateField: "created" | "paid"
  activation: "activated" | "pending" | "all"
  // Sales team's invoices, the automatic ones (in-app subscription payments), or both.
  source: "all" | "sales" | "auto"
  from?: string
  to?: string
}

// Whether paying switched the customer's Madar account on yet (mirrors activationState).
function activationChip(invoice: CrmInvoice) {
  if (invoice.activatedAt) {
    return { label: "مُفعّل", chip: "bg-emerald-50 text-emerald-700" }
  }
  if (invoice.status === "paid" && (invoice.hasPackages || !invoice.organizationId)) {
    return { label: "بانتظار التفعيل", chip: "bg-amber-50 text-amber-700" }
  }
  return null
}

// Waits for typing to pause before the search reaches the API.
function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

// عروض الأسعار: every quote the sales team has written.
export function MadarAdminCrmQuotes() {
  const router = useRouter()
  const [filters, setFilters] = useState<QuoteFilters>({ status: "all", search: "" })
  const query = useDebounced(filters)
  const [quotes, setQuotes] = useState<CrmQuote[] | null>(null)
  const [picking, setPicking] = useState(false)
  const update = (patch: Partial<QuoteFilters>) =>
    setFilters((current) => ({ ...current, ...patch }))

  useEffect(() => {
    let active = true
    crmService
      .listQuotes({
        status: query.status,
        search: query.search.trim() || undefined,
        from: query.from,
        to: query.to,
      })
      .then((result) => {
        if (active) setQuotes(result)
      })
      .catch(() => toast.error("تعذر تحميل عروض الأسعار."))
    return () => {
      active = false
    }
  }, [query])

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">عروض الأسعار</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            أنشئ عرض سعر لأي عميل، وحوّله إلى فاتورة عند موافقته.
          </p>
        </div>
        <AppButton
          icon={<Plus className="size-4" />}
          className="h-10 rounded-[10px]"
          onClick={() => setPicking(true)}
        >
          عرض سعر جديد
        </AppButton>
      </div>
      <CustomerPickerDialog
        open={picking}
        title="عرض سعر جديد"
        onClose={() => setPicking(false)}
        onPick={(leadId) => router.push(ROUTES.madarAdminCrmNewQuote(leadId))}
      />
      <DocumentsToolbar>
        <AppSearchInput
          placeholder="ابحث بالرقم أو اسم العميل..."
          value={filters.search}
          onChange={(event) => update({ search: event.target.value })}
          wrapperClassName="w-full sm:w-72"
          className="h-10 rounded-[10px]"
        />
        <CrmDateRange
          from={filters.from}
          to={filters.to}
          placeholder="تاريخ العرض"
          onChange={(range) => update(range)}
        />
        <SavedViews
          page="quotes"
          current={filters}
          onApply={(definition) =>
            setFilters({ status: "all", search: "", ...(definition as Partial<QuoteFilters>) })
          }
        />
      </DocumentsToolbar>
      <StatusTabs
        value={filters.status}
        onChange={(status) => update({ status })}
        options={[
          ["all", "الكل"],
          ["draft", QUOTE_STATUS_META.draft.label],
          ["sent", QUOTE_STATUS_META.sent.label],
          ["accepted", QUOTE_STATUS_META.accepted.label],
          ["rejected", QUOTE_STATUS_META.rejected.label],
          ["converted", QUOTE_STATUS_META.converted.label],
        ]}
      />
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        <AppTable>
          <AppTableHeader>
            <AppTableRow>
              <AppTableHead>الرقم</AppTableHead>
              <AppTableHead>العميل</AppTableHead>
              <AppTableHead>التاريخ</AppTableHead>
              <AppTableHead>صالح حتى</AppTableHead>
              <AppTableHead>الإجمالي</AppTableHead>
              <AppTableHead>الحالة</AppTableHead>
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {(quotes ?? []).map((quote) => (
              <AppTableRow
                key={quote.id}
                className="cursor-pointer"
                onClick={() => router.push(ROUTES.madarAdminCrmQuote(quote.id))}
              >
                <AppTableCell className="font-mono text-sm font-bold">{quote.number}</AppTableCell>
                <AppTableCell>
                  <Link
                    href={ROUTES.madarAdminCrmLead(quote.leadId)}
                    onClick={(event) => event.stopPropagation()}
                    className="font-semibold text-primary hover:underline"
                  >
                    {quote.customer.companyName}
                  </Link>
                </AppTableCell>
                <AppTableCell className="text-sm text-muted-foreground">
                  {formatDate(quote.createdAt)}
                </AppTableCell>
                <AppTableCell className="text-sm text-muted-foreground">
                  {formatDate(quote.validUntil)}
                </AppTableCell>
                <AppTableCell className="font-semibold">{money(quote.totals.total)}</AppTableCell>
                <AppTableCell>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-bold",
                      QUOTE_STATUS_META[quote.status].chip
                    )}
                  >
                    {QUOTE_STATUS_META[quote.status].label}
                  </span>
                </AppTableCell>
              </AppTableRow>
            ))}
          </AppTableBody>
        </AppTable>
        {quotes === null ? (
          <div className="h-32 animate-pulse bg-muted/40" />
        ) : quotes.length === 0 ? (
          <AppTableEmpty
            title="لا توجد عروض أسعار"
            description="أنشئ عرض سعر من صفحة العميل المحتمل."
          />
        ) : null}
      </div>
    </div>
  )
}

// فواتير المبيعات: invoices made from quotes, paid online or by bank transfer.
// One row of the merged list: a sales invoice, or an invoice Madar issued automatically when a
// customer paid a subscription in the app (by card, or a bank transfer staff approved).
type InvoiceRowItem =
  | { kind: "sales"; invoice: CrmInvoice }
  | { kind: "auto"; receipt: AdminReceipt }

const AUTO_SOURCE_LABEL: Record<AdminReceipt["sourceType"], string> = {
  card: "تلقائية — دفع بالبطاقة",
  bank_transfer: "تلقائية — تحويل بنكي",
}

// Every automatic invoice (the receipts list is paged: up to 500 here).
async function loadAutoInvoices(): Promise<AdminReceipt[]> {
  const all: AdminReceipt[] = []
  for (let page = 1; page <= 5; page++) {
    const result = await platformAdminService.listReceipts({}, page, 100)
    all.push(...result.items)
    if (all.length >= result.total || result.items.length === 0) break
  }
  return all
}

function autoMatches(receipt: AdminReceipt, filters: InvoiceFilters) {
  if (filters.source === "sales") return false
  if (filters.status === "unpaid" || filters.status === "void") return false
  if (filters.activation === "pending") return false
  if (filters.method !== "all" && filters.method !== receipt.sourceType) return false
  const day = receipt.paidAt.slice(0, 10)
  if (filters.from && day < filters.from) return false
  if (filters.to && day > filters.to) return false
  const search = filters.search.trim().toLowerCase()
  return (
    !search ||
    [receipt.number, receipt.customer.name, receipt.customer.email]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search))
  )
}

// فواتير المبيعات: the sales team's invoices and the ones issued automatically for in-app payments,
// in one list (newest first) -- the source column says which.
export function MadarAdminCrmInvoices() {
  const router = useRouter()
  const [filters, setFilters] = useState<InvoiceFilters>({
    status: "all",
    method: "all",
    search: "",
    dateField: "created",
    activation: "all",
    source: "all",
  })
  const query = useDebounced(filters)
  const update = (patch: Partial<InvoiceFilters>) =>
    setFilters((current) => ({ ...current, ...patch }))
  const [invoices, setInvoices] = useState<CrmInvoice[] | null>(null)
  // Staff without billing access (the Sales role) just don't get the automatic ones.
  const [autoInvoices, setAutoInvoices] = useState<AdminReceipt[] | null>(null)
  const [receiptId, setReceiptId] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  // When the list arrived: "overdue" is judged from then.
  const [loadedAt, setLoadedAt] = useState(0)

  useEffect(() => {
    let active = true
    loadAutoInvoices()
      .then((result) => {
        if (active) setAutoInvoices(result)
      })
      .catch(() => {
        if (active) setAutoInvoices([])
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    if (query.source === "auto") {
      Promise.resolve().then(() => {
        if (active) setInvoices([])
      })
      return () => {
        active = false
      }
    }
    crmService
      .listInvoices({
        status: query.status,
        method: query.method,
        search: query.search.trim() || undefined,
        dateField: query.dateField,
        activation: query.activation,
        from: query.from,
        to: query.to,
      })
      .then((result) => {
        if (!active) return
        setInvoices(result)
        setLoadedAt(Date.now())
      })
      .catch(() => toast.error("تعذر تحميل الفواتير."))
    return () => {
      active = false
    }
  }, [query])

  const loading = invoices === null || autoInvoices === null
  const rows: InvoiceRowItem[] = [
    ...(invoices ?? []).map((invoice) => ({ kind: "sales" as const, invoice })),
    ...(autoInvoices ?? [])
      .filter((receipt) => autoMatches(receipt, query))
      .map((receipt) => ({ kind: "auto" as const, receipt })),
  ].sort((left, right) => {
    const at = (row: InvoiceRowItem) =>
      row.kind === "sales" ? row.invoice.createdAt : row.receipt.paidAt
    return at(right).localeCompare(at(left))
  })
  const hasAuto = (autoInvoices ?? []).length > 0

  const unpaidTotal = (invoices ?? [])
    .filter((invoice) => invoice.status === "unpaid")
    .reduce((sum, invoice) => sum + invoice.totals.total, 0)

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <CustomerPickerDialog
        open={picking}
        title="فاتورة جديدة"
        onClose={() => setPicking(false)}
        onPick={(leadId) => router.push(ROUTES.madarAdminCrmNewInvoice(leadId))}
      />
      <ReceiptDialog receiptId={receiptId} onClose={() => setReceiptId(null)} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">فواتير المبيعات</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            فواتير فريق المبيعات، والفواتير التي تصدر تلقائيًا عند دفع العملاء اشتراكاتهم من
            التطبيق.
            {unpaidTotal > 0 ? (
              <span className="ms-2 font-semibold text-amber-700">مستحق: {money(unpaidTotal)}</span>
            ) : null}
          </p>
        </div>
        <AppButton
          icon={<Plus className="size-4" />}
          className="h-10 rounded-[10px]"
          onClick={() => setPicking(true)}
        >
          فاتورة جديدة
        </AppButton>
      </div>
      <DocumentsToolbar>
        <AppSearchInput
          placeholder="ابحث بالرقم أو اسم العميل..."
          value={filters.search}
          onChange={(event) => update({ search: event.target.value })}
          wrapperClassName="w-full sm:w-72"
          className="h-10 rounded-[10px]"
        />
        {hasAuto ? (
          <AppSelect
            value={filters.source}
            onValueChange={(value) => update({ source: value as InvoiceFilters["source"] })}
          >
            <AppSelectTrigger className="h-10 w-[170px] rounded-[10px] text-sm">
              <AppSelectValue />
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectItem value="all">كل المصادر</AppSelectItem>
              <AppSelectItem value="sales">فريق المبيعات</AppSelectItem>
              <AppSelectItem value="auto">تلقائية من التطبيق</AppSelectItem>
            </AppSelectContent>
          </AppSelect>
        ) : null}
        <AppSelect
          value={filters.method}
          onValueChange={(value) => update({ method: value as InvoiceFilters["method"] })}
        >
          <AppSelectTrigger className="h-10 w-[160px] rounded-[10px] text-sm">
            <AppSelectValue />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectItem value="all">كل طرق الدفع</AppSelectItem>
            {(Object.keys(PAYMENT_METHOD_LABEL) as InvoicePaymentMethod[]).map((method) => (
              <AppSelectItem key={method} value={method}>
                {PAYMENT_METHOD_LABEL[method]}
              </AppSelectItem>
            ))}
          </AppSelectContent>
        </AppSelect>
        <AppSelect
          value={filters.dateField}
          onValueChange={(value) => update({ dateField: value as InvoiceFilters["dateField"] })}
        >
          <AppSelectTrigger className="h-10 w-[150px] rounded-[10px] text-sm">
            <AppSelectValue />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectItem value="created">تاريخ الإصدار</AppSelectItem>
            <AppSelectItem value="paid">تاريخ الدفع</AppSelectItem>
          </AppSelectContent>
        </AppSelect>
        <AppSelect
          value={filters.activation}
          onValueChange={(value) => update({ activation: value as InvoiceFilters["activation"] })}
        >
          <AppSelectTrigger className="h-10 w-[160px] rounded-[10px] text-sm">
            <AppSelectValue />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectItem value="all">كل حالات التفعيل</AppSelectItem>
            <AppSelectItem value="activated">مُفعّل</AppSelectItem>
            <AppSelectItem value="pending">بانتظار التفعيل</AppSelectItem>
          </AppSelectContent>
        </AppSelect>
        <CrmDateRange from={filters.from} to={filters.to} onChange={(range) => update(range)} />
        <SavedViews
          page="invoices"
          current={filters}
          onApply={(definition) =>
            setFilters({
              status: "all",
              method: "all",
              search: "",
              dateField: "created",
              activation: "all",
              source: "all",
              ...(definition as Partial<InvoiceFilters>),
            })
          }
        />
      </DocumentsToolbar>
      <StatusTabs
        value={filters.status}
        onChange={(status) => update({ status })}
        options={[
          ["all", "الكل"],
          ["unpaid", INVOICE_STATUS_META.unpaid.label],
          ["paid", INVOICE_STATUS_META.paid.label],
          ["void", INVOICE_STATUS_META.void.label],
        ]}
      />
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        <AppTable>
          <AppTableHeader>
            <AppTableRow>
              <AppTableHead>الرقم</AppTableHead>
              <AppTableHead>العميل</AppTableHead>
              <AppTableHead>التاريخ</AppTableHead>
              <AppTableHead>الاستحقاق</AppTableHead>
              <AppTableHead>الإجمالي</AppTableHead>
              <AppTableHead>الدفع</AppTableHead>
              <AppTableHead>الحالة</AppTableHead>
              <AppTableHead>التفعيل</AppTableHead>
              {hasAuto ? <AppTableHead>المصدر</AppTableHead> : null}
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {rows.map((row) => {
              if (row.kind === "auto") {
                const receipt = row.receipt
                return (
                  <AppTableRow
                    key={`auto-${receipt.id}`}
                    className="cursor-pointer"
                    onClick={() => setReceiptId(receipt.id)}
                  >
                    <AppTableCell className="font-mono text-sm font-bold">
                      {receipt.number}
                    </AppTableCell>
                    <AppTableCell>
                      <Link
                        href={ROUTES.madarAdminCustomer(receipt.organizationId)}
                        onClick={(event) => event.stopPropagation()}
                        className="font-semibold text-primary hover:underline"
                      >
                        {receipt.customer.name}
                      </Link>
                    </AppTableCell>
                    <AppTableCell className="text-sm text-muted-foreground">
                      {formatDate(receipt.paidAt)}
                    </AppTableCell>
                    <AppTableCell className="text-sm text-muted-foreground">—</AppTableCell>
                    <AppTableCell className="font-semibold">
                      {money(receipt.amountHalalas / 100)}
                    </AppTableCell>
                    <AppTableCell className="text-sm text-muted-foreground">
                      {PAYMENT_METHOD_LABEL[receipt.sourceType]}
                    </AppTableCell>
                    <AppTableCell>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-bold",
                          INVOICE_STATUS_META.paid.chip
                        )}
                      >
                        {INVOICE_STATUS_META.paid.label}
                      </span>
                    </AppTableCell>
                    <AppTableCell>
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                        مُفعّل
                      </span>
                    </AppTableCell>
                    <AppTableCell>
                      <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-bold whitespace-nowrap text-sky-700">
                        {AUTO_SOURCE_LABEL[receipt.sourceType]}
                      </span>
                    </AppTableCell>
                  </AppTableRow>
                )
              }
              const invoice = row.invoice
              const overdue =
                invoice.status === "unpaid" &&
                invoice.dueDate !== null &&
                new Date(invoice.dueDate).getTime() < loadedAt - 86_400_000
              const activation = activationChip(invoice)
              return (
                <AppTableRow
                  key={invoice.id}
                  className="cursor-pointer"
                  onClick={() => router.push(ROUTES.madarAdminCrmInvoice(invoice.id))}
                >
                  <AppTableCell className="font-mono text-sm font-bold">
                    {invoice.number}
                  </AppTableCell>
                  <AppTableCell>
                    <Link
                      href={ROUTES.madarAdminCrmLead(invoice.leadId)}
                      onClick={(event) => event.stopPropagation()}
                      className="font-semibold text-primary hover:underline"
                    >
                      {invoice.customer.companyName}
                    </Link>
                  </AppTableCell>
                  <AppTableCell className="text-sm text-muted-foreground">
                    {formatDate(invoice.createdAt)}
                  </AppTableCell>
                  <AppTableCell
                    className={cn(
                      "text-sm",
                      overdue ? "font-semibold text-rose-600" : "text-muted-foreground"
                    )}
                  >
                    {formatDate(invoice.dueDate)}
                  </AppTableCell>
                  <AppTableCell className="font-semibold">
                    {money(invoice.totals.total)}
                  </AppTableCell>
                  <AppTableCell className="text-sm text-muted-foreground">
                    {invoice.paymentMethod ? PAYMENT_METHOD_LABEL[invoice.paymentMethod] : "—"}
                  </AppTableCell>
                  <AppTableCell>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-bold",
                        INVOICE_STATUS_META[invoice.status].chip
                      )}
                    >
                      {INVOICE_STATUS_META[invoice.status].label}
                    </span>
                  </AppTableCell>
                  <AppTableCell>
                    {activation ? (
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-bold",
                          activation.chip
                        )}
                      >
                        {activation.label}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </AppTableCell>
                  {hasAuto ? (
                    <AppTableCell className="text-sm text-muted-foreground">—</AppTableCell>
                  ) : null}
                </AppTableRow>
              )
            })}
          </AppTableBody>
        </AppTable>
        {loading ? (
          <div className="h-32 animate-pulse bg-muted/40" />
        ) : rows.length === 0 ? (
          <AppTableEmpty
            title="لا توجد فواتير"
            description="أنشئ فاتورة أو حوّل عرض سعر مقبولًا."
          />
        ) : null}
      </div>
    </div>
  )
}

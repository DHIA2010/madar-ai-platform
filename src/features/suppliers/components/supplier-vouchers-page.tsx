"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowDownCircle, ArrowUpCircle, Eye, Layers, Loader2, Printer, Users } from "lucide-react"
import type { DateRange } from "react-day-picker"
import { createPortal } from "react-dom"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import {
  AppButton,
  AppDateRangeFilter,
  AppSearchableSelect,
  type AppSearchableSelectOption,
  AppSearchInput,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableEmpty,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
} from "@/components/app"

import { useWorkspace } from "@/features/workspace"

import {
  crossFeaturePurchaseGrandTotal,
  useCrossFeaturePurchaseData,
  useSuppliers,
  useSupplierVouchers,
} from "../hooks"
import {
  computeSupplierBalance,
  convertToOrgCurrency,
  isSupportedOrgCurrency,
  voucherService,
} from "../services"
import type { SupplierVoucher, SupplierVoucherPaymentMethod, SupplierVoucherType } from "../types"
import { SupplierAvatar } from "./supplier-avatar"
import { FIELD_CLASS, HEADING, MUTED, PANEL, SupplierPagination } from "./supplier-field"
import {
  formatVoucherAmount,
  PAYMENT_METHOD_NAME,
  SupplierVoucherDialog,
  VOUCHER_TYPE_META,
  VOUCHER_VAT_RATE,
} from "./supplier-voucher-dialog"
import { SupplierVoucherPrintDocument } from "./supplier-voucher-print-document"
import { SupplierVoucherViewDialog } from "./supplier-voucher-view-dialog"

const PAGE_SIZE = 10

const TYPE_FILTER_OPTIONS: AppSearchableSelectOption[] = [
  { value: "all", label: "جميع السندات" },
  {
    value: "receipt",
    label: VOUCHER_TYPE_META.receipt.label,
    icon: VOUCHER_TYPE_META.receipt.icon,
  },
  {
    value: "payment",
    label: VOUCHER_TYPE_META.payment.label,
    icon: VOUCHER_TYPE_META.payment.icon,
  },
]

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Layers
  label: string
  value: string
  tone: string
}) {
  return (
    <div className="flex items-center justify-between rounded-[16px] border border-[#e1e7f0] bg-white p-4">
      <div className="text-right">
        <p className={cn("text-[11px] font-semibold", MUTED)}>{label}</p>
        <p className="mt-1 text-[20px] font-extrabold" style={{ color: tone }}>
          {value}
        </p>
      </div>
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-[12px]"
        style={{ backgroundColor: `${tone}1a`, color: tone }}
      >
        <Icon className="size-5" />
      </span>
    </div>
  )
}

// Entry point for the "سندات الموردين" sidebar item -- lists every manually-recorded سند قبض/صرف
// across all suppliers, with its own سند قبض/صرف creation buttons (a supplier-picking version of
// SupplierStatement's own dialog, since this page isn't scoped to one supplier). Each row still
// links out to that supplier's full ledger (purchases/returns included) via "كشف الحساب".
export function SupplierVouchersPage() {
  const { suppliers } = useSuppliers()
  const { vouchers, isLoading, refetch } = useSupplierVouchers()
  const { purchases, returns } = useCrossFeaturePurchaseData()
  const { currentOrganization } = useWorkspace()
  const rawOrgCurrency = currentOrganization?.currency ?? ""
  const orgCurrency = isSupportedOrgCurrency(rawOrgCurrency) ? rawOrgCurrency : "SAR"

  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<SupplierVoucherType | "all">("all")
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [page, setPage] = useState(1)
  const [viewTarget, setViewTarget] = useState<SupplierVoucher | null>(null)
  const [printTarget, setPrintTarget] = useState<SupplierVoucher | null>(null)

  // Same pattern as PurchasesListPage/ReturnsListPage's own print target: give the portaled node
  // a tick to land before window.print() reads it, then tear it down once printing finishes.
  useEffect(() => {
    if (!printTarget) return
    const handleAfterPrint = () => setPrintTarget(null)
    window.addEventListener("afterprint", handleAfterPrint)
    const timer = setTimeout(() => window.print(), 50)
    return () => {
      clearTimeout(timer)
      window.removeEventListener("afterprint", handleAfterPrint)
    }
  }, [printTarget])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return vouchers.filter((voucher) => {
      if (typeFilter !== "all" && voucher.type !== typeFilter) return false
      if (query) {
        const matches =
          voucher.supplierName.toLowerCase().includes(query) ||
          voucher.reference.toLowerCase().includes(query)
        if (!matches) return false
      }
      const occurred = new Date(voucher.transactionDate)
      if (dateRange?.from && occurred < dateRange.from) return false
      if (dateRange?.to && occurred > dateRange.to) return false
      return true
    })
  }, [vouchers, search, typeFilter, dateRange])

  const totalReceipts = useMemo(
    () => vouchers.filter((v) => v.type === "receipt").reduce((sum, v) => sum + v.amount, 0),
    [vouchers]
  )
  const totalPayments = useMemo(
    () => vouchers.filter((v) => v.type === "payment").reduce((sum, v) => sum + v.amount, 0),
    [vouchers]
  )
  const distinctSuppliers = useMemo(
    () => new Set(vouchers.map((v) => v.supplierId)).size,
    [vouchers]
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  // --- سند قبض / سند صرف dialog -------------------------------------------------------------

  const [dialogType, setDialogType] = useState<SupplierVoucherType | null>(null)
  const [supplierId, setSupplierId] = useState("")
  const [invoiceId, setInvoiceId] = useState("")
  const [amount, setAmount] = useState("")
  const [taxInclusive, setTaxInclusive] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<SupplierVoucherPaymentMethod | "">("")
  const [transactionDate, setTransactionDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [notes, setNotes] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  // Converted into the org's default currency before the balance is summed -- purchases/returns
  // can carry a different supplier currency (SAR or USD); see currency-conversion.service.ts.
  const purchaseIdToCurrency = useMemo(
    () => new Map(purchases.map((purchase) => [purchase.id, purchase.currency])),
    [purchases]
  )
  const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId)
  const selectedSupplierBalance = selectedSupplier
    ? computeSupplierBalance(
        selectedSupplier.id,
        purchases.map((purchase) => ({
          supplierId: purchase.supplierId,
          grandTotal:
            convertToOrgCurrency(
              crossFeaturePurchaseGrandTotal(purchase),
              purchase.currency,
              orgCurrency
            ) ?? 0,
        })),
        returns.map((entry) => ({
          supplierId: entry.supplierId,
          returnAmount:
            convertToOrgCurrency(
              entry.returnAmount,
              purchaseIdToCurrency.get(entry.purchaseId),
              orgCurrency
            ) ?? 0,
        })),
        vouchers
      )
    : 0

  const invoiceOptions = useMemo<AppSearchableSelectOption[]>(() => {
    if (!supplierId) return []
    return purchases
      .filter((purchase) => purchase.supplierId === supplierId)
      .map((purchase) => ({
        value: purchase.id,
        label: purchase.code,
        hint: formatVoucherAmount(crossFeaturePurchaseGrandTotal(purchase)),
      }))
  }, [purchases, supplierId])

  const selectedInvoiceAmount = useMemo(() => {
    const invoice = purchases.find((purchase) => purchase.id === invoiceId)
    return invoice ? crossFeaturePurchaseGrandTotal(invoice) : null
  }, [purchases, invoiceId])

  function handleSupplierIdChange(id: string) {
    setSupplierId(id)
    // A chosen invoice belongs to the previous supplier -- switching suppliers invalidates it.
    setInvoiceId("")
  }

  function openDialog(type: SupplierVoucherType) {
    setDialogType(type)
    setSupplierId("")
    setInvoiceId("")
    setAmount("")
    setTaxInclusive(false)
    setPaymentMethod("")
    setTransactionDate(new Date().toISOString().slice(0, 10))
    setNotes("")
  }

  function closeDialog() {
    setDialogType(null)
  }

  async function submitVoucher() {
    if (!dialogType) return
    const supplier = suppliers.find((entry) => entry.id === supplierId)
    if (!supplier) {
      toast.error("اختر المورد.")
      return
    }
    const numericAmount = Math.round((Number(amount) || 0) * 100) / 100
    if (!(numericAmount > 0)) {
      toast.error("أدخل مبلغاً صحيحاً.")
      return
    }
    if (!paymentMethod) {
      toast.error("اختر طريقة الدفع.")
      return
    }
    if (!transactionDate) {
      toast.error("اختر تاريخ السند.")
      return
    }

    setIsSaving(true)
    try {
      const taxAmount = taxInclusive
        ? Math.round((numericAmount - numericAmount / (1 + VOUCHER_VAT_RATE)) * 100) / 100
        : 0
      const linkedInvoice = purchases.find((purchase) => purchase.id === invoiceId)
      const voucher = await voucherService.create({
        supplierId: supplier.id,
        purchaseId: linkedInvoice?.id ?? null,
        type: dialogType,
        amount: numericAmount,
        taxInclusive,
        taxAmount,
        paymentMethod,
        notes: notes.trim(),
        transactionDate,
      })
      toast.success(`تم حفظ ${VOUCHER_TYPE_META[dialogType].label} ${voucher.reference}.`)
      closeDialog()
      void refetch()
    } catch {
      toast.error("تعذر حفظ السند. حاول مرة أخرى.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className={cn("text-2xl font-bold", HEADING)}>سندات الموردين</h1>
          <p className={cn("mt-1 text-sm", MUTED)}>
            سجّل سندات القبض والصرف مع الموردين وتابع رصيد كل مورد من هنا.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AppButton
            icon={<ArrowDownCircle className="size-4" />}
            className="h-11 gap-1.5 rounded-[10px] bg-[#16a34a] px-4 text-[13px] font-semibold text-white hover:bg-[#15803d]"
            onClick={() => openDialog("receipt")}
          >
            سند قبض
          </AppButton>
          <AppButton
            icon={<ArrowUpCircle className="size-4" />}
            className="h-11 gap-1.5 rounded-[10px] bg-[#dc2626] px-4 text-[13px] font-semibold text-white hover:bg-[#b91c1c]"
            onClick={() => openDialog("payment")}
          >
            سند صرف
          </AppButton>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={ArrowDownCircle}
          label="إجمالي سندات القبض"
          value={formatVoucherAmount(totalReceipts)}
          tone="#16a34a"
        />
        <StatCard
          icon={ArrowUpCircle}
          label="إجمالي سندات الصرف"
          value={formatVoucherAmount(totalPayments)}
          tone="#dc2626"
        />
        <StatCard
          icon={Layers}
          label="عدد السندات"
          value={String(vouchers.length)}
          tone="#2878ff"
        />
        <StatCard
          icon={Users}
          label="عدد الموردين المرتبطين"
          value={String(distinctSuppliers)}
          tone="#5b6b85"
        />
      </div>

      <div className={cn(PANEL, "flex flex-wrap items-end gap-3 p-4")}>
        <div className="grid gap-1">
          <span className={cn("text-[11px] font-semibold", HEADING)}>البحث</span>
          <AppSearchInput
            placeholder="البحث بالمورد أو رقم السند..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
            wrapperClassName="w-full sm:w-72"
            className={FIELD_CLASS}
          />
        </div>
        <div className="grid min-w-[160px] gap-1">
          <span className={cn("text-[11px] font-semibold", HEADING)}>نوع السند</span>
          <AppSearchableSelect
            value={typeFilter}
            onChange={(next) => {
              setTypeFilter(next as SupplierVoucherType | "all")
              setPage(1)
            }}
            options={TYPE_FILTER_OPTIONS}
            ariaLabel="نوع السند"
            triggerClassName="h-11"
          />
        </div>
        <div className="grid gap-1">
          <span className={cn("text-[11px] font-semibold", HEADING)}>الفترة الزمنية</span>
          <AppDateRangeFilter
            value={dateRange}
            onChange={(next) => {
              setDateRange(next)
              setPage(1)
            }}
          />
        </div>
      </div>

      <div className={cn(PANEL, "overflow-hidden")}>
        <AppTable>
          <AppTableHeader>
            <AppTableRow>
              <AppTableHead>المرجع</AppTableHead>
              <AppTableHead>المورد</AppTableHead>
              <AppTableHead>نوع السند</AppTableHead>
              <AppTableHead>طريقة الدفع</AppTableHead>
              <AppTableHead>الفاتورة المرتبطة</AppTableHead>
              <AppTableHead>المبلغ</AppTableHead>
              <AppTableHead>التاريخ</AppTableHead>
              <AppTableHead className="w-24">الإجراءات</AppTableHead>
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {rows.map((voucher: SupplierVoucher) => {
              const meta = VOUCHER_TYPE_META[voucher.type]
              return (
                <AppTableRow key={voucher.id}>
                  <AppTableCell className={cn("font-mono text-[12px]", HEADING)}>
                    {voucher.reference}
                  </AppTableCell>
                  <AppTableCell>
                    <div className="flex items-center gap-2.5">
                      <SupplierAvatar
                        name={voucher.supplierName}
                        imageUrl={voucher.supplierImageUrl}
                        className="size-8"
                      />
                      <span className={cn("font-medium", HEADING)}>{voucher.supplierName}</span>
                    </div>
                  </AppTableCell>
                  <AppTableCell>
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{ backgroundColor: meta.bg, color: meta.color }}
                    >
                      {meta.label}
                    </span>
                  </AppTableCell>
                  <AppTableCell className={MUTED}>
                    {PAYMENT_METHOD_NAME[voucher.paymentMethod]}
                  </AppTableCell>
                  <AppTableCell className={cn("font-mono text-[12px]", MUTED)}>
                    {voucher.purchaseCode ?? "—"}
                  </AppTableCell>
                  <AppTableCell className="font-bold" style={{ color: meta.color }}>
                    {meta.verb === "قبض" ? "+" : "-"}
                    {formatVoucherAmount(voucher.amount)}
                  </AppTableCell>
                  <AppTableCell className={MUTED}>{voucher.transactionDate}</AppTableCell>
                  <AppTableCell>
                    <div className="flex items-center gap-1.5">
                      <AppButton
                        variant="ghost"
                        size="icon-sm"
                        aria-label="عرض"
                        className="rounded-[8px] border border-blue-100 bg-blue-50 text-blue-600 hover:bg-blue-100"
                        onClick={() => setViewTarget(voucher)}
                      >
                        <Eye className="size-4" />
                      </AppButton>
                      <AppButton
                        variant="ghost"
                        size="icon-sm"
                        aria-label="طباعة"
                        className="rounded-[8px] border border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200"
                        onClick={() => setPrintTarget(voucher)}
                      >
                        <Printer className="size-4" />
                      </AppButton>
                    </div>
                  </AppTableCell>
                </AppTableRow>
              )
            })}
          </AppTableBody>
        </AppTable>

        {isLoading ? (
          <div className={cn("flex items-center justify-center gap-2 py-16 text-[13px]", MUTED)}>
            <Loader2 className="size-4 animate-spin" />
            جارٍ التحميل...
          </div>
        ) : rows.length === 0 ? (
          <AppTableEmpty
            title="لا توجد سندات بعد"
            description='اضغط "سند قبض" أو "سند صرف" أعلاه لتسجيل أول سند.'
          />
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e1e7f0] px-4 py-3">
          <p className={cn("shrink-0 text-sm whitespace-nowrap", MUTED)}>
            عرض {rows.length} من {filtered.length} نتيجة
          </p>
          <SupplierPagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
        </div>
      </div>

      {dialogType ? (
        <SupplierVoucherDialog
          type={dialogType}
          supplierId={supplierId}
          onSupplierIdChange={handleSupplierIdChange}
          supplierOptions={suppliers.map((supplier) => ({
            value: supplier.id,
            label: supplier.name,
          }))}
          supplierBalance={selectedSupplierBalance}
          invoiceId={invoiceId}
          onInvoiceIdChange={setInvoiceId}
          invoiceOptions={invoiceOptions}
          selectedInvoiceAmount={selectedInvoiceAmount}
          amount={amount}
          onAmountChange={setAmount}
          transactionDate={transactionDate}
          onTransactionDateChange={setTransactionDate}
          taxInclusive={taxInclusive}
          onTaxInclusiveChange={setTaxInclusive}
          paymentMethod={paymentMethod}
          onPaymentMethodChange={setPaymentMethod}
          notes={notes}
          onNotesChange={setNotes}
          isSaving={isSaving}
          onCancel={closeDialog}
          onSubmit={() => void submitVoucher()}
        />
      ) : null}

      <SupplierVoucherViewDialog
        voucher={viewTarget}
        onOpenChange={(open) => !open && setViewTarget(null)}
      />

      {/* Portaled to <body> so it's a sibling of every other top-level element, which the print
          CSS below hides by selector -- same pattern as the purchases module's own print targets. */}
      {typeof document !== "undefined" && printTarget
        ? createPortal(
            <SupplierVoucherPrintDocument
              voucher={printTarget}
              supplier={
                suppliers.find((supplier) => supplier.id === printTarget.supplierId) ?? null
              }
            />,
            document.body
          )
        : null}
      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          body > *:not(#supplier-voucher-print-target) { display: none !important; }
        }
      `}</style>
    </div>
  )
}

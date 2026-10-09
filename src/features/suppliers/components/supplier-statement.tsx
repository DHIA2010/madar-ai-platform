"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowDownCircle,
  ArrowRight,
  ArrowUpCircle,
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Layers,
  Loader2,
  Mail,
  PackageSearch,
  Phone,
  Printer,
  RotateCcw,
  Wallet,
} from "lucide-react"
import type { DateRange } from "react-day-picker"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppDateRangeFilter,
  AppSearchableSelect,
  type AppSearchableSelectOption,
} from "@/components/app"

// Type-only, so this stays erased at compile time -- see use-cross-feature-purchase-data.ts for
// why the purchases feature's runtime data is read via that hook's dynamic import instead.
import type { Purchase, PurchaseReturn } from "@/features/purchases"
import { useWorkspace } from "@/features/workspace"

import {
  crossFeaturePurchaseGrandTotal,
  useCrossFeaturePurchaseData,
  useSuppliers,
  useSupplierVouchers,
} from "../hooks"
import {
  convertToOrgCurrency,
  isSupportedOrgCurrency,
  type SupportedOrgCurrency,
} from "../services"
import type { SupplierVoucher } from "../types"
import { SupplierAvatar } from "./supplier-avatar"
import { PAYMENT_METHOD_NAME } from "./supplier-voucher-dialog"

// Same design language as CustomerStatement (the "customer receipt" page this mirrors) --
// duplicated locally rather than imported, matching this codebase's per-feature-duplication
// convention for page-local styling constants.
const HEADING = "text-[#0d1b3e]"
const MUTED = "text-[#5b6b85]"
const PAGE_SIZE = 10

const AMOUNT_FORMAT = new Intl.NumberFormat("ar-SA-u-nu-latn", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
function formatAmount(value: number): string {
  return `${AMOUNT_FORMAT.format(value)} ر.س`
}

const DATE_FORMAT = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  day: "numeric",
  month: "long",
  year: "numeric",
})
function formatDate(value: string): string {
  return value ? DATE_FORMAT.format(new Date(value)) : "—"
}

// A supplier statement has two kinds of rows: real purchase/return records (read live from
// usePurchasesStore by supplierId, never created here) and manually-recorded سند قبض/صرف vouchers
// (this page's own store). "direction" is the sign each type applies to the running balance --
// purchase/receipt move it toward "we owe the supplier more", return/payment move it the other way.
type SupplierTransactionType = "purchase" | "return" | "receipt" | "payment"

interface SupplierTransaction {
  id: string
  reference: string
  type: SupplierTransactionType
  amount: number
  description: string
  balanceAfter: number
  occurredAt: string
}

const TRANSACTION_TYPE_META: Record<
  SupplierTransactionType,
  {
    label: string
    verb: string
    icon: typeof ArrowDownCircle
    color: string
    bg: string
    direction: 1 | -1
  }
> = {
  purchase: {
    label: "فاتورة شراء",
    verb: "شراء",
    icon: PackageSearch,
    color: "#16a34a",
    bg: "#f0fdf4",
    direction: 1,
  },
  return: {
    label: "مرتجع مشتريات",
    verb: "إرجاع",
    icon: RotateCcw,
    color: "#dc2626",
    bg: "#fef2f2",
    direction: -1,
  },
  receipt: {
    label: "سند قبض",
    verb: "قبض",
    icon: ArrowDownCircle,
    color: "#16a34a",
    bg: "#f0fdf4",
    direction: 1,
  },
  payment: {
    label: "سند صرف",
    verb: "صرف",
    icon: ArrowUpCircle,
    color: "#dc2626",
    bg: "#fef2f2",
    direction: -1,
  },
}

const TRANSACTION_TYPE_OPTIONS: AppSearchableSelectOption[] = [
  { value: "all", label: "جميع العمليات" },
  ...(Object.keys(TRANSACTION_TYPE_META) as SupplierTransactionType[]).map((type) => ({
    value: type,
    label: TRANSACTION_TYPE_META[type].label,
    icon: TRANSACTION_TYPE_META[type].icon,
  })),
]

// Merges real purchases/returns for this supplier with its manually-recorded vouchers into one
// chronological ledger, accumulating a running balance (oldest first) then reversing for display
// (newest first) -- same "balanceAfter per row" shape as CustomerStatement's AccountTransaction,
// just computed client-side here instead of coming from a real backend ledger.
function buildSupplierTransactions(
  supplierId: string,
  purchases: Purchase[],
  returns: PurchaseReturn[],
  vouchers: SupplierVoucher[],
  orgCurrency: SupportedOrgCurrency
): SupplierTransaction[] {
  const events: Array<{
    reference: string
    type: SupplierTransactionType
    amount: number
    description: string
    occurredAt: string
  }> = []

  // A return has no currency of its own -- it always follows its parent purchase's.
  const purchaseIdToCurrency = new Map(
    purchases.map((purchase) => [purchase.id, purchase.currency])
  )

  for (const purchase of purchases) {
    if (purchase.supplierId !== supplierId) continue
    events.push({
      reference: purchase.code,
      type: "purchase",
      amount:
        convertToOrgCurrency(
          crossFeaturePurchaseGrandTotal(purchase),
          purchase.currency,
          orgCurrency
        ) ?? 0,
      description: `فاتورة شراء ${purchase.code}`,
      occurredAt: purchase.date,
    })
  }
  for (const entry of returns) {
    if (entry.supplierId !== supplierId) continue
    events.push({
      reference: entry.code,
      type: "return",
      amount:
        convertToOrgCurrency(
          entry.returnAmount,
          purchaseIdToCurrency.get(entry.purchaseId),
          orgCurrency
        ) ?? 0,
      description: `مرتجع مشتريات ${entry.code} (${entry.purchaseCode})`,
      occurredAt: entry.returnDate,
    })
  }
  for (const voucher of vouchers) {
    if (voucher.supplierId !== supplierId) continue
    const methodName = PAYMENT_METHOD_NAME[voucher.paymentMethod]
    const baseDescription =
      voucher.notes ||
      (voucher.type === "receipt" ? `مقبوض عبر ${methodName}` : `مصروف عبر ${methodName}`)
    events.push({
      reference: voucher.reference,
      type: voucher.type,
      amount: voucher.amount,
      description: voucher.purchaseCode
        ? `${baseDescription} (${voucher.purchaseCode})`
        : baseDescription,
      occurredAt: voucher.transactionDate,
    })
  }

  const chronological = [...events].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
  )
  let runningBalance = 0
  const withBalance = chronological.map((event, index) => {
    runningBalance += TRANSACTION_TYPE_META[event.type].direction * event.amount
    return {
      id: `${event.type}-${event.reference}-${index}`,
      reference: event.reference,
      type: event.type,
      amount: event.amount,
      description: event.description,
      balanceAfter: runningBalance,
      occurredAt: event.occurredAt,
    }
  })
  return withBalance.reverse()
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Wallet
  label: string
  value: string
  tone: string
}) {
  return (
    <div className="flex items-center justify-between rounded-[16px] border border-[#e8edf3] bg-white p-4">
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

function StatementTable({ transactions }: { transactions: SupplierTransaction[] }) {
  return (
    <table className="w-full text-right" style={{ borderCollapse: "collapse" }}>
      <thead>
        <tr className="border-b border-[#e1e7f0] text-[11px] font-semibold text-[#5b6b85]">
          <th className="px-3 py-2">#</th>
          <th className="px-3 py-2">المرجع</th>
          <th className="px-3 py-2">نوع العملية</th>
          <th className="px-3 py-2">الوصف</th>
          <th className="px-3 py-2">المبلغ</th>
          <th className="px-3 py-2">الرصيد بعد العملية</th>
          <th className="px-3 py-2">التاريخ</th>
        </tr>
      </thead>
      <tbody>
        {transactions.map((transaction, index) => {
          const meta = TRANSACTION_TYPE_META[transaction.type]
          return (
            <tr key={transaction.id} className="border-b border-[#f1f4f9] text-[12px]">
              <td className="px-3 py-2 text-[#5b6b85]">{index + 1}</td>
              <td className="px-3 py-2 font-mono text-[11px] text-[#0d1b3e]">
                {transaction.reference}
              </td>
              <td className="px-3 py-2" style={{ color: meta.color }}>
                {meta.verb}
              </td>
              <td className="px-3 py-2 text-[#5b6b85]">{transaction.description}</td>
              <td className="px-3 py-2 font-bold" style={{ color: meta.color }}>
                {meta.direction > 0 ? "+" : "-"}
                {formatAmount(transaction.amount)}
              </td>
              <td className="px-3 py-2 font-semibold text-[#0d1b3e]">
                {formatAmount(transaction.balanceAfter)}
              </td>
              <td className="px-3 py-2 text-[#5b6b85]">{formatDate(transaction.occurredAt)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function SupplierStatement({ supplierId }: { supplierId: string }) {
  const { currentOrganization } = useWorkspace()
  const { suppliers, isLoading: isLoadingSuppliers } = useSuppliers()
  const { vouchers } = useSupplierVouchers()
  const { purchases, returns } = useCrossFeaturePurchaseData()
  const supplier = suppliers.find((entry) => entry.id === supplierId) ?? null
  const rawOrgCurrency = currentOrganization?.currency ?? ""
  const orgCurrency = isSupportedOrgCurrency(rawOrgCurrency) ? rawOrgCurrency : "SAR"

  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [transactionType, setTransactionType] = useState<SupplierTransactionType | "all">("all")
  const [page, setPage] = useState(1)

  const allTransactions = useMemo(
    () => buildSupplierTransactions(supplierId, purchases, returns, vouchers, orgCurrency),
    [supplierId, purchases, returns, vouchers, orgCurrency]
  )

  const transactions = useMemo(() => {
    return allTransactions.filter((transaction) => {
      if (transactionType !== "all" && transaction.type !== transactionType) return false
      const occurred = new Date(transaction.occurredAt)
      if (dateRange?.from && occurred < dateRange.from) return false
      if (dateRange?.to && occurred > dateRange.to) return false
      return true
    })
  }, [allTransactions, transactionType, dateRange])

  const balance = allTransactions[0]?.balanceAfter ?? 0
  const balanceTone = balance >= 0 ? "#16a34a" : "#dc2626"
  const totalPurchased = useMemo(
    () => transactions.filter((t) => t.type === "purchase").reduce((sum, t) => sum + t.amount, 0),
    [transactions]
  )
  const totalPaid = useMemo(
    () => transactions.filter((t) => t.type === "payment").reduce((sum, t) => sum + t.amount, 0),
    [transactions]
  )

  const totalPages = Math.max(1, Math.ceil(transactions.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const paginatedTransactions = transactions.slice(pageStart, pageStart + PAGE_SIZE)

  const csvContent = useMemo(() => {
    const header = ["المرجع", "النوع", "الوصف", "المبلغ", "الرصيد بعد العملية", "التاريخ"]
    const rows = transactions.map((transaction) => [
      transaction.reference,
      TRANSACTION_TYPE_META[transaction.type].verb,
      transaction.description,
      transaction.amount.toFixed(2),
      transaction.balanceAfter.toFixed(2),
      formatDate(transaction.occurredAt),
    ])
    return [header, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n")
  }, [transactions])

  const downloadCsv = () => {
    const blob = new Blob([`﻿${csvContent}`], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `كشف-حساب-${supplier?.name ?? supplierId}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (isLoadingSuppliers) {
    return (
      <div
        dir="rtl"
        className="flex items-center justify-center gap-2 p-16 text-[13px] text-[#5b6b85]"
      >
        <Loader2 className="size-4 animate-spin" />
        جارٍ التحميل...
      </div>
    )
  }

  if (!supplier) {
    return (
      <div dir="rtl" className="p-6">
        <p className="text-[13px] text-[#dc2626]">تعذر العثور على هذا المورد.</p>
      </div>
    )
  }

  return (
    <div dir="rtl" className="flex flex-col gap-5 p-6">
      <div className="flex flex-col gap-1">
        <div className={cn("flex items-center gap-1.5 text-[11.5px]", MUTED)}>
          <Link href={ROUTES.suppliersVouchers} className="hover:text-[#2563eb]">
            سندات الموردين
          </Link>
          <span>/</span>
          <span className={HEADING}>كشف حساب المورد</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href={ROUTES.suppliersVouchers}
              className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-[#e8edf3] text-[#5b6b85] hover:bg-[#f4f6fa]"
            >
              <ArrowRight className="size-4" />
            </Link>
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-[#eff6ff] text-[#2563eb]">
              <FileText className="size-5" />
            </span>
            <div>
              <h1 className={cn("text-[18px] font-extrabold", HEADING)}>كشف حساب المورد</h1>
              <p className={cn("text-[12px]", MUTED)}>
                عرض جميع العمليات المالية المتعلقة بحساب المورد
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-[16px] border border-[#e8edf3] bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-center gap-2.5">
          <SupplierAvatar name={supplier.name} imageUrl={supplier.imageUrl} className="size-10" />
          <div className="min-w-0">
            <p className={cn("truncate text-[13.5px] font-bold", HEADING)}>{supplier.name}</p>
            <p className={cn("truncate text-[10.5px]", MUTED)}>{supplier.code}</p>
          </div>
        </div>
        <div className="flex flex-col justify-center gap-1 text-[12px]">
          {supplier.phone ? (
            <span className={cn("flex items-center gap-1.5", MUTED)} dir="ltr">
              <Phone className="size-3.5" /> {supplier.phone}
            </span>
          ) : null}
          {supplier.email ? (
            <span className={cn("flex items-center gap-1.5", MUTED)} dir="ltr">
              <Mail className="size-3.5" /> {supplier.email}
            </span>
          ) : null}
        </div>
        <div className="flex flex-col justify-center gap-1 text-[12px]">
          <span className={cn("flex items-center gap-1.5", MUTED)}>
            <Calendar className="size-3.5" /> تاريخ الإضافة: {formatDate(supplier.createdAt)}
          </span>
          {supplier.city ? (
            <span className={cn("flex items-center gap-1.5", MUTED)}>
              <Building2 className="size-3.5" /> المدينة: {supplier.city}
            </span>
          ) : null}
        </div>
        <div className="flex flex-col items-start justify-center gap-1.5">
          <span className="inline-flex rounded-full bg-[#eff6ff] px-2 py-0.5 text-[11px] font-semibold text-[#2563eb]">
            {supplier.kind === "local" ? "محلي" : "دولي"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Wallet}
          label={balance >= 0 ? "رصيد المورد (له)" : "رصيد المورد (عليه)"}
          value={formatAmount(Math.abs(balance))}
          tone={balanceTone}
        />
        <StatCard
          icon={PackageSearch}
          label="إجمالي المشتريات"
          value={formatAmount(totalPurchased)}
          tone="#16a34a"
        />
        <StatCard
          icon={ArrowUpCircle}
          label="إجمالي المسدد"
          value={formatAmount(totalPaid)}
          tone="#dc2626"
        />
        <StatCard
          icon={Layers}
          label="عدد العمليات"
          value={String(transactions.length)}
          tone="#5b6b85"
        />
      </div>

      <div className="rounded-[16px] border border-[#e8edf3] bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
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
          <div className="grid min-w-[150px] gap-1">
            <span className={cn("text-[11px] font-semibold", HEADING)}>نوع العملية</span>
            <AppSearchableSelect
              value={transactionType}
              onChange={(next) => {
                setTransactionType(next as SupplierTransactionType | "all")
                setPage(1)
              }}
              options={TRANSACTION_TYPE_OPTIONS}
              ariaLabel="نوع العملية"
              triggerClassName="h-10"
            />
          </div>
        </div>
      </div>

      <div className="rounded-[16px] border border-[#e8edf3] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8edf3] p-4">
          <div>
            <p className={cn("text-[14px] font-extrabold", HEADING)}>سجل العمليات</p>
            <p className={cn("text-[11.5px]", MUTED)}>
              يعرض فواتير الشراء والمرتجعات وسندات القبض والصرف، وأثرها على رصيد المورد
            </p>
          </div>
          <div className="flex items-center gap-2">
            <AppButton
              variant="outline"
              icon={<Download className="size-3.5" />}
              onClick={downloadCsv}
              disabled={transactions.length === 0}
              className="h-9 gap-1.5 rounded-[8px] border-[#e8edf3] px-3 text-[11.5px] font-semibold text-[#5b6b85]"
            >
              تحميل CSV
            </AppButton>
            <AppButton
              variant="outline"
              icon={<Printer className="size-3.5" />}
              onClick={() => window.print()}
              disabled={transactions.length === 0}
              className="h-9 gap-1.5 rounded-[8px] border-[#e8edf3] px-3 text-[11.5px] font-semibold text-[#5b6b85]"
            >
              طباعة
            </AppButton>
          </div>
        </div>

        {transactions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Wallet className="size-9 text-[#c7cedb]" />
            <p className={cn("text-[13px] font-bold", HEADING)}>لا توجد عمليات بعد</p>
            <p className={cn("text-[11.5px]", MUTED)}>
              ستظهر فواتير الشراء والمرتجعات وسندات القبض والصرف هنا فور حدوثها
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-right">
                <thead>
                  <tr className="border-b border-[#e8edf3] text-[11px] font-semibold text-[#8098b4]">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">المرجع</th>
                    <th className="px-4 py-3">نوع العملية</th>
                    <th className="px-4 py-3">الوصف</th>
                    <th className="px-4 py-3">المبلغ</th>
                    <th className="px-4 py-3">الرصيد بعد العملية</th>
                    <th className="px-4 py-3">التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTransactions.map((transaction, index) => {
                    const meta = TRANSACTION_TYPE_META[transaction.type]
                    return (
                      <tr
                        key={transaction.id}
                        className="border-b border-[#f1f4f9] text-[12.5px] last:border-b-0 hover:bg-[#fafbfd]"
                      >
                        <td className={cn("px-4 py-3", MUTED)}>{pageStart + index + 1}</td>
                        <td className={cn("px-4 py-3 font-mono text-[11.5px]", HEADING)}>
                          {transaction.reference}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold"
                            style={{ backgroundColor: meta.bg, color: meta.color }}
                          >
                            {meta.verb}
                          </span>
                        </td>
                        <td className={cn("px-4 py-3", MUTED)}>{transaction.description}</td>
                        <td className="px-4 py-3 font-bold" style={{ color: meta.color }}>
                          {meta.direction > 0 ? "+" : "-"}
                          {formatAmount(transaction.amount)}
                        </td>
                        <td className={cn("px-4 py-3 font-semibold", HEADING)}>
                          {formatAmount(transaction.balanceAfter)}
                        </td>
                        <td className={cn("px-4 py-3", MUTED)}>
                          {formatDate(transaction.occurredAt)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-[#e8edf3] px-4 py-3">
              <p className={cn("text-[11.5px]", MUTED)}>
                عرض {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, transactions.length)} من{" "}
                {transactions.length} عملية
              </p>
              <div className="flex items-center gap-2">
                <AppButton
                  variant="outline"
                  className="size-8 rounded-[8px] border-[#e8edf3] p-0"
                  disabled={currentPage === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="الصفحة السابقة"
                >
                  <ChevronRight className="size-4" />
                </AppButton>
                <span className={cn("text-[11.5px]", MUTED)}>
                  {currentPage} / {totalPages}
                </span>
                <AppButton
                  variant="outline"
                  className="size-8 rounded-[8px] border-[#e8edf3] p-0"
                  disabled={currentPage === totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="الصفحة التالية"
                >
                  <ChevronLeft className="size-4" />
                </AppButton>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Print-only view of the full (unpaginated, currently-filtered) transaction table -- same
          portal-to-body pattern as CustomerStatement's own print target. */}
      {typeof document !== "undefined"
        ? createPortal(
            <div id="supplier-statement-print-target" className="hidden p-6 print:block" dir="rtl">
              <div className="mb-4 flex items-center justify-between gap-4 border-b border-[#e1e7f0] pb-3">
                <div>
                  <h1 className="text-[16px] font-extrabold text-[#0d1b3e]">كشف حساب المورد</h1>
                  <p className="mt-0.5 text-[12px] text-[#5b6b85]">{supplier.name}</p>
                  <p className="mt-0.5 text-[11px] text-[#5b6b85]">
                    تم إنشاؤه في{" "}
                    {new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
                      dateStyle: "long",
                      timeStyle: "short",
                    }).format(new Date())}
                  </p>
                </div>
                {currentOrganization ? (
                  <div className="flex shrink-0 items-center gap-2.5">
                    {currentOrganization.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={currentOrganization.logoUrl}
                        alt=""
                        className="size-10 shrink-0 rounded-[10px] object-contain"
                      />
                    ) : null}
                    <span className="text-[13px] font-bold text-[#0d1b3e]">
                      {currentOrganization.name}
                    </span>
                  </div>
                ) : null}
              </div>
              <StatementTable transactions={transactions} />
            </div>,
            document.body
          )
        : null}
      <style>{`
        @media print {
          body > *:not(#supplier-statement-print-target) { display: none !important; }
        }
      `}</style>
    </div>
  )
}

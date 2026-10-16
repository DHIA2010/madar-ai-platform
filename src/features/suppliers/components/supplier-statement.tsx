"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import {
  ArrowDownCircle,
  ArrowLeft,
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

import { type Locale, localeDirection } from "@/i18n/locales"

// Same design language as CustomerStatement (the "customer receipt" page this mirrors) --
// duplicated locally rather than imported, matching this codebase's per-feature-duplication
// convention for page-local styling constants.
const HEADING = "text-[#0d1b3e]"
const MUTED = "text-[#5b6b85]"
const PAGE_SIZE = 10

// Every amount here already arrives converted into the org's default currency (see
// buildSupplierTransactions), so this only needs to label the number correctly.
function formatAmount(value: number, currency: SupportedOrgCurrency, locale: Locale): string {
  const formatted = new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
  if (currency === "USD") return `${formatted} $`
  return locale === "ar" ? `${formatted} ر.س` : `${formatted} SAR`
}

function formatDate(value: string, locale: Locale): string {
  if (!value) return "—"
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value))
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

// Display text (label/verb) lives in the "suppliers.statement.transactionType" namespace for
// purchase/return, and is reused from "suppliers.vouchers.type" for receipt/payment (the exact
// same two types a voucher can be) -- resolved via transactionTypeLabel/transactionTypeVerb below
// rather than stored here, so this object only keeps the locale-independent visual facts.
const TRANSACTION_TYPE_META: Record<
  SupplierTransactionType,
  { icon: typeof ArrowDownCircle; color: string; bg: string; direction: 1 | -1 }
> = {
  purchase: { icon: PackageSearch, color: "#16a34a", bg: "#f0fdf4", direction: 1 },
  return: { icon: RotateCcw, color: "#dc2626", bg: "#fef2f2", direction: -1 },
  receipt: { icon: ArrowDownCircle, color: "#16a34a", bg: "#f0fdf4", direction: 1 },
  payment: { icon: ArrowUpCircle, color: "#dc2626", bg: "#fef2f2", direction: -1 },
}

type Translator = (key: string, values?: Record<string, string | number>) => string

function transactionTypeLabel(
  type: SupplierTransactionType,
  tStatement: Translator,
  tVouchers: Translator
): string {
  return type === "receipt" || type === "payment"
    ? tVouchers(`type.${type}.label`)
    : tStatement(`transactionType.${type}.label`)
}

function transactionTypeVerb(
  type: SupplierTransactionType,
  tStatement: Translator,
  tVouchers: Translator
): string {
  return type === "receipt" || type === "payment"
    ? tVouchers(`type.${type}.verb`)
    : tStatement(`transactionType.${type}.verb`)
}

// Merges real purchases/returns for this supplier with its manually-recorded vouchers into one
// chronological ledger, accumulating a running balance (oldest first) then reversing for display
// (newest first) -- same "balanceAfter per row" shape as CustomerStatement's AccountTransaction,
// just computed client-side here instead of coming from a real backend ledger.
function buildSupplierTransactions(
  supplierId: string,
  purchases: Purchase[],
  returns: PurchaseReturn[],
  vouchers: SupplierVoucher[],
  orgCurrency: SupportedOrgCurrency,
  tDescriptions: Translator,
  tPaymentMethod: Translator
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
      description: tDescriptions("purchaseInvoice", { code: purchase.code }),
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
      description: tDescriptions("purchaseReturn", {
        code: entry.code,
        purchaseCode: entry.purchaseCode,
      }),
      occurredAt: entry.returnDate,
    })
  }
  for (const voucher of vouchers) {
    if (voucher.supplierId !== supplierId) continue
    const methodName = tPaymentMethod(voucher.paymentMethod)
    const baseDescription =
      voucher.notes ||
      tDescriptions(voucher.type === "receipt" ? "receivedVia" : "paidVia", {
        method: methodName,
      })
    // A voucher's own currency is snapshotted server-side at creation time (see
    // 096_supplier_voucher_currency.sql), never re-derived from the linked purchase or supplier.
    events.push({
      reference: voucher.reference,
      type: voucher.type,
      amount: convertToOrgCurrency(voucher.amount, voucher.currency, orgCurrency) ?? voucher.amount,
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

function StatementTable({
  transactions,
  currency,
  locale,
  tTable,
  tStatement,
  tVouchers,
}: {
  transactions: SupplierTransaction[]
  currency: SupportedOrgCurrency
  locale: Locale
  tTable: Translator
  tStatement: Translator
  tVouchers: Translator
}) {
  return (
    <table className="w-full text-right" style={{ borderCollapse: "collapse" }}>
      <thead>
        <tr className="border-b border-[#e1e7f0] text-[11px] font-semibold text-[#5b6b85]">
          <th className="px-3 py-2">{tTable("index")}</th>
          <th className="px-3 py-2">{tTable("reference")}</th>
          <th className="px-3 py-2">{tTable("type")}</th>
          <th className="px-3 py-2">{tTable("description")}</th>
          <th className="px-3 py-2">{tTable("amount")}</th>
          <th className="px-3 py-2">{tTable("balanceAfter")}</th>
          <th className="px-3 py-2">{tTable("date")}</th>
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
                {transactionTypeVerb(transaction.type, tStatement, tVouchers)}
              </td>
              <td className="px-3 py-2 text-[#5b6b85]">{transaction.description}</td>
              <td className="px-3 py-2 font-bold" style={{ color: meta.color }}>
                {meta.direction > 0 ? "+" : "-"}
                {formatAmount(transaction.amount, currency, locale)}
              </td>
              <td className="px-3 py-2 font-semibold text-[#0d1b3e]">
                {formatAmount(transaction.balanceAfter, currency, locale)}
              </td>
              <td className="px-3 py-2 text-[#5b6b85]">
                {formatDate(transaction.occurredAt, locale)}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function SupplierStatement({ supplierId }: { supplierId: string }) {
  const t = useTranslations("suppliers.statement")
  const tTable = useTranslations("suppliers.statement.table")
  const tVouchers = useTranslations("suppliers.vouchers")
  const tPaymentMethod = useTranslations("suppliers.vouchers.paymentMethod")
  const tDescriptions = useTranslations("suppliers.statement.descriptions")
  const locale = useLocale() as Locale
  const dir = localeDirection(locale)
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

  const transactionTypeOptions: AppSearchableSelectOption[] = [
    { value: "all", label: t("allTransactionTypes") },
    ...(["purchase", "return", "receipt", "payment"] as SupplierTransactionType[]).map((type) => ({
      value: type,
      label: transactionTypeLabel(type, t, tVouchers),
      icon: TRANSACTION_TYPE_META[type].icon,
    })),
  ]

  const allTransactions = useMemo(
    () =>
      buildSupplierTransactions(
        supplierId,
        purchases,
        returns,
        vouchers,
        orgCurrency,
        tDescriptions,
        tPaymentMethod
      ),
    [supplierId, purchases, returns, vouchers, orgCurrency, tDescriptions, tPaymentMethod]
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
    const header = [
      tTable("reference"),
      tTable("type"),
      tTable("description"),
      tTable("amount"),
      tTable("balanceAfter"),
      tTable("date"),
    ]
    const rows = transactions.map((transaction) => [
      transaction.reference,
      transactionTypeVerb(transaction.type, t, tVouchers),
      transaction.description,
      transaction.amount.toFixed(2),
      transaction.balanceAfter.toFixed(2),
      formatDate(transaction.occurredAt, locale),
    ])
    return [header, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n")
  }, [transactions, t, tTable, tVouchers, locale])

  const downloadCsv = () => {
    const blob = new Blob([`﻿${csvContent}`], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${t("csvFilenamePrefix")}-${supplier?.name ?? supplierId}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (isLoadingSuppliers) {
    return (
      <div
        dir={dir}
        className="flex items-center justify-center gap-2 p-16 text-[13px] text-[#5b6b85]"
      >
        <Loader2 className="size-4 animate-spin" />
        {t("loading")}
      </div>
    )
  }

  if (!supplier) {
    return (
      <div dir={dir} className="p-6">
        <p className="text-[13px] text-[#dc2626]">{t("notFound")}</p>
      </div>
    )
  }

  return (
    <div dir={dir} className="flex flex-col gap-5 p-6">
      <div className="flex flex-col gap-1">
        <div className={cn("flex items-center gap-1.5 text-[11.5px]", MUTED)}>
          <Link href={ROUTES.suppliersVouchers} className="hover:text-[#2563eb]">
            {t("breadcrumb")}
          </Link>
          <span>/</span>
          <span className={HEADING}>{t("heading")}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href={ROUTES.suppliersVouchers}
              className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-[#e8edf3] text-[#5b6b85] hover:bg-[#f4f6fa]"
            >
              <ArrowLeft className="size-4 rtl:rotate-180" />
            </Link>
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-[#eff6ff] text-[#2563eb]">
              <FileText className="size-5" />
            </span>
            <div>
              <h1 className={cn("text-[18px] font-extrabold", HEADING)}>{t("heading")}</h1>
              <p className={cn("text-[12px]", MUTED)}>{t("subheading")}</p>
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
            <Calendar className="size-3.5" />{" "}
            {t("addedDate", { date: formatDate(supplier.createdAt, locale) })}
          </span>
          {supplier.city ? (
            <span className={cn("flex items-center gap-1.5", MUTED)}>
              <Building2 className="size-3.5" /> {t("city", { city: supplier.city })}
            </span>
          ) : null}
        </div>
        <div className="flex flex-col items-start justify-center gap-1.5">
          <span className="inline-flex rounded-full bg-[#eff6ff] px-2 py-0.5 text-[11px] font-semibold text-[#2563eb]">
            {supplier.kind === "local" ? t("localBadge") : t("internationalBadge")}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Wallet}
          label={balance >= 0 ? t("balanceOwed") : t("balanceDue")}
          value={formatAmount(Math.abs(balance), orgCurrency, locale)}
          tone={balanceTone}
        />
        <StatCard
          icon={PackageSearch}
          label={t("totalPurchases")}
          value={formatAmount(totalPurchased, orgCurrency, locale)}
          tone="#16a34a"
        />
        <StatCard
          icon={ArrowUpCircle}
          label={t("totalPaid")}
          value={formatAmount(totalPaid, orgCurrency, locale)}
          tone="#dc2626"
        />
        <StatCard
          icon={Layers}
          label={t("transactionCount")}
          value={String(transactions.length)}
          tone="#5b6b85"
        />
      </div>

      <div className="rounded-[16px] border border-[#e8edf3] bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1">
            <span className={cn("text-[11px] font-semibold", HEADING)}>{t("periodLabel")}</span>
            <AppDateRangeFilter
              value={dateRange}
              onChange={(next) => {
                setDateRange(next)
                setPage(1)
              }}
            />
          </div>
          <div className="grid min-w-[150px] gap-1">
            <span className={cn("text-[11px] font-semibold", HEADING)}>
              {t("transactionTypeLabel")}
            </span>
            <AppSearchableSelect
              value={transactionType}
              onChange={(next) => {
                setTransactionType(next as SupplierTransactionType | "all")
                setPage(1)
              }}
              options={transactionTypeOptions}
              ariaLabel={t("transactionTypeLabel")}
              triggerClassName="h-10"
            />
          </div>
        </div>
      </div>

      <div className="rounded-[16px] border border-[#e8edf3] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8edf3] p-4">
          <div>
            <p className={cn("text-[14px] font-extrabold", HEADING)}>{t("transactionLog")}</p>
            <p className={cn("text-[11.5px]", MUTED)}>{t("transactionLogSubtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <AppButton
              variant="outline"
              icon={<Download className="size-3.5" />}
              onClick={downloadCsv}
              disabled={transactions.length === 0}
              className="h-9 gap-1.5 rounded-[8px] border-[#e8edf3] px-3 text-[11.5px] font-semibold text-[#5b6b85]"
            >
              {t("downloadCsv")}
            </AppButton>
            <AppButton
              variant="outline"
              icon={<Printer className="size-3.5" />}
              onClick={() => window.print()}
              disabled={transactions.length === 0}
              className="h-9 gap-1.5 rounded-[8px] border-[#e8edf3] px-3 text-[11.5px] font-semibold text-[#5b6b85]"
            >
              {t("print")}
            </AppButton>
          </div>
        </div>

        {transactions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Wallet className="size-9 text-[#c7cedb]" />
            <p className={cn("text-[13px] font-bold", HEADING)}>{t("emptyTitle")}</p>
            <p className={cn("text-[11.5px]", MUTED)}>{t("emptyDescription")}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-right">
                <thead>
                  <tr className="border-b border-[#e8edf3] text-[11px] font-semibold text-[#8098b4]">
                    <th className="px-4 py-3">{tTable("index")}</th>
                    <th className="px-4 py-3">{tTable("reference")}</th>
                    <th className="px-4 py-3">{tTable("type")}</th>
                    <th className="px-4 py-3">{tTable("description")}</th>
                    <th className="px-4 py-3">{tTable("amount")}</th>
                    <th className="px-4 py-3">{tTable("balanceAfter")}</th>
                    <th className="px-4 py-3">{tTable("date")}</th>
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
                            {transactionTypeVerb(transaction.type, t, tVouchers)}
                          </span>
                        </td>
                        <td className={cn("px-4 py-3", MUTED)}>{transaction.description}</td>
                        <td className="px-4 py-3 font-bold" style={{ color: meta.color }}>
                          {meta.direction > 0 ? "+" : "-"}
                          {formatAmount(transaction.amount, orgCurrency, locale)}
                        </td>
                        <td className={cn("px-4 py-3 font-semibold", HEADING)}>
                          {formatAmount(transaction.balanceAfter, orgCurrency, locale)}
                        </td>
                        <td className={cn("px-4 py-3", MUTED)}>
                          {formatDate(transaction.occurredAt, locale)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-[#e8edf3] px-4 py-3">
              <p className={cn("text-[11.5px]", MUTED)}>
                {t("showingRange", {
                  from: pageStart + 1,
                  to: Math.min(pageStart + PAGE_SIZE, transactions.length),
                  total: transactions.length,
                })}
              </p>
              <div className="flex items-center gap-2">
                <AppButton
                  variant="outline"
                  className="size-8 rounded-[8px] border-[#e8edf3] p-0"
                  disabled={currentPage === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label={t("prevPage")}
                >
                  <ChevronLeft className="size-4 rtl:rotate-180" />
                </AppButton>
                <span className={cn("text-[11.5px]", MUTED)}>
                  {currentPage} / {totalPages}
                </span>
                <AppButton
                  variant="outline"
                  className="size-8 rounded-[8px] border-[#e8edf3] p-0"
                  disabled={currentPage === totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-label={t("nextPage")}
                >
                  <ChevronRight className="size-4 rtl:rotate-180" />
                </AppButton>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Print-only view of the full (unpaginated, currently-filtered) transaction table -- same
          portal-to-body pattern as CustomerStatement's own print target. Kept at a fixed RTL
          layout regardless of the active UI locale, same deliberate exception as every other
          print document in this app (see purchase-print-document.tsx) -- only the text follows
          locale. */}
      {typeof document !== "undefined"
        ? createPortal(
            <div id="supplier-statement-print-target" className="hidden p-6 print:block" dir="rtl">
              <div className="mb-4 flex items-center justify-between gap-4 border-b border-[#e1e7f0] pb-3">
                <div>
                  <h1 className="text-[16px] font-extrabold text-[#0d1b3e]">{t("heading")}</h1>
                  <p className="mt-0.5 text-[12px] text-[#5b6b85]">{supplier.name}</p>
                  <p className="mt-0.5 text-[11px] text-[#5b6b85]">
                    {t("printGeneratedAt", {
                      date: new Intl.DateTimeFormat(
                        locale === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-US",
                        { dateStyle: "long", timeStyle: "short" }
                      ).format(new Date()),
                    })}
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
              <StatementTable
                transactions={transactions}
                currency={orgCurrency}
                locale={locale}
                tTable={tTable}
                tStatement={t}
                tVouchers={tVouchers}
              />
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

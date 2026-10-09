"use client"

import { useMemo, useState } from "react"
import { Download, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppPageHeader, AppSearchInput } from "@/components/app"

import { useReadyReportFilters, useSalesByUserPaymentMethodReport } from "../hooks"
import { exportInvoiceSourceToCsv } from "../services"
import {
  bucketKeyForPaymentMethod,
  NestedSourceTable,
  PAYMENT_METHOD_BUCKETS,
  type SourceGroup,
} from "./nested-source-table"
import { FIELD_CLASS, MUTED, PANEL, ReadyReportPagination } from "./ready-report-field"
import { ReadyReportFilterBar } from "./ready-report-filter-bar"

const PAGE_SIZE = 10

// Reuses the exact same backend aggregation as "Sales by User & Payment Method" -- "invoice
// source" is the POS cashier/user who issued the invoice (confirmed with the user; no real
// "invoice source" column exists anywhere in the schema). The flat rows are grouped client-side
// by cashier into an expandable per-source payment-method breakdown instead of a flat table.
export function SalesByInvoiceSourceReportPage() {
  const { dateRange, setDateRange, workspaceId, setWorkspaceId, filters } = useReadyReportFilters()
  const { data, isLoading } = useSalesByUserPaymentMethodReport(filters)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  const groups = useMemo<SourceGroup[]>(() => {
    if (!data) return []
    const bySource = new Map<string, SourceGroup>()
    for (const row of data.rows) {
      const sourceId = row.cashierUserId ?? "unknown"
      const group =
        bySource.get(sourceId) ??
        ({
          sourceId,
          sourceName: row.cashierName,
          totalSales: 0,
          invoiceCount: 0,
          avgInvoiceValue: 0,
          // Always the full fixed set of 6 categories, in order, even when a bucket has no
          // matching rows -- matches the reference design, which shows every category (at 0.00%)
          // rather than only the ones with data.
          paymentMethods: PAYMENT_METHOD_BUCKETS.map((bucket) => ({
            paymentMethod: bucket.key,
            invoiceCount: 0,
            totalSales: 0,
            pctOfSource: 0,
          })),
        } satisfies SourceGroup)
      group.totalSales += row.totalSales
      group.invoiceCount += row.invoiceCount
      const bucketKey = bucketKeyForPaymentMethod(row.paymentMethod)
      const bucket = group.paymentMethods.find((method) => method.paymentMethod === bucketKey)
      if (bucket) {
        bucket.invoiceCount += row.invoiceCount
        bucket.totalSales += row.totalSales
      }
      bySource.set(sourceId, group)
    }
    const result = [...bySource.values()]
    for (const group of result) {
      group.avgInvoiceValue = group.invoiceCount > 0 ? group.totalSales / group.invoiceCount : 0
      for (const method of group.paymentMethods) {
        method.pctOfSource =
          group.totalSales > 0
            ? Math.round((method.totalSales / group.totalSales) * 10000) / 100
            : 0
      }
    }
    return result.sort((left, right) => right.totalSales - left.totalSales)
  }, [data])

  const filteredGroups = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return groups
    return groups.filter((group) => group.sourceName.toLowerCase().includes(query))
  }, [groups, search])

  const totalPages = Math.max(1, Math.ceil(filteredGroups.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedGroups = filteredGroups.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const rangeStart = filteredGroups.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filteredGroups.length)

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <AppPageHeader
        breadcrumbItems={[
          { label: "التقارير", href: ROUTES.reports },
          { label: "المبيعات حسب مصدري الفاتورة", current: true },
        ]}
        title="المبيعات حسب مصدري الفاتورة"
        subtitle="إجمالي المبيعات وعدد الفواتير ومتوسط قيمة الفاتورة لكل مصدر فاتورة مع تفاصيل طرق الدفع."
        actions={
          <AppButton
            icon={
              <span className="flex size-5 items-center justify-center rounded-full bg-white/20">
                <Download className="size-3.5" strokeWidth={2.5} />
              </span>
            }
            className="h-11 gap-2 rounded-full bg-[#2878ff] px-5 text-[13.5px] font-bold text-white shadow-[0_6px_16px_rgba(40,120,255,0.28)] transition-all hover:-translate-y-px hover:bg-[#1f63d6]"
            onClick={() => exportInvoiceSourceToCsv(filteredGroups)}
          >
            تصدير التقرير
          </AppButton>
        }
      />

      <ReadyReportFilterBar
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        workspaceId={workspaceId}
        onWorkspaceChange={setWorkspaceId}
      />

      {isLoading || !data ? (
        <div className="flex items-center justify-center gap-2 p-16 text-[13px] text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          جارٍ التحميل...
        </div>
      ) : (
        <div className={cn(PANEL, "overflow-hidden")}>
          <div className="border-b border-[#e1e7f0] p-4">
            <AppSearchInput
              placeholder="بحث باسم المصدر أو الرمز..."
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              wrapperClassName="w-full sm:w-72"
              className={FIELD_CLASS}
            />
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <NestedSourceTable groups={pagedGroups} />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e1e7f0] px-4 py-3">
            <p className={cn("shrink-0 text-sm whitespace-nowrap", MUTED)}>
              عرض {rangeStart} - {rangeEnd} من {filteredGroups.length} نتيجة
            </p>
            <ReadyReportPagination
              page={currentPage}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </div>
        </div>
      )}
    </div>
  )
}

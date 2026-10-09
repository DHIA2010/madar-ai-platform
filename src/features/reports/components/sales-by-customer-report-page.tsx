"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Loader2, Receipt, ShoppingBag, UserPlus, Users } from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppSearchInput } from "@/components/app"

import { useReadyReportFilters, useSalesByCustomerReport } from "../hooks"
import { MultiSeriesTrendChart } from "./multi-series-trend-chart"
import { RankedListCard } from "./ranked-list-card"
import {
  FIELD_CLASS,
  formatCurrency,
  HEADING,
  MUTED,
  PANEL,
  ReadyReportKpiCard,
  ReadyReportPagination,
  ReadyReportTrendBadge,
} from "./ready-report-field"
import { ReadyReportFilterBar } from "./ready-report-filter-bar"

const PAGE_SIZE = 10

function pivotTrend(points: Array<{ name: string; bucket: string; value: number }>) {
  const buckets = new Map<string, Record<string, string | number>>()
  for (const point of points) {
    const row = buckets.get(point.bucket) ?? { label: point.bucket.slice(0, 7) }
    row[point.name] = point.value
    buckets.set(point.bucket, row)
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, row]) => row)
}

export function SalesByCustomerReportPage() {
  const router = useRouter()
  const { dateRange, setDateRange, workspaceId, setWorkspaceId, filters } = useReadyReportFilters()
  const { data, isLoading } = useSalesByCustomerReport(filters, null)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return data?.customers ?? []
    return (data?.customers ?? []).filter((customer) =>
      customer.customerName.toLowerCase().includes(query)
    )
  }, [data, search])

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedCustomers = filteredCustomers.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  const trendData = useMemo(() => pivotTrend(data?.trend ?? []), [data])
  const trendSeriesKeys = useMemo(
    () => [...new Set((data?.trend ?? []).map((point) => point.name))],
    [data]
  )
  const topCustomers = useMemo(
    () =>
      (data?.customers ?? [])
        .slice(0, 10)
        .map((c) => ({ label: c.customerName, value: c.totalSales })),
    [data]
  )
  const topFive = topCustomers.slice(0, 5)

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => router.push(ROUTES.reports)}
        className="flex w-fit items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowRight className="size-3.5" />
        العودة إلى التقارير
      </button>

      <div>
        <h1 className={cn("text-2xl font-bold", HEADING)}>تقرير المبيعات حسب العميل</h1>
        <p className={cn("mt-1 text-sm", MUTED)}>تحليل المبيعات والطلبات لكل عميل.</p>
      </div>

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
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ReadyReportKpiCard
              label="العملاء الجدد"
              value={String(data.kpis.newCustomers.value)}
              icon={UserPlus}
              tone="emerald"
              trailing={
                <ReadyReportTrendBadge changePercent={data.kpis.newCustomers.changePercent} />
              }
            />
            <ReadyReportKpiCard
              label="متوسط قيمة الطلب للعميل"
              value={formatCurrency(data.kpis.avgOrderValue.value)}
              icon={ShoppingBag}
              tone="blue"
              trailing={
                <ReadyReportTrendBadge changePercent={data.kpis.avgOrderValue.changePercent} />
              }
            />
            <ReadyReportKpiCard
              label="عدد العملاء"
              value={String(data.kpis.customerCount.value)}
              icon={Users}
              tone="violet"
              trailing={
                <ReadyReportTrendBadge changePercent={data.kpis.customerCount.changePercent} />
              }
            />
            <ReadyReportKpiCard
              label="إجمالي المبيعات"
              value={formatCurrency(data.kpis.totalSales.value)}
              icon={Receipt}
              tone="amber"
              trailing={
                <ReadyReportTrendBadge changePercent={data.kpis.totalSales.changePercent} />
              }
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <RankedListCard
              title="توزيع المبيعات حسب العميل (أعلى 10 عملاء)"
              entries={topCustomers}
            />
            <MultiSeriesTrendChart
              title="اتجاه المبيعات حسب العميل"
              data={trendData}
              seriesKeys={trendSeriesKeys}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className={cn(PANEL, "overflow-hidden lg:col-span-2")}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e1e7f0] p-4">
                <h3 className={cn("text-[13.5px] font-bold", HEADING)}>
                  تفاصيل المبيعات حسب العميل
                </h3>
                <AppSearchInput
                  placeholder="بحث عن عميل..."
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setPage(1)
                  }}
                  wrapperClassName="w-full sm:w-56"
                  className={FIELD_CLASS}
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-right">
                  <thead>
                    <tr>
                      {[
                        "العميل",
                        "إجمالي المبيعات",
                        "عدد الطلبات",
                        "متوسط قيمة الطلب",
                        "آخر طلب",
                      ].map((heading) => (
                        <th
                          key={heading}
                          className="border-b border-[#eef2f8] px-3 py-2.5 text-[11px] font-semibold text-black"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedCustomers.map((customer) => (
                      <tr key={customer.customerId} className="border-b border-[#f4f7fb]">
                        <td className="px-3 py-2 text-[12px] font-medium text-black">
                          {customer.customerName}
                        </td>
                        <td className="px-3 py-2 text-[12px] font-bold text-black">
                          {formatCurrency(customer.totalSales)}
                        </td>
                        <td className="px-3 py-2 text-[12px] text-black">{customer.orderCount}</td>
                        <td className="px-3 py-2 text-[12px] text-black">
                          {formatCurrency(customer.avgOrderValue)}
                        </td>
                        <td className="px-3 py-2 text-[12px] text-black">
                          {customer.lastOrderDate ?? "—"}
                        </td>
                      </tr>
                    ))}
                    {pagedCustomers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className={cn("py-10 text-center text-[12.5px]", MUTED)}>
                          لا توجد نتائج مطابقة
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e1e7f0] px-4 py-3">
                <p className={cn("shrink-0 text-sm whitespace-nowrap", MUTED)}>
                  عرض {pagedCustomers.length} من {filteredCustomers.length} عميل
                </p>
                <ReadyReportPagination
                  page={currentPage}
                  totalPages={totalPages}
                  onPageChange={setPage}
                />
              </div>
            </div>
            <RankedListCard title="أهم العملاء" entries={topFive} />
          </div>
        </>
      )}
    </div>
  )
}

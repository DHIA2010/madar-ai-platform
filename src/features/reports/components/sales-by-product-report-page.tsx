"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Loader2, Package, Receipt, ShoppingBag, Tag } from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppSearchInput } from "@/components/app"

import { useReadyReportFilters, useSalesByProductReport } from "../hooks"
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

export function SalesByProductReportPage() {
  const router = useRouter()
  const { dateRange, setDateRange, workspaceId, setWorkspaceId, filters } = useReadyReportFilters()
  const { data, isLoading } = useSalesByProductReport(filters)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return data?.products ?? []
    return (data?.products ?? []).filter((product) =>
      product.productName.toLowerCase().includes(query)
    )
  }, [data, search])

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedProducts = filteredProducts.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  const trendData = useMemo(() => pivotTrend(data?.trend ?? []), [data])
  const trendSeriesKeys = useMemo(
    () => [...new Set((data?.trend ?? []).map((point) => point.name))],
    [data]
  )
  const topProducts = useMemo(
    () =>
      (data?.products ?? [])
        .slice(0, 10)
        .map((p) => ({ label: p.productName, value: p.totalSales })),
    [data]
  )
  const topCategories = useMemo(
    () =>
      (data?.categories ?? []).slice(0, 5).map((c) => ({ label: c.category, value: c.totalSales })),
    [data]
  )

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
        <h1 className={cn("text-2xl font-bold", HEADING)}>تقرير المبيعات حسب المنتج</h1>
        <p className={cn("mt-1 text-sm", MUTED)}>تحليل المبيعات لكل منتج وفئة.</p>
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <ReadyReportKpiCard
              label="عدد المنتجات المباعة"
              value={String(data.kpis.productsSoldCount)}
              icon={Package}
              tone="violet"
            />
            <ReadyReportKpiCard
              label="متوسط سعر المنتج"
              value={formatCurrency(data.kpis.avgProductPrice)}
              icon={Tag}
              tone="amber"
            />
            <ReadyReportKpiCard
              label="عدد المنتجات"
              value={String(data.kpis.productCount)}
              icon={ShoppingBag}
              tone="blue"
            />
            <ReadyReportKpiCard
              label="صافي المبيعات"
              value={formatCurrency(data.kpis.netSales)}
              icon={Receipt}
              tone="emerald"
            />
            <ReadyReportKpiCard
              label="إجمالي المبيعات"
              value={formatCurrency(data.kpis.totalSales)}
              icon={Receipt}
              tone="blue"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <RankedListCard title="أعلى المنتجات مبيعاً" entries={topProducts} />
            <MultiSeriesTrendChart
              title="اتجاه المبيعات حسب المنتج"
              data={trendData}
              seriesKeys={trendSeriesKeys}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className={cn(PANEL, "overflow-hidden lg:col-span-2")}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e1e7f0] p-4">
                <h3 className={cn("text-[13.5px] font-bold", HEADING)}>
                  تفاصيل المبيعات حسب المنتج
                </h3>
                <AppSearchInput
                  placeholder="بحث عن منتج..."
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
                      {["المنتج", "الفئة", "الكمية المباعة", "عدد الطلبات", "إجمالي المبيعات"].map(
                        (heading) => (
                          <th
                            key={heading}
                            className="border-b border-[#eef2f8] px-3 py-2.5 text-[11px] font-semibold text-black"
                          >
                            {heading}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedProducts.map((product) => (
                      <tr key={product.productId} className="border-b border-[#f4f7fb]">
                        <td className="px-3 py-2 text-[12px] font-medium text-black">
                          {product.productName}
                        </td>
                        <td className="px-3 py-2 text-[12px] text-black">{product.category}</td>
                        <td className="px-3 py-2 text-[12px] text-black">{product.quantitySold}</td>
                        <td className="px-3 py-2 text-[12px] text-black">{product.orderCount}</td>
                        <td className="px-3 py-2 text-[12px] font-bold text-black">
                          {formatCurrency(product.totalSales)}
                        </td>
                      </tr>
                    ))}
                    {pagedProducts.length === 0 ? (
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
                  عرض {pagedProducts.length} من {filteredProducts.length} منتج
                </p>
                <ReadyReportPagination
                  page={currentPage}
                  totalPages={totalPages}
                  onPageChange={setPage}
                />
              </div>
            </div>
            <RankedListCard title="أهم الفئات" entries={topCategories} />
          </div>
        </>
      )}
    </div>
  )
}

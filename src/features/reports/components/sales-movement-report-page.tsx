"use client"

import { Loader2, Package, Receipt, ShoppingCart, Wallet } from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppPageHeader } from "@/components/app"

import { useReadyReportFilters, useSalesMovementReport } from "../hooks"
import {
  HEADING,
  MUTED,
  PANEL,
  ReadyReportKpiCard,
  ReadyReportTrendBadge,
} from "./ready-report-field"
import { ReadyReportFilterBar } from "./ready-report-filter-bar"
import { SalesMovementChart } from "./sales-movement-chart"

function todayRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  return { from, to }
}

function formatPlainNumber(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatHourLabel(hour: number): string {
  const period = hour < 12 ? "ص" : "م"
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12
  return `${twelveHour} ${period}`
}

export function SalesMovementReportPage() {
  const { dateRange, setDateRange, workspaceId, setWorkspaceId, filters } =
    useReadyReportFilters(todayRange)
  const { data, isLoading } = useSalesMovementReport(filters)

  const totals = data?.hours.reduce(
    (sum, row) => ({
      invoiceCount: sum.invoiceCount + row.invoiceCount,
      totalSales: sum.totalSales + row.totalSales,
      itemsSold: sum.itemsSold + row.itemsSold,
    }),
    { invoiceCount: 0, totalSales: 0, itemsSold: 0 }
  )

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <AppPageHeader
        breadcrumbItems={[
          { label: "التقارير", href: ROUTES.reports },
          { label: "تقرير الحركة اليومية للمبيعات", current: true },
        ]}
        title="تقرير الحركة اليومية للمبيعات"
        subtitle="نشاط المبيعات خلال اليوم حسب الوقت."
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
        <>
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            <ReadyReportKpiCard
              label="إجمالي المبيعات"
              value={`${formatPlainNumber(data.kpis.totalSales.value)} ر.س`}
              icon={ShoppingCart}
              tone="emerald"
              trailing={
                <ReadyReportTrendBadge changePercent={data.kpis.totalSales.changePercent} />
              }
            />
            <ReadyReportKpiCard
              label="عدد الفواتير"
              value={String(data.kpis.invoiceCount.value)}
              icon={Receipt}
              tone="violet"
              trailing={
                <ReadyReportTrendBadge changePercent={data.kpis.invoiceCount.changePercent} />
              }
            />
            <ReadyReportKpiCard
              label="عدد الأصناف المباعة"
              value={String(data.kpis.itemsSold.value)}
              icon={Package}
              tone="blue"
              trailing={<ReadyReportTrendBadge changePercent={data.kpis.itemsSold.changePercent} />}
            />
            <ReadyReportKpiCard
              label="متوسط قيمة الفاتورة"
              value={`${formatPlainNumber(data.kpis.avgInvoiceValue.value)} ر.س`}
              icon={Wallet}
              tone="amber"
              trailing={
                <ReadyReportTrendBadge changePercent={data.kpis.avgInvoiceValue.changePercent} />
              }
            />
          </div>

          <SalesMovementChart hours={data.hours} />

          <div className={cn(PANEL, "overflow-hidden")}>
            <div className="border-b border-[#e1e7f0] px-5 py-4">
              <h2 className={cn("text-[15.5px] font-bold", HEADING)}>تفاصيل الحركة حسب الساعة</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-right">
                <thead>
                  <tr className="border-b border-[#e1e7f0]">
                    <th className="px-3 py-2.5 text-[11px] font-bold text-black">الساعة</th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-bold text-black">
                      عدد الفواتير
                    </th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-bold text-black">
                      المبيعات (ر.س)
                    </th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-bold text-black">
                      عدد الأصناف المباعة
                    </th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-bold text-black">
                      متوسط قيمة الفاتورة (ر.س)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.hours.map((row) => (
                    <tr key={row.hour} className="border-b border-[#f1f4f9]">
                      <td className={cn("px-3 py-2 text-[12px] font-semibold", HEADING)}>
                        {formatHourLabel(row.hour)}
                      </td>
                      <td className={cn("px-3 py-2 text-center text-[12px]", MUTED)}>
                        {row.invoiceCount}
                      </td>
                      <td className={cn("px-3 py-2 text-center text-[12px] font-bold", HEADING)}>
                        {formatPlainNumber(row.totalSales)}
                      </td>
                      <td className={cn("px-3 py-2 text-center text-[12px]", MUTED)}>
                        {row.itemsSold}
                      </td>
                      <td className={cn("px-3 py-2 text-center text-[12px] font-bold", HEADING)}>
                        {formatPlainNumber(row.avgInvoiceValue)}
                      </td>
                    </tr>
                  ))}
                  {totals ? (
                    <tr className="bg-[#f7f9fd]">
                      <td className={cn("px-3 py-2.5 text-[12.5px] font-bold", HEADING)}>
                        الإجمالي
                      </td>
                      <td
                        className={cn("px-3 py-2.5 text-center text-[12.5px] font-bold", HEADING)}
                      >
                        {totals.invoiceCount}
                      </td>
                      <td
                        className={cn("px-3 py-2.5 text-center text-[12.5px] font-bold", HEADING)}
                      >
                        {formatPlainNumber(totals.totalSales)}
                      </td>
                      <td
                        className={cn("px-3 py-2.5 text-center text-[12.5px] font-bold", HEADING)}
                      >
                        {totals.itemsSold}
                      </td>
                      <td
                        className={cn("px-3 py-2.5 text-center text-[12.5px] font-bold", HEADING)}
                      >
                        {formatPlainNumber(data.kpis.avgInvoiceValue.value)}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

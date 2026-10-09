"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  Loader2,
  Package,
  Percent,
  Receipt,
  RotateCcw,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppSearchableSelect } from "@/components/app"

import { useNetIncomeReport, useReadyReportFilters } from "../hooks"
import { NetIncomeByBranchChart } from "./net-income-by-branch-chart"
import { NetIncomeSuggestionsPanel } from "./net-income-suggestions-panel"
import { formatCurrency, HEADING, MUTED, PANEL, ReadyReportKpiCard } from "./ready-report-field"
import { ReadyReportFilterBar } from "./ready-report-filter-bar"
import { WaterfallChart } from "./waterfall-chart"

const TIME_GROUPING_OPTIONS = [
  { value: "month", label: "شهري" },
  { value: "week", label: "أسبوعي" },
  { value: "day", label: "يومي" },
]

export function NetIncomeReportPage() {
  const router = useRouter()
  const { dateRange, setDateRange, workspaceId, setWorkspaceId, filters } = useReadyReportFilters()
  const [timeGrouping, setTimeGrouping] = useState<"day" | "week" | "month">("month")
  const { data, isLoading } = useNetIncomeReport(filters, timeGrouping)

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
        <h1 className={cn("text-2xl font-bold", HEADING)}>تقرير صافي الدخل</h1>
        <p className={cn("mt-1 text-sm", MUTED)}>تحليل صافي الدخل من المبيعات والمصروفات.</p>
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
          {/* Reversed to match the waterfall chart's own right-to-left flow: المبيعات starts on
              the right, صافي الدخل ends on the left. */}
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
            <ReadyReportKpiCard
              label="المبيعات"
              value={formatCurrency(data.totals.sales)}
              icon={Receipt}
              tone="blue"
            />
            <ReadyReportKpiCard
              label="المرتجعات"
              value={formatCurrency(data.totals.returns)}
              icon={RotateCcw}
              tone="rose"
            />
            <ReadyReportKpiCard
              label="صافي المبيعات"
              value={formatCurrency(data.totals.netSales)}
              icon={ShoppingBag}
              tone="emerald"
            />
            <ReadyReportKpiCard
              label="الضريبة"
              value={formatCurrency(data.totals.tax)}
              icon={Percent}
              tone="amber"
            />
            <ReadyReportKpiCard
              label="تكلفة المنتجات المباعة"
              value={formatCurrency(data.totals.cogs)}
              icon={Package}
              tone="blue"
            />
            <ReadyReportKpiCard
              label="تكلفة المنتجات المسترجعة"
              value={formatCurrency(data.totals.returnedCogs)}
              icon={RotateCcw}
              tone="violet"
            />
            <ReadyReportKpiCard
              label="المصروفات"
              value={formatCurrency(data.totals.expenses)}
              icon={Wallet}
              tone="amber"
            />
            <ReadyReportKpiCard
              label="صافي الدخل"
              value={formatCurrency(data.totals.netIncome)}
              icon={data.totals.netIncome >= 0 ? TrendingUp : TrendingDown}
              tone={data.totals.netIncome >= 0 ? "emerald" : "rose"}
              emphasis={data.totals.netIncome >= 0 ? "positive" : "negative"}
            />
          </div>

          <div className="grid items-stretch gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <WaterfallChart steps={data.waterfall} />
            </div>
            <NetIncomeSuggestionsPanel totals={data.totals} />
          </div>

          <NetIncomeByBranchChart branches={data.byBranch} />

          <div className={cn(PANEL, "overflow-hidden")}>
            <div className="flex items-center justify-between border-b border-[#e1e7f0] px-4 py-3">
              <h3 className={cn("text-[13.5px] font-bold", HEADING)}>تفاصيل الحسابات حسب الفترة</h3>
              <AppSearchableSelect
                value={timeGrouping}
                options={TIME_GROUPING_OPTIONS}
                onChange={(value) => setTimeGrouping(value as typeof timeGrouping)}
                ariaLabel="التجميع الزمني"
                triggerClassName="w-[140px]"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-right">
                <thead>
                  <tr>
                    {[
                      "الفترة",
                      "المبيعات",
                      "المرتجعات",
                      "صافي المبيعات",
                      "الضريبة",
                      "تكلفة المنتجات المباعة",
                      "تكلفة المنتجات المسترجعة",
                      "المصروفات",
                      "صافي الدخل",
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
                  {data.periods.map((period) => (
                    <tr key={period.label} className="border-b border-[#f4f7fb]">
                      <td className="px-3 py-2 text-[12px] text-black">
                        {period.label.slice(0, 10)}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-black">
                        {formatCurrency(period.sales)}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-black">
                        {formatCurrency(period.returns)}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-black">
                        {formatCurrency(period.netSales)}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-black">
                        {formatCurrency(period.tax)}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-black">
                        {formatCurrency(period.cogs)}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-black">
                        {formatCurrency(period.returnedCogs)}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-black">
                        {formatCurrency(period.expenses)}
                      </td>
                      <td className="px-3 py-2 text-[12px] font-bold text-black">
                        {formatCurrency(period.netIncome)}
                      </td>
                    </tr>
                  ))}
                  {data.periods.length === 0 ? (
                    <tr>
                      <td colSpan={9} className={cn("py-10 text-center text-[12.5px]", MUTED)}>
                        لا توجد بيانات لهذه الفترة
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

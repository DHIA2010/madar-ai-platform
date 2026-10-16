"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import {
  ArrowLeft,
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

import type { Locale } from "@/i18n/locales"
import { localeDirection } from "@/i18n/locales"

export function NetIncomeReportPage() {
  const t = useTranslations("reports.netIncome")
  const tKpiWidget = useTranslations("reports.kpiWidget")
  const tCommon = useTranslations("reports.common")
  const locale = useLocale() as Locale
  const TIME_GROUPING_OPTIONS = [
    { value: "month", label: tKpiWidget("timeGroupingLabels.month") },
    { value: "week", label: tKpiWidget("timeGroupingLabels.week") },
    { value: "day", label: tKpiWidget("timeGroupingLabels.day") },
  ]
  const router = useRouter()
  const { dateRange, setDateRange, workspaceId, setWorkspaceId, filters } = useReadyReportFilters()
  const [timeGrouping, setTimeGrouping] = useState<"day" | "week" | "month">("month")
  const { data, isLoading } = useNetIncomeReport(filters, timeGrouping)

  return (
    <div dir={localeDirection(locale)} className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => router.push(ROUTES.reports)}
        className="flex w-fit items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5 rtl:rotate-180" />
        {t("backToReports")}
      </button>

      <div>
        <h1 className={cn("text-2xl font-bold", HEADING)}>{t("title")}</h1>
        <p className={cn("mt-1 text-sm", MUTED)}>{t("subtitle")}</p>
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
          {tCommon("loading")}
        </div>
      ) : (
        <>
          {/* Reversed to match the waterfall chart's own right-to-left flow: sales starts on the
              right (in RTL), net income ends on the left. */}
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
            <ReadyReportKpiCard
              label={t("kpis.sales")}
              value={formatCurrency(data.totals.sales, locale)}
              icon={Receipt}
              tone="blue"
            />
            <ReadyReportKpiCard
              label={t("kpis.returns")}
              value={formatCurrency(data.totals.returns, locale)}
              icon={RotateCcw}
              tone="rose"
            />
            <ReadyReportKpiCard
              label={t("kpis.netSales")}
              value={formatCurrency(data.totals.netSales, locale)}
              icon={ShoppingBag}
              tone="emerald"
            />
            <ReadyReportKpiCard
              label={t("kpis.tax")}
              value={formatCurrency(data.totals.tax, locale)}
              icon={Percent}
              tone="amber"
            />
            <ReadyReportKpiCard
              label={t("kpis.cogs")}
              value={formatCurrency(data.totals.cogs, locale)}
              icon={Package}
              tone="blue"
            />
            <ReadyReportKpiCard
              label={t("kpis.returnedCogs")}
              value={formatCurrency(data.totals.returnedCogs, locale)}
              icon={RotateCcw}
              tone="violet"
            />
            <ReadyReportKpiCard
              label={t("kpis.expenses")}
              value={formatCurrency(data.totals.expenses, locale)}
              icon={Wallet}
              tone="amber"
            />
            <ReadyReportKpiCard
              label={t("kpis.netIncome")}
              value={formatCurrency(data.totals.netIncome, locale)}
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
              <h3 className={cn("text-[13.5px] font-bold", HEADING)}>{t("table.sectionTitle")}</h3>
              <AppSearchableSelect
                value={timeGrouping}
                options={TIME_GROUPING_OPTIONS}
                onChange={(value) => setTimeGrouping(value as typeof timeGrouping)}
                ariaLabel={t("table.timeGroupingAriaLabel")}
                triggerClassName="w-[140px]"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-right">
                <thead>
                  <tr>
                    {[
                      t("table.period"),
                      t("kpis.sales"),
                      t("kpis.returns"),
                      t("kpis.netSales"),
                      t("kpis.tax"),
                      t("kpis.cogs"),
                      t("kpis.returnedCogs"),
                      t("kpis.expenses"),
                      t("kpis.netIncome"),
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
                        {formatCurrency(period.sales, locale)}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-black">
                        {formatCurrency(period.returns, locale)}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-black">
                        {formatCurrency(period.netSales, locale)}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-black">
                        {formatCurrency(period.tax, locale)}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-black">
                        {formatCurrency(period.cogs, locale)}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-black">
                        {formatCurrency(period.returnedCogs, locale)}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-black">
                        {formatCurrency(period.expenses, locale)}
                      </td>
                      <td className="px-3 py-2 text-[12px] font-bold text-black">
                        {formatCurrency(period.netIncome, locale)}
                      </td>
                    </tr>
                  ))}
                  {data.periods.length === 0 ? (
                    <tr>
                      <td colSpan={9} className={cn("py-10 text-center text-[12.5px]", MUTED)}>
                        {t("table.noData")}
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

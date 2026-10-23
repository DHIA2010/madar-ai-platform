"use client"

import { useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { CreditCard, Loader2, Receipt, RotateCcw, TrendingUp, Users, Wallet } from "lucide-react"

import { cn } from "@/lib/utils"

import { useReadyReportFilters, usePosSummaryReport } from "@/features/reports"
import { posPaymentMethodsService } from "@/features/pos/services/pos-payment-methods.service"

import {
  HEADING,
  MUTED,
  PANEL,
  ReadyReportKpiCard,
  ReadyReportTrendBadge,
} from "@/features/reports/components/ready-report-field"
import { ReadyReportFilterBar } from "@/features/reports/components/ready-report-filter-bar"
import { PosSummaryPaymentDonut } from "@/features/reports/components/pos-summary-payment-donut"
import { PosSummaryTrendChart } from "@/features/reports/components/pos-summary-trend-chart"

import { type Locale, localeDirection } from "@/i18n/locales"

function formatPlainNumber(value: number, locale: Locale): string {
  return value.toLocaleString(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function PosSummaryDashboard() {
  const t = useTranslations("dashboard.posSummary")
  const locale = useLocale() as Locale
  const currency = locale === "ar" ? "ر.س" : "SAR"
  const { dateRange, setDateRange, workspaceId, setWorkspaceId, filters } = useReadyReportFilters()
  const { data, isLoading } = usePosSummaryReport(filters)

  // Fetched once, independent of the report's own loading state -- resolves a payment_method_code
  // to its real configured display name (e.g. "mada" -> "مدى") for the donut, same service the
  // cashier checkout screen already uses.
  const [paymentMethodNames, setPaymentMethodNames] = useState<Record<string, string>>({})
  useEffect(() => {
    let cancelled = false
    posPaymentMethodsService
      .list()
      .then((methods) => {
        if (cancelled) return
        setPaymentMethodNames(
          Object.fromEntries(methods.map((method) => [method.code, method.name]))
        )
      })
      .catch(() => {
        // Donut falls back to raw payment_method_code labels -- not worth a dedicated error state.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const topProductsTotal =
    data?.topProducts.reduce((sum, product) => sum + product.totalSales, 0) ?? 0

  return (
    <div dir={localeDirection(locale)} className="flex flex-col gap-4">
      <ReadyReportFilterBar
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        workspaceId={workspaceId}
        onWorkspaceChange={setWorkspaceId}
      />

      {isLoading || !data ? (
        <div className="flex items-center justify-center gap-2 p-16 text-[13px] text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            <ReadyReportKpiCard
              label={t("kpis.totalSales")}
              value={`${formatPlainNumber(data.kpis.totalSales.value, locale)} ${currency}`}
              icon={Wallet}
              tone="blue"
              trailing={
                <ReadyReportTrendBadge changePercent={data.kpis.totalSales.changePercent} />
              }
            />
            <ReadyReportKpiCard
              label={t("kpis.netSales")}
              value={`${formatPlainNumber(data.kpis.netSales.value, locale)} ${currency}`}
              icon={TrendingUp}
              tone="emerald"
              trailing={<ReadyReportTrendBadge changePercent={data.kpis.netSales.changePercent} />}
            />
            <ReadyReportKpiCard
              label={t("kpis.customerCount")}
              value={String(data.kpis.customerCount.value)}
              icon={Users}
              tone="violet"
              trailing={
                <ReadyReportTrendBadge changePercent={data.kpis.customerCount.changePercent} />
              }
            />
            <ReadyReportKpiCard
              label={t("kpis.returns")}
              value={`${formatPlainNumber(data.kpis.returns.value, locale)} ${currency}`}
              icon={RotateCcw}
              tone="rose"
              trailing={<ReadyReportTrendBadge changePercent={data.kpis.returns.changePercent} />}
            />
            <ReadyReportKpiCard
              label={t("kpis.avgInvoiceValue")}
              value={`${formatPlainNumber(data.kpis.avgInvoiceValue.value, locale)} ${currency}`}
              icon={CreditCard}
              tone="amber"
              trailing={
                <ReadyReportTrendBadge changePercent={data.kpis.avgInvoiceValue.changePercent} />
              }
            />
            <ReadyReportKpiCard
              label={t("kpis.invoiceCount")}
              value={String(data.kpis.invoiceCount.value)}
              icon={Receipt}
              tone="blue"
              trailing={
                <ReadyReportTrendBadge changePercent={data.kpis.invoiceCount.changePercent} />
              }
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <PosSummaryPaymentDonut rows={data.paymentBreakdown} nameByCode={paymentMethodNames} />
            <PosSummaryTrendChart trend={data.trend} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className={cn(PANEL, "overflow-hidden")}>
              <div className="border-b border-[#e1e7f0] px-5 py-4">
                <h2 className={cn("text-[14.5px] font-bold", HEADING)}>{t("topProductsTitle")}</h2>
              </div>
              {data.topProducts.length === 0 ? (
                <p className={cn("py-10 text-center text-[12.5px]", MUTED)}>{t("noData")}</p>
              ) : (
                <table className="w-full text-right">
                  <tbody>
                    {data.topProducts.map((product, index) => {
                      const percentage =
                        topProductsTotal > 0 ? (product.totalSales / topProductsTotal) * 100 : 0
                      return (
                        <tr
                          key={product.productId}
                          className="border-b border-[#f1f4f9] last:border-0"
                        >
                          <td className="w-10 px-3 py-2.5 text-center text-[12px] font-bold text-[#95a4bd]">
                            {index + 1}
                          </td>
                          <td className="px-3 py-2.5">
                            <p className={cn("text-[12.5px] font-semibold", HEADING)}>
                              {product.productName}
                            </p>
                            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#f1f4f9]">
                              <div
                                className="h-full rounded-full bg-[#2878ff]"
                                style={{ width: `${Math.min(percentage, 100)}%` }}
                              />
                            </div>
                          </td>
                          <td className={cn("whitespace-nowrap px-3 py-2.5 text-[12px]", MUTED)}>
                            {product.quantitySold}
                          </td>
                          <td
                            className={cn(
                              "whitespace-nowrap px-3 py-2.5 text-[12.5px] font-bold",
                              HEADING
                            )}
                          >
                            {formatPlainNumber(product.totalSales, locale)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-[12px] font-semibold text-[#95a4bd]">
                            {percentage.toFixed(1)}%
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className={cn(PANEL, "overflow-hidden")}>
              <div className="border-b border-[#e1e7f0] px-5 py-4">
                <h2 className={cn("text-[14.5px] font-bold", HEADING)}>{t("branchesTitle")}</h2>
              </div>
              {data.branches.length === 0 ? (
                <p className={cn("py-10 text-center text-[12.5px]", MUTED)}>{t("noData")}</p>
              ) : (
                <table className="w-full text-right">
                  <tbody>
                    {data.branches.map((branch, index) => (
                      <tr
                        key={branch.workspaceId}
                        className="border-b border-[#f1f4f9] last:border-0"
                      >
                        <td className="w-10 px-3 py-2.5 text-center text-[12px] font-bold text-[#95a4bd]">
                          {index + 1}
                        </td>
                        <td className="px-3 py-2.5">
                          <p className={cn("text-[12.5px] font-semibold", HEADING)}>
                            {branch.workspaceName}
                          </p>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#f1f4f9]">
                            <div
                              className="h-full rounded-full bg-[#22c55e]"
                              style={{ width: `${Math.min(branch.contributionPercent, 100)}%` }}
                            />
                          </div>
                        </td>
                        <td className={cn("whitespace-nowrap px-3 py-2.5 text-[12px]", MUTED)}>
                          {branch.orderCount}
                        </td>
                        <td
                          className={cn(
                            "whitespace-nowrap px-3 py-2.5 text-[12.5px] font-bold",
                            HEADING
                          )}
                        >
                          {formatPlainNumber(branch.totalSales, locale)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-[12px] font-semibold text-[#95a4bd]">
                          {branch.contributionPercent.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

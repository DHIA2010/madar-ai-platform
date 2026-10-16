"use client"

import { useLocale, useTranslations } from "next-intl"
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

import { type Locale, localeDirection } from "@/i18n/locales"

function todayRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  return { from, to }
}

function formatPlainNumber(value: number, locale: Locale): string {
  return value.toLocaleString(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function SalesMovementReportPage() {
  const t = useTranslations("reports.salesMovement")
  const tCommon = useTranslations("reports.common")
  const locale = useLocale() as Locale
  const currency = locale === "ar" ? "ر.س" : "SAR"
  function formatHourLabel(hour: number): string {
    const period = hour < 12 ? t("amLabel") : t("pmLabel")
    const twelveHour = hour % 12 === 0 ? 12 : hour % 12
    return `${twelveHour} ${period}`
  }
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
    <div dir={localeDirection(locale)} className="flex flex-col gap-4">
      <AppPageHeader
        breadcrumbItems={[
          { label: tCommon("breadcrumbReports"), href: ROUTES.reports },
          { label: t("breadcrumbCurrent"), current: true },
        ]}
        title={t("title")}
        subtitle={t("subtitle")}
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
          {tCommon("loading")}
        </div>
      ) : (
        <>
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            <ReadyReportKpiCard
              label={t("kpis.totalSales")}
              value={`${formatPlainNumber(data.kpis.totalSales.value, locale)} ${currency}`}
              icon={ShoppingCart}
              tone="emerald"
              trailing={
                <ReadyReportTrendBadge changePercent={data.kpis.totalSales.changePercent} />
              }
            />
            <ReadyReportKpiCard
              label={t("kpis.invoiceCount")}
              value={String(data.kpis.invoiceCount.value)}
              icon={Receipt}
              tone="violet"
              trailing={
                <ReadyReportTrendBadge changePercent={data.kpis.invoiceCount.changePercent} />
              }
            />
            <ReadyReportKpiCard
              label={t("kpis.itemsSold")}
              value={String(data.kpis.itemsSold.value)}
              icon={Package}
              tone="blue"
              trailing={<ReadyReportTrendBadge changePercent={data.kpis.itemsSold.changePercent} />}
            />
            <ReadyReportKpiCard
              label={t("kpis.avgInvoiceValue")}
              value={`${formatPlainNumber(data.kpis.avgInvoiceValue.value, locale)} ${currency}`}
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
              <h2 className={cn("text-[15.5px] font-bold", HEADING)}>{t("table.sectionTitle")}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-right">
                <thead>
                  <tr className="border-b border-[#e1e7f0]">
                    <th className="px-3 py-2.5 text-[11px] font-bold text-black">
                      {t("table.hour")}
                    </th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-bold text-black">
                      {t("table.invoiceCount")}
                    </th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-bold text-black">
                      {t("table.sales", { currency })}
                    </th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-bold text-black">
                      {t("table.itemsSold")}
                    </th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-bold text-black">
                      {t("table.avgInvoiceValue", { currency })}
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
                        {formatPlainNumber(row.totalSales, locale)}
                      </td>
                      <td className={cn("px-3 py-2 text-center text-[12px]", MUTED)}>
                        {row.itemsSold}
                      </td>
                      <td className={cn("px-3 py-2 text-center text-[12px] font-bold", HEADING)}>
                        {formatPlainNumber(row.avgInvoiceValue, locale)}
                      </td>
                    </tr>
                  ))}
                  {totals ? (
                    <tr className="bg-[#f7f9fd]">
                      <td className={cn("px-3 py-2.5 text-[12.5px] font-bold", HEADING)}>
                        {t("table.totalRow")}
                      </td>
                      <td
                        className={cn("px-3 py-2.5 text-center text-[12.5px] font-bold", HEADING)}
                      >
                        {totals.invoiceCount}
                      </td>
                      <td
                        className={cn("px-3 py-2.5 text-center text-[12.5px] font-bold", HEADING)}
                      >
                        {formatPlainNumber(totals.totalSales, locale)}
                      </td>
                      <td
                        className={cn("px-3 py-2.5 text-center text-[12.5px] font-bold", HEADING)}
                      >
                        {totals.itemsSold}
                      </td>
                      <td
                        className={cn("px-3 py-2.5 text-center text-[12.5px] font-bold", HEADING)}
                      >
                        {formatPlainNumber(data.kpis.avgInvoiceValue.value, locale)}
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

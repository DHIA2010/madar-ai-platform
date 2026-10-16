"use client"

import { useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Download, Loader2, Package, ShoppingCart, Wallet } from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppPageHeader, AppSearchInput } from "@/components/app"

import { useReadyReportFilters, useSalesByBranchReport } from "../hooks"
import { exportSalesByBranchToCsv } from "../services"
import { FIELD_CLASS, HEADING, MUTED, PANEL, ReadyReportKpiCard } from "./ready-report-field"
import { ReadyReportFilterBar } from "./ready-report-filter-bar"
import { SalesByBranchBarChart, SalesByBranchDonutChart } from "./sales-by-branch-charts"

import { type Locale, localeDirection } from "@/i18n/locales"

function formatPlainNumber(value: number, locale: Locale): string {
  return value.toLocaleString(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function SalesByBranchReportPage() {
  const t = useTranslations("reports.salesByBranch")
  const tCommon = useTranslations("reports.common")
  const locale = useLocale() as Locale
  const currency = locale === "ar" ? "ر.س" : "SAR"
  const { dateRange, setDateRange, workspaceId, setWorkspaceId, filters } = useReadyReportFilters()
  const { data, isLoading } = useSalesByBranchReport(filters)
  const [search, setSearch] = useState("")

  const filteredBranches = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return data?.branches ?? []
    return (data?.branches ?? []).filter((branch) =>
      branch.workspaceName.toLowerCase().includes(query)
    )
  }, [data, search])

  return (
    <div dir={localeDirection(locale)} className="flex flex-col gap-4">
      <AppPageHeader
        breadcrumbItems={[
          { label: tCommon("breadcrumbReports"), href: ROUTES.reports },
          { label: t("breadcrumbCurrent"), current: true },
        ]}
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <AppButton
            icon={
              <span className="flex size-5 items-center justify-center rounded-full bg-white/20">
                <Download className="size-3.5" strokeWidth={2.5} />
              </span>
            }
            className="h-11 gap-2 rounded-full bg-[#2878ff] px-5 text-[13.5px] font-bold text-white shadow-[0_6px_16px_rgba(40,120,255,0.28)] transition-all hover:-translate-y-px hover:bg-[#1f63d6]"
            disabled={!data}
            onClick={() => data && exportSalesByBranchToCsv(data.branches)}
          >
            {tCommon("exportReport")}
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
          {tCommon("loading")}
        </div>
      ) : (
        <>
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            <ReadyReportKpiCard
              label={t("kpis.orderCount")}
              value={String(data.kpis.orderCount)}
              icon={ShoppingCart}
              tone="blue"
            />
            <ReadyReportKpiCard
              label={t("kpis.avgInvoiceValue")}
              value={`${formatPlainNumber(data.kpis.avgInvoiceValue, locale)} ${currency}`}
              icon={Wallet}
              tone="amber"
            />
            <ReadyReportKpiCard
              label={t("kpis.itemsSold")}
              value={String(data.kpis.itemsSold)}
              icon={Package}
              tone="violet"
            />
            <ReadyReportKpiCard
              label={t("kpis.totalSales")}
              value={`${formatPlainNumber(data.kpis.totalSales, locale)} ${currency}`}
              icon={Wallet}
              tone="emerald"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SalesByBranchBarChart branches={data.branches} />
            <SalesByBranchDonutChart branches={data.branches} />
          </div>

          <div className={cn(PANEL, "overflow-hidden")}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e1e7f0] px-5 py-4">
              <h2 className={cn("text-[15.5px] font-bold", HEADING)}>{t("table.sectionTitle")}</h2>
              <AppSearchInput
                placeholder={t("searchPlaceholder")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                wrapperClassName="w-full sm:w-64"
                className={FIELD_CLASS}
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-right">
                <thead>
                  <tr className="border-b border-[#e1e7f0]">
                    <th className="px-3 py-2.5 text-[11px] font-bold text-black">
                      {t("table.branch")}
                    </th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-bold text-black">
                      {t("table.totalSales", { currency })}
                    </th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-bold text-black">
                      {t("table.orderCount")}
                    </th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-bold text-black">
                      {t("table.avgInvoiceValue", { currency })}
                    </th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-bold text-black">
                      {t("table.itemsSold")}
                    </th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-bold text-black">
                      {t("table.contributionPercent")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBranches.length === 0 ? (
                    <tr>
                      <td colSpan={6} className={cn("py-10 text-center text-[12.5px]", MUTED)}>
                        {tCommon("noData")}
                      </td>
                    </tr>
                  ) : (
                    filteredBranches.map((branch) => (
                      <tr key={branch.workspaceId} className="border-b border-[#f1f4f9]">
                        <td className={cn("px-3 py-2.5 text-[12.5px] font-semibold", HEADING)}>
                          {branch.workspaceName}
                        </td>
                        <td
                          className={cn("px-3 py-2.5 text-center text-[12.5px] font-bold", HEADING)}
                        >
                          {formatPlainNumber(branch.totalSales, locale)}
                        </td>
                        <td className={cn("px-3 py-2.5 text-center text-[12px]", MUTED)}>
                          {branch.orderCount}
                        </td>
                        <td
                          className={cn("px-3 py-2.5 text-center text-[12px] font-bold", HEADING)}
                        >
                          {formatPlainNumber(branch.avgInvoiceValue, locale)}
                        </td>
                        <td className={cn("px-3 py-2.5 text-center text-[12px]", MUTED)}>
                          {branch.itemsSold}
                        </td>
                        <td
                          className={cn("px-3 py-2.5 text-center text-[12px] font-bold", HEADING)}
                        >
                          {branch.contributionPercent.toFixed(1)}%
                        </td>
                      </tr>
                    ))
                  )}
                  {filteredBranches.length > 0 ? (
                    <tr className="bg-[#f7f9fd]">
                      <td className={cn("px-3 py-2.5 text-[12.5px] font-bold", HEADING)}>
                        {t("table.totalRow")}
                      </td>
                      <td
                        className={cn("px-3 py-2.5 text-center text-[12.5px] font-bold", HEADING)}
                      >
                        {formatPlainNumber(
                          filteredBranches.reduce((sum, branch) => sum + branch.totalSales, 0),
                          locale
                        )}
                      </td>
                      <td
                        className={cn("px-3 py-2.5 text-center text-[12.5px] font-bold", HEADING)}
                      >
                        {filteredBranches.reduce((sum, branch) => sum + branch.orderCount, 0)}
                      </td>
                      <td
                        className={cn("px-3 py-2.5 text-center text-[12.5px] font-bold", HEADING)}
                      >
                        {formatPlainNumber(data.kpis.avgInvoiceValue, locale)}
                      </td>
                      <td
                        className={cn("px-3 py-2.5 text-center text-[12.5px] font-bold", HEADING)}
                      >
                        {filteredBranches.reduce((sum, branch) => sum + branch.itemsSold, 0)}
                      </td>
                      <td
                        className={cn("px-3 py-2.5 text-center text-[12.5px] font-bold", HEADING)}
                      >
                        100%
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

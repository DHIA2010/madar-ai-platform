"use client"

import { useLocale, useTranslations } from "next-intl"
import { Download, Loader2, Package, Receipt, ShoppingCart, Wallet } from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppPageHeader } from "@/components/app"

import { useReadyReportFilters, useVatReturnReport } from "../hooks"
import { exportVatReturnToCsv } from "../services"
import type { VatLineAmounts } from "../types"
import { HEADING, MUTED, PANEL, ReadyReportKpiCard } from "./ready-report-field"
import { ReadyReportFilterBar } from "./ready-report-filter-bar"

import { type Locale, localeDirection } from "@/i18n/locales"

function formatAmount(value: number, locale: Locale): string {
  return value.toLocaleString(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// Accounting convention -- negative values (a refund, a net-refundable VAT position) are wrapped
// in parentheses instead of carrying a leading minus sign.
function formatSigned(value: number, locale: Locale): string {
  const formatted = formatAmount(Math.abs(value), locale)
  return value < 0 ? `(${formatted})` : formatted
}

const TH_CLASS = "px-4 py-2.5 text-[11px] font-semibold text-[#73819a]"
const TD_CLASS = "px-4 py-2.5 text-[12.5px] text-[#44546b]"

function SectionHeaderRow({ label, tone }: { label: string; tone: "blue" | "amber" }) {
  return (
    <tr>
      <td
        colSpan={5}
        className={cn(
          "px-4 py-2 text-[12.5px] font-bold",
          tone === "blue" ? "bg-[#eef4ff] text-[#2878ff]" : "bg-[#fff7e6] text-[#b4700a]"
        )}
      >
        {label}
      </td>
    </tr>
  )
}

function DataRow({ label, line, locale }: { label: string; line: VatLineAmounts; locale: Locale }) {
  return (
    <tr className="border-b border-[#f1f4f9]">
      <td className={cn(TD_CLASS, HEADING)}>{label}</td>
      <td className={cn(TD_CLASS, "text-center")}>{formatAmount(line.amount, locale)}</td>
      <td className={cn(TD_CLASS, "text-center")}>{formatSigned(line.adjustmentAmount, locale)}</td>
      <td className={cn(TD_CLASS, "text-center")}>
        {formatAmount(line.amountAfterAdjustment, locale)}
      </td>
      <td className={cn(TD_CLASS, "text-center font-semibold", HEADING)}>
        {formatAmount(line.vatAmount, locale)}
      </td>
    </tr>
  )
}

function SubtotalRow({
  label,
  line,
  locale,
}: {
  label: string
  line: VatLineAmounts
  locale: Locale
}) {
  return (
    <tr className="border-b border-[#e1e7f0] bg-[#f7f9fd]">
      <td className={cn("px-4 py-2.5 text-[12.5px] font-bold", HEADING)}>{label}</td>
      <td className={cn("px-4 py-2.5 text-center text-[12.5px] font-bold", HEADING)}>
        {formatAmount(line.amount, locale)}
      </td>
      <td className={cn("px-4 py-2.5 text-center text-[12.5px] font-bold", HEADING)}>
        {formatSigned(line.adjustmentAmount, locale)}
      </td>
      <td className={cn("px-4 py-2.5 text-center text-[12.5px] font-bold", HEADING)}>
        {formatAmount(line.amountAfterAdjustment, locale)}
      </td>
      <td className={cn("px-4 py-2.5 text-center text-[12.5px] font-bold", HEADING)}>
        {formatAmount(line.vatAmount, locale)}
      </td>
    </tr>
  )
}

function sumLines(a: VatLineAmounts, b: VatLineAmounts): VatLineAmounts {
  return {
    amount: a.amount + b.amount,
    adjustmentAmount: a.adjustmentAmount + b.adjustmentAmount,
    amountAfterAdjustment: a.amountAfterAdjustment + b.amountAfterAdjustment,
    vatAmount: a.vatAmount + b.vatAmount,
  }
}

export function VatReturnReportPage() {
  const t = useTranslations("reports.vatReturn")
  const tCommon = useTranslations("reports.common")
  const locale = useLocale() as Locale
  const currency = locale === "ar" ? "ر.س" : "SAR"
  const { dateRange, setDateRange, workspaceId, setWorkspaceId, filters } = useReadyReportFilters()
  const { data, isLoading } = useVatReturnReport(filters)

  const isRefundable = (data?.totals.netVatDue ?? 0) < 0

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
            onClick={() => data && exportVatReturnToCsv(data)}
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
              label={t("kpis.netVatDue")}
              value={`${formatSigned(data.totals.netVatDue, locale)} ${currency}`}
              icon={Wallet}
              tone={isRefundable ? "emerald" : "rose"}
              emphasis={isRefundable ? "positive" : "negative"}
              trailing={
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    isRefundable ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                  )}
                >
                  {isRefundable ? t("kpis.refundable") : t("kpis.payable")}
                </span>
              }
            />
            <ReadyReportKpiCard
              label={t("kpis.totalExpenses")}
              value={`${formatAmount(data.totals.totalExpenses, locale)} ${currency}`}
              icon={Receipt}
              tone="amber"
            />
            <ReadyReportKpiCard
              label={t("kpis.totalPurchases")}
              value={`${formatAmount(data.totals.totalPurchases, locale)} ${currency}`}
              icon={Package}
              tone="violet"
            />
            <ReadyReportKpiCard
              label={t("kpis.totalSales")}
              value={`${formatAmount(data.totals.totalSales, locale)} ${currency}`}
              icon={ShoppingCart}
              tone="blue"
            />
          </div>

          <div className={cn(PANEL, "overflow-hidden")}>
            <div className="border-b border-[#e1e7f0] px-5 py-4">
              <h2 className={cn("text-[15.5px] font-bold", HEADING)}>{t("table.sectionTitle")}</h2>
              <p className={cn("mt-1 text-[12px]", MUTED)}>{t("table.sectionSubtitle")}</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-right">
                <thead>
                  <tr className="border-b border-[#e1e7f0]">
                    <th className={cn(TH_CLASS, "font-bold text-black")}>{t("table.item")}</th>
                    <th className={cn(TH_CLASS, "text-center font-bold text-black")}>
                      {t("table.amount", { currency })}
                    </th>
                    <th className={cn(TH_CLASS, "text-center font-bold text-black")}>
                      {t("table.adjustmentAmount", { currency })}
                    </th>
                    <th className={cn(TH_CLASS, "text-center font-bold text-black")}>
                      {t("table.amountAfterAdjustment", { currency })}
                    </th>
                    <th className={cn(TH_CLASS, "text-center font-bold text-black")}>
                      {t("table.vatAmount", { currency })}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <SectionHeaderRow label={t("table.salesSection")} tone="blue" />
                  <DataRow
                    label={t("table.salesStandardRated")}
                    line={data.sales.standardRated}
                    locale={locale}
                  />
                  <DataRow
                    label={t("table.salesZeroRated")}
                    line={data.sales.zeroRated}
                    locale={locale}
                  />
                  <SubtotalRow
                    label={t("table.salesTotal")}
                    line={sumLines(data.sales.standardRated, data.sales.zeroRated)}
                    locale={locale}
                  />

                  <SectionHeaderRow label={t("table.purchasesSection")} tone="blue" />
                  <DataRow
                    label={t("table.purchasesStandardRated")}
                    line={data.purchases.standardRated}
                    locale={locale}
                  />
                  <DataRow
                    label={t("table.purchasesZeroRated")}
                    line={data.purchases.zeroRated}
                    locale={locale}
                  />
                  <SubtotalRow
                    label={t("table.purchasesTotal")}
                    line={sumLines(data.purchases.standardRated, data.purchases.zeroRated)}
                    locale={locale}
                  />

                  <SectionHeaderRow label={t("table.expensesSection")} tone="amber" />
                  <DataRow label={t("table.expensesLabel")} line={data.expenses} locale={locale} />
                  <tr>
                    <td colSpan={5} className="px-4 py-2 text-[11px] text-[#95a4bd]">
                      {t("table.expensesNote")}
                    </td>
                  </tr>

                  <tr
                    className={cn(
                      "border-t border-[#e1e7f0]",
                      isRefundable ? "bg-emerald-50/60" : "bg-rose-50/60"
                    )}
                  >
                    <td className={cn("px-4 py-3 text-[13px] font-extrabold", HEADING)}>
                      {t("table.netVatDueRow")}
                    </td>
                    <td className="px-4 py-3 text-center text-[13px] font-bold text-[#95a4bd]">
                      -
                    </td>
                    <td className="px-4 py-3 text-center text-[13px] font-bold text-[#95a4bd]">
                      -
                    </td>
                    <td className="px-4 py-3 text-center text-[13px] font-bold text-[#95a4bd]">
                      -
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-center text-[13px] font-extrabold",
                        isRefundable ? "text-emerald-600" : "text-rose-600"
                      )}
                    >
                      {formatSigned(data.totals.netVatDue, locale)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

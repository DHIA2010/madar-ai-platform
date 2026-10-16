"use client"

import { Download, Loader2, Package, Receipt, ShoppingCart, Wallet } from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppPageHeader } from "@/components/app"

import { useReadyReportFilters, useVatReturnReport } from "../hooks"
import { exportVatReturnToCsv } from "../services"
import type { VatLineAmounts } from "../types"
import { HEADING, MUTED, PANEL, ReadyReportKpiCard } from "./ready-report-field"
import { ReadyReportFilterBar } from "./ready-report-filter-bar"

function formatAmount(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Accounting convention -- negative values (a refund, a net-refundable VAT position) are wrapped
// in parentheses instead of carrying a leading minus sign.
function formatSigned(value: number): string {
  const formatted = formatAmount(Math.abs(value))
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

function DataRow({ label, line }: { label: string; line: VatLineAmounts }) {
  return (
    <tr className="border-b border-[#f1f4f9]">
      <td className={cn(TD_CLASS, HEADING)}>{label}</td>
      <td className={cn(TD_CLASS, "text-center")}>{formatAmount(line.amount)}</td>
      <td className={cn(TD_CLASS, "text-center")}>{formatSigned(line.adjustmentAmount)}</td>
      <td className={cn(TD_CLASS, "text-center")}>{formatAmount(line.amountAfterAdjustment)}</td>
      <td className={cn(TD_CLASS, "text-center font-semibold", HEADING)}>
        {formatAmount(line.vatAmount)}
      </td>
    </tr>
  )
}

function SubtotalRow({ label, line }: { label: string; line: VatLineAmounts }) {
  return (
    <tr className="border-b border-[#e1e7f0] bg-[#f7f9fd]">
      <td className={cn("px-4 py-2.5 text-[12.5px] font-bold", HEADING)}>{label}</td>
      <td className={cn("px-4 py-2.5 text-center text-[12.5px] font-bold", HEADING)}>
        {formatAmount(line.amount)}
      </td>
      <td className={cn("px-4 py-2.5 text-center text-[12.5px] font-bold", HEADING)}>
        {formatSigned(line.adjustmentAmount)}
      </td>
      <td className={cn("px-4 py-2.5 text-center text-[12.5px] font-bold", HEADING)}>
        {formatAmount(line.amountAfterAdjustment)}
      </td>
      <td className={cn("px-4 py-2.5 text-center text-[12.5px] font-bold", HEADING)}>
        {formatAmount(line.vatAmount)}
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
  const { dateRange, setDateRange, workspaceId, setWorkspaceId, filters } = useReadyReportFilters()
  const { data, isLoading } = useVatReturnReport(filters)

  const isRefundable = (data?.totals.netVatDue ?? 0) < 0

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <AppPageHeader
        breadcrumbItems={[
          { label: "التقارير", href: ROUTES.reports },
          { label: "الإقرار الضريبي", current: true },
        ]}
        title="الإقرار الضريبي"
        subtitle="تعرض هذه الصفحة ملخص المبيعات والمشتريات والمصروفات وضريبة القيمة المضافة للفترة المحددة."
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
        <>
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            <ReadyReportKpiCard
              label="صافي الضريبة المستحقة (أو المستردة)"
              value={`${formatSigned(data.totals.netVatDue)} ر.س`}
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
                  {isRefundable ? "قابل للاسترداد" : "مستحق الدفع"}
                </span>
              }
            />
            <ReadyReportKpiCard
              label="إجمالي المصروفات"
              value={`${formatAmount(data.totals.totalExpenses)} ر.س`}
              icon={Receipt}
              tone="amber"
            />
            <ReadyReportKpiCard
              label="إجمالي المشتريات"
              value={`${formatAmount(data.totals.totalPurchases)} ر.س`}
              icon={Package}
              tone="violet"
            />
            <ReadyReportKpiCard
              label="إجمالي المبيعات"
              value={`${formatAmount(data.totals.totalSales)} ر.س`}
              icon={ShoppingCart}
              tone="blue"
            />
          </div>

          <div className={cn(PANEL, "overflow-hidden")}>
            <div className="border-b border-[#e1e7f0] px-5 py-4">
              <h2 className={cn("text-[15.5px] font-bold", HEADING)}>تفاصيل الإقرار الضريبي</h2>
              <p className={cn("mt-1 text-[12px]", MUTED)}>
                يوضح هذا الجدول المبيعات والمشتريات والمصروفات وضريبة القيمة المضافة للفترة المحددة.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-right">
                <thead>
                  <tr className="border-b border-[#e1e7f0]">
                    <th className={cn(TH_CLASS, "font-bold text-black")}>البند</th>
                    <th className={cn(TH_CLASS, "text-center font-bold text-black")}>
                      المبلغ (ر.س)
                    </th>
                    <th className={cn(TH_CLASS, "text-center font-bold text-black")}>
                      مبلغ التعديل (ر.س)
                    </th>
                    <th className={cn(TH_CLASS, "text-center font-bold text-black")}>
                      المبلغ بعد التعديل (ر.س)
                    </th>
                    <th className={cn(TH_CLASS, "text-center font-bold text-black")}>
                      ضريبة القيمة المضافة (ر.س)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <SectionHeaderRow label="المبيعات" tone="blue" />
                  <DataRow
                    label="المبيعات الخاضعة للنسبة الأساسية"
                    line={data.sales.standardRated}
                  />
                  <DataRow label="المبيعات الخاضعة للنسبة الصفرية" line={data.sales.zeroRated} />
                  <SubtotalRow
                    label="إجمالي المبيعات"
                    line={sumLines(data.sales.standardRated, data.sales.zeroRated)}
                  />

                  <SectionHeaderRow label="المشتريات" tone="blue" />
                  <DataRow
                    label="المشتريات الخاضعة للنسبة الأساسية"
                    line={data.purchases.standardRated}
                  />
                  <DataRow
                    label="المشتريات الخاضعة للنسبة الصفرية"
                    line={data.purchases.zeroRated}
                  />
                  <SubtotalRow
                    label="إجمالي المشتريات"
                    line={sumLines(data.purchases.standardRated, data.purchases.zeroRated)}
                  />

                  <SectionHeaderRow label="المصروفات" tone="amber" />
                  <DataRow label="المصروفات" line={data.expenses} />
                  <tr>
                    <td colSpan={5} className="px-4 py-2 text-[11px] text-[#95a4bd]">
                      تُحتسب ضريبة المصروفات فقط للمصروفات المسجلة كـ &quot;شامل الضريبة&quot;.
                    </td>
                  </tr>

                  <tr
                    className={cn(
                      "border-t border-[#e1e7f0]",
                      isRefundable ? "bg-emerald-50/60" : "bg-rose-50/60"
                    )}
                  >
                    <td className={cn("px-4 py-3 text-[13px] font-extrabold", HEADING)}>
                      صافي الضريبة المستحقة (أو المستردة)
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
                      {formatSigned(data.totals.netVatDue)}
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

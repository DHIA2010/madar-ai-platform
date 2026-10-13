"use client"

import { useMemo, useState } from "react"
import { Download, Loader2, Package, Percent, Receipt, ShoppingBag } from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppPageHeader, AppSearchableSelect, AppSearchInput } from "@/components/app"

import { usePurchaseInvoicesReport, useReadyReportFilters } from "../hooks"
import { exportPurchaseInvoicesToCsv } from "../services"
import {
  FIELD_CLASS,
  HEADING,
  MUTED,
  PANEL,
  ReadyReportKpiCard,
  ReadyReportPagination,
} from "./ready-report-field"
import { ReadyReportFilterBar } from "./ready-report-filter-bar"

const PAGE_SIZE = 10

function formatPlainNumber(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function PurchaseInvoicesReportPage() {
  const { dateRange, setDateRange, workspaceId, setWorkspaceId, filters } = useReadyReportFilters()
  const { data, isLoading } = usePurchaseInvoicesReport(filters)
  const [referenceQuery, setReferenceQuery] = useState("")
  const [taxNumberQuery, setTaxNumberQuery] = useState("")
  const [supplierId, setSupplierId] = useState<string | "all">("all")
  const [page, setPage] = useState(1)

  const supplierOptions = useMemo(() => {
    const unique = new Map<string, string>()
    for (const row of data?.rows ?? []) unique.set(row.supplierId, row.supplierName)
    return [
      { value: "all", label: "كل الموردين" },
      ...[...unique.entries()].map(([value, label]) => ({ value, label })),
    ]
  }, [data])

  const filteredRows = useMemo(() => {
    const referenceNeedle = referenceQuery.trim().toLowerCase()
    const taxNeedle = taxNumberQuery.trim().toLowerCase()
    return (data?.rows ?? []).filter((row) => {
      if (supplierId !== "all" && row.supplierId !== supplierId) return false
      if (referenceNeedle && !(row.referenceNumber ?? "").toLowerCase().includes(referenceNeedle)) {
        return false
      }
      if (taxNeedle && !(row.supplierTaxNumber ?? "").toLowerCase().includes(taxNeedle)) {
        return false
      }
      return true
    })
  }, [data, referenceQuery, taxNumberQuery, supplierId])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const rangeStart = filteredRows.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filteredRows.length)

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <AppPageHeader
        breadcrumbItems={[
          { label: "التقارير", href: ROUTES.reports },
          { label: "تقرير فواتير المشتريات", current: true },
        ]}
        title="تقرير فواتير المشتريات"
        subtitle="عرض جميع فواتير المشتريات مع تفاصيل المبالغ والضريبة لكل مورد."
        actions={
          <AppButton
            icon={
              <span className="flex size-5 items-center justify-center rounded-full bg-white/20">
                <Download className="size-3.5" strokeWidth={2.5} />
              </span>
            }
            className="h-11 gap-2 rounded-full bg-[#2878ff] px-5 text-[13.5px] font-bold text-white shadow-[0_6px_16px_rgba(40,120,255,0.28)] transition-all hover:-translate-y-px hover:bg-[#1f63d6]"
            disabled={!data}
            onClick={() => data && exportPurchaseInvoicesToCsv(filteredRows)}
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
      >
        <AppSearchInput
          placeholder="بحث برقم فاتورة المورد..."
          value={referenceQuery}
          onChange={(event) => {
            setReferenceQuery(event.target.value)
            setPage(1)
          }}
          wrapperClassName="w-full sm:w-56"
          className={FIELD_CLASS}
        />
        <AppSearchInput
          placeholder="بحث بالرقم الضريبي للمورد..."
          value={taxNumberQuery}
          onChange={(event) => {
            setTaxNumberQuery(event.target.value)
            setPage(1)
          }}
          wrapperClassName="w-full sm:w-56"
          className={FIELD_CLASS}
        />
        <AppSearchableSelect
          value={supplierId}
          options={supplierOptions}
          onChange={(value) => {
            setSupplierId(value as string | "all")
            setPage(1)
          }}
          ariaLabel="المورد"
          triggerClassName="w-[160px]"
        />
      </ReadyReportFilterBar>

      {isLoading || !data ? (
        <div className="flex items-center justify-center gap-2 p-16 text-[13px] text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          جارٍ التحميل...
        </div>
      ) : (
        <>
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            <ReadyReportKpiCard
              label="إجمالي الأصناف"
              value={String(data.kpis.totalItems)}
              icon={Package}
              tone="amber"
            />
            <ReadyReportKpiCard
              label="إجمالي ضريبة القيمة المضافة"
              value={`${formatPlainNumber(data.kpis.totalVat)} ر.س`}
              icon={Percent}
              tone="emerald"
            />
            <ReadyReportKpiCard
              label="عدد الفواتير"
              value={String(data.kpis.invoiceCount)}
              icon={Receipt}
              tone="violet"
            />
            <ReadyReportKpiCard
              label="إجمالي فواتير المشتريات"
              value={`${formatPlainNumber(data.kpis.totalPurchases)} ر.س`}
              icon={ShoppingBag}
              tone="blue"
            />
          </div>

          <div className={cn(PANEL, "overflow-hidden")}>
            <div className="border-b border-[#e1e7f0] px-5 py-4">
              <h2 className={cn("text-[15.5px] font-bold", HEADING)}>تفاصيل فواتير المشتريات</h2>
              <p className={cn("mt-1 text-[12px]", MUTED)}>
                يوضح هذا الجدول جميع فواتير المشتريات مع تفاصيل المبالغ والضريبة لكل مورد.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-right">
                <thead>
                  <tr className="border-b border-[#e1e7f0]">
                    <th className="px-3 py-2.5 text-[11px] font-bold text-black">التاريخ</th>
                    <th className="px-3 py-2.5 text-[11px] font-bold text-black">اسم المورد</th>
                    <th className="px-3 py-2.5 text-[11px] font-bold text-black">
                      رقم فاتورة المورد
                    </th>
                    <th className="px-3 py-2.5 text-[11px] font-bold text-black">
                      الرقم الضريبي للمورد
                    </th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-bold text-black">
                      عدد الأصناف
                    </th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-bold text-black">
                      المبلغ قبل الضريبة (ر.س)
                    </th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-bold text-black">
                      ضريبة القيمة المضافة (ر.س)
                    </th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-bold text-black">
                      الإجمالي (ر.س)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className={cn("py-10 text-center text-[12.5px]", MUTED)}>
                        لا توجد بيانات
                      </td>
                    </tr>
                  ) : (
                    pagedRows.map((row) => (
                      <tr key={row.purchaseId} className="border-b border-[#f1f4f9]">
                        <td className={cn("px-3 py-2.5 text-[12px]", HEADING)}>{row.date}</td>
                        <td className={cn("px-3 py-2.5 text-[12.5px] font-semibold", HEADING)}>
                          {row.supplierName}
                        </td>
                        <td className={cn("px-3 py-2.5 text-[12px]", MUTED)}>
                          {row.referenceNumber ?? "-"}
                        </td>
                        <td className={cn("px-3 py-2.5 text-[12px]", MUTED)}>
                          {row.supplierTaxNumber ?? "-"}
                        </td>
                        <td
                          className={cn("px-3 py-2.5 text-center text-[12px] font-bold", HEADING)}
                        >
                          {row.itemCount}
                        </td>
                        <td
                          className={cn("px-3 py-2.5 text-center text-[12px] font-bold", HEADING)}
                        >
                          {formatPlainNumber(row.amountBeforeTax)}
                        </td>
                        <td
                          className={cn("px-3 py-2.5 text-center text-[12px] font-bold", HEADING)}
                        >
                          {formatPlainNumber(row.vatAmount)}
                        </td>
                        <td
                          className={cn("px-3 py-2.5 text-center text-[12.5px] font-bold", HEADING)}
                        >
                          {formatPlainNumber(row.total)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e1e7f0] px-4 py-3">
              <p className={cn("shrink-0 text-sm whitespace-nowrap", MUTED)}>
                عرض {rangeStart} - {rangeEnd} من {filteredRows.length} نتيجة
              </p>
              <ReadyReportPagination
                page={currentPage}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

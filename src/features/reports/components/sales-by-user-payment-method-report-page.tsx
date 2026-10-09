"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, CreditCard, Loader2, Receipt, Users } from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppSearchableSelect, AppSearchInput } from "@/components/app"

import { useReadyReportFilters, useSalesByUserPaymentMethodReport } from "../hooks"
import { PaymentMethodDonutCard } from "./payment-method-donut-card"
import {
  FIELD_CLASS,
  formatCurrency,
  HEADING,
  MUTED,
  PANEL,
  ReadyReportKpiCard,
} from "./ready-report-field"
import { ReadyReportFilterBar } from "./ready-report-filter-bar"

// payment_method_code is stored as a raw code on pos_invoices (e.g. "cash", "card") -- no
// per-org display-name lookup is wired up for this report yet, so the code is shown as-is.
export function SalesByUserPaymentMethodReportPage() {
  const router = useRouter()
  const { dateRange, setDateRange, workspaceId, setWorkspaceId, filters } = useReadyReportFilters()
  const { data, isLoading } = useSalesByUserPaymentMethodReport(filters)
  const [search, setSearch] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<string | "all">("all")

  const paymentMethodOptions = useMemo(() => {
    const unique = new Set((data?.rows ?? []).map((row) => row.paymentMethod))
    return [
      { value: "all", label: "كل طرق الدفع" },
      ...[...unique].map((method) => ({ value: method, label: method })),
    ]
  }, [data])

  const donutData = useMemo(() => {
    const totals = new Map<string, number>()
    for (const row of data?.rows ?? []) {
      totals.set(row.paymentMethod, (totals.get(row.paymentMethod) ?? 0) + row.totalSales)
    }
    return [...totals.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((left, right) => right.value - left.value)
  }, [data])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (data?.rows ?? []).filter((row) => {
      if (paymentMethod !== "all" && row.paymentMethod !== paymentMethod) return false
      if (!query) return true
      return row.cashierName.toLowerCase().includes(query)
    })
  }, [data, search, paymentMethod])

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
        <h1 className={cn("text-2xl font-bold", HEADING)}>المبيعات حسب المستخدم وطريقة الدفع</h1>
        <p className={cn("mt-1 text-sm", MUTED)}>توزيع المبيعات بين المستخدمين وطرق الدفع.</p>
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ReadyReportKpiCard
              label="متوسط العملية"
              value={formatCurrency(data.kpis.avgTransaction)}
              icon={Receipt}
              tone="blue"
            />
            <ReadyReportKpiCard
              label="طرق الدفع"
              value={String(data.kpis.paymentMethodCount)}
              icon={CreditCard}
              tone="violet"
            />
            <ReadyReportKpiCard
              label="عدد المستخدمين"
              value={String(data.kpis.userCount)}
              icon={Users}
              tone="amber"
            />
            <ReadyReportKpiCard
              label="إجمالي المدفوعات"
              value={formatCurrency(data.kpis.totalPayments)}
              icon={Receipt}
              tone="emerald"
            />
          </div>

          <PaymentMethodDonutCard title="توزيع المبيعات حسب طريقة الدفع" data={donutData} />

          <div className={cn(PANEL, "overflow-hidden")}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e1e7f0] p-4">
              <h3 className={cn("text-[13.5px] font-bold", HEADING)}>
                تفاصيل المبيعات حسب المستخدم وطريقة الدفع
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <AppSearchInput
                  placeholder="بحث باسم المستخدم..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  wrapperClassName="w-full sm:w-56"
                  className={FIELD_CLASS}
                />
                <AppSearchableSelect
                  value={paymentMethod}
                  options={paymentMethodOptions}
                  onChange={(value) => setPaymentMethod(value)}
                  ariaLabel="طريقة الدفع"
                  triggerClassName="w-[160px]"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-right">
                <thead>
                  <tr>
                    {[
                      "اسم المستخدم",
                      "طريقة الدفع",
                      "عدد العمليات",
                      "المبلغ الإجمالي",
                      "النسبة من الإجمالي",
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
                  {filteredRows.map((row) => {
                    const pct =
                      data.kpis.totalPayments > 0
                        ? Math.round((row.totalSales / data.kpis.totalPayments) * 100)
                        : 0
                    return (
                      <tr
                        key={`${row.cashierUserId}-${row.paymentMethod}`}
                        className="border-b border-[#f4f7fb]"
                      >
                        <td className="px-3 py-2 text-[12px] font-medium text-black">
                          {row.cashierName}
                        </td>
                        <td className="px-3 py-2 text-[12px] text-black">{row.paymentMethod}</td>
                        <td className="px-3 py-2 text-[12px] text-black">{row.invoiceCount}</td>
                        <td className="px-3 py-2 text-[12px] font-bold text-black">
                          {formatCurrency(row.totalSales)}
                        </td>
                        <td className="px-3 py-2 text-[12px] text-black">{pct}%</td>
                      </tr>
                    )
                  })}
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className={cn("py-10 text-center text-[12.5px]", MUTED)}>
                        لا توجد نتائج مطابقة
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

"use client"

import { useEffect, useState } from "react"
import { Download, Eye, Loader2, Plus, Printer } from "lucide-react"
import { createPortal } from "react-dom"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import {
  AppButton,
  AppDateRangeFilter,
  AppSearchableSelect,
  AppSearchInput,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableEmpty,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
} from "@/components/app"

import { useSuppliers } from "@/features/suppliers"

import { usePurchases, useReturns, useReturnsList } from "../hooks"
import { exportReturnsToCsv, returnService, WAREHOUSES } from "../services"
import type { PurchaseReturn } from "../types"
import { PurchaseAvatar } from "./purchase-avatar"
import { FIELD_CLASS, HEADING, MUTED, PANEL, PurchasePagination } from "./purchase-field"
import { ReturnFormDialog } from "./return-form-dialog"
import { ReturnPrintDocument } from "./return-print-document"
import { ReturnStatusSelect } from "./return-status-select"
import { ReturnViewDialog } from "./return-view-dialog"
import { ReturnsKpiCards } from "./returns-kpi-cards"

const STATUS_OPTIONS = [
  { value: "all", label: "كل حالات الإرجاع" },
  { value: "pending", label: "معلّق" },
  { value: "approved", label: "مقبول" },
  { value: "refunded", label: "مسترد" },
  { value: "rejected", label: "مرفوض" },
]

function formatCurrency(value: number) {
  return `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2 }).format(value)}`
}

export function ReturnsListPage() {
  const { returns, isLoading, refetch } = useReturns()
  const { purchases } = usePurchases()
  const { suppliers } = useSuppliers()
  const list = useReturnsList(returns)
  const [formOpen, setFormOpen] = useState(false)
  const [viewTarget, setViewTarget] = useState<PurchaseReturn | null>(null)
  const [printTarget, setPrintTarget] = useState<PurchaseReturn | null>(null)

  // Same pattern as PurchasesListPage's own print target: give the portaled node a tick to land
  // before window.print() reads it, then tear it down once printing finishes.
  useEffect(() => {
    if (!printTarget) return
    const handleAfterPrint = () => setPrintTarget(null)
    window.addEventListener("afterprint", handleAfterPrint)
    const timer = setTimeout(() => window.print(), 50)
    return () => {
      clearTimeout(timer)
      window.removeEventListener("afterprint", handleAfterPrint)
    }
  }, [printTarget])

  async function handleStatusChange(entry: PurchaseReturn, status: PurchaseReturn["status"]) {
    try {
      await returnService.setStatus(entry.id, status)
      void refetch()
    } catch {
      toast.error("تعذر تحديث حالة المرتجع.")
    }
  }

  const printSupplier = printTarget
    ? (suppliers.find((supplier) => supplier.id === printTarget.supplierId) ?? null)
    : null

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div>
        <h1 className={cn("text-2xl font-bold", HEADING)}>مرتجعات المشتريات</h1>
        <p className={cn("mt-1 text-sm", MUTED)}>إدارة جميع مرتجعات طلبات الشراء من الموردين.</p>
      </div>

      <ReturnsKpiCards returns={list.filteredReturns} />

      <div className={cn(PANEL, "flex flex-wrap items-center justify-between gap-3 p-4")}>
        <AppSearchInput
          placeholder="البحث في المرتجعات..."
          value={list.search}
          onChange={(event) => list.setSearch(event.target.value)}
          wrapperClassName="w-full sm:w-64"
          className={FIELD_CLASS}
        />

        <div className="flex flex-wrap items-center gap-2">
          <AppSearchableSelect
            value={list.status}
            options={STATUS_OPTIONS}
            onChange={(value) => list.setStatus(value as typeof list.status)}
            placeholder="حالة الإرجاع"
            ariaLabel="حالة الإرجاع"
            triggerClassName="w-[160px]"
          />
          <AppSearchableSelect
            value={list.supplierId}
            options={[
              { value: "all", label: "كل الموردين" },
              ...suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name })),
            ]}
            onChange={(value) => list.setSupplierId(value)}
            placeholder="المورد"
            ariaLabel="المورد"
            triggerClassName="w-[160px]"
          />
          <AppSearchableSelect
            value={list.warehouseId}
            options={[
              { value: "all", label: "كل المستودعات" },
              ...WAREHOUSES.map((warehouse) => ({ value: warehouse.id, label: warehouse.name })),
            ]}
            onChange={(value) => list.setWarehouseId(value)}
            placeholder="المستودع"
            ariaLabel="المستودع"
            triggerClassName="w-[160px]"
          />
          <AppDateRangeFilter value={list.dateRange} onChange={list.setDateRange} />
          <AppButton
            variant="outline"
            icon={<Download className="size-4" />}
            className="h-11 gap-2 rounded-[12px] border-[#c4d5f0] bg-white px-4 text-[12.5px] font-semibold text-[#2878ff] hover:bg-[#eef4ff]"
            onClick={() => exportReturnsToCsv(list.filteredReturns)}
          >
            تصدير
          </AppButton>
          <AppButton
            icon={
              <span className="flex size-5 items-center justify-center rounded-full bg-white/20">
                <Plus className="size-3.5" strokeWidth={2.5} />
              </span>
            }
            onClick={() => setFormOpen(true)}
            className="h-11 gap-2 rounded-full bg-[#2878ff] px-5 text-[13.5px] font-semibold text-white shadow-[0_6px_16px_rgba(40,120,255,0.28)] transition-all hover:-translate-y-px hover:bg-[#1f63d6] hover:shadow-[0_8px_20px_rgba(40,120,255,0.34)] active:translate-y-0"
          >
            إضافة مرتجع
          </AppButton>
        </div>
      </div>

      <div className={cn(PANEL, "overflow-hidden")}>
        <AppTable>
          <AppTableHeader>
            <AppTableRow>
              <AppTableHead>رقم المرتجع</AppTableHead>
              <AppTableHead>رقم الطلب</AppTableHead>
              <AppTableHead>المورد</AppTableHead>
              <AppTableHead>العناصر المرتجعة</AppTableHead>
              <AppTableHead>مبلغ الإرجاع</AppTableHead>
              <AppTableHead>الحالة</AppTableHead>
              <AppTableHead>التاريخ</AppTableHead>
              <AppTableHead>المستودع</AppTableHead>
              <AppTableHead className="w-20">الإجراءات</AppTableHead>
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {list.rows.map((entry) => (
              <AppTableRow key={entry.id}>
                <AppTableCell className="font-medium text-[#2878ff]">{entry.code}</AppTableCell>
                <AppTableCell className={MUTED}>{entry.purchaseCode}</AppTableCell>
                <AppTableCell>
                  <div className="flex items-center gap-2.5">
                    <PurchaseAvatar
                      name={entry.supplierName}
                      imageUrl={entry.supplierImageUrl}
                      className="size-8"
                    />
                    <span className={cn("font-medium", HEADING)}>{entry.supplierName}</span>
                  </div>
                </AppTableCell>
                <AppTableCell className={MUTED}>{entry.returnQty} صنف</AppTableCell>
                <AppTableCell className={cn("font-medium", HEADING)}>
                  {formatCurrency(entry.returnAmount)}
                </AppTableCell>
                <AppTableCell>
                  <ReturnStatusSelect
                    status={entry.status}
                    onChange={(status) => void handleStatusChange(entry, status)}
                  />
                </AppTableCell>
                <AppTableCell className={MUTED}>{entry.returnDate}</AppTableCell>
                <AppTableCell className={MUTED}>{entry.warehouseName}</AppTableCell>
                <AppTableCell>
                  <div className="flex items-center gap-1.5">
                    <AppButton
                      variant="ghost"
                      size="icon-sm"
                      aria-label="عرض"
                      className="rounded-[8px] border border-blue-100 bg-blue-50 text-blue-600 hover:bg-blue-100"
                      onClick={() => setViewTarget(entry)}
                    >
                      <Eye className="size-4" />
                    </AppButton>
                    <AppButton
                      variant="ghost"
                      size="icon-sm"
                      aria-label="طباعة"
                      className="rounded-[8px] border border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200"
                      onClick={() => setPrintTarget(entry)}
                    >
                      <Printer className="size-4" />
                    </AppButton>
                  </div>
                </AppTableCell>
              </AppTableRow>
            ))}
          </AppTableBody>
        </AppTable>

        {isLoading ? (
          <div className={cn("flex items-center justify-center gap-2 py-16 text-[13px]", MUTED)}>
            <Loader2 className="size-4 animate-spin" />
            جارٍ التحميل...
          </div>
        ) : list.rows.length === 0 ? (
          <AppTableEmpty
            title="لا توجد مرتجعات مطابقة"
            description="جرّب تعديل الفلاتر أو البحث."
          />
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e1e7f0] px-4 py-3">
          <p className={cn("shrink-0 text-sm whitespace-nowrap", MUTED)}>
            عرض {list.rows.length} من {list.totalCount} نتيجة
          </p>
          <PurchasePagination
            page={list.page}
            totalPages={list.totalPages}
            onPageChange={list.setPage}
          />
        </div>
      </div>

      <ReturnFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        purchases={purchases}
        suppliers={suppliers}
        allReturns={returns}
        onCreated={() => void refetch()}
      />
      <ReturnViewDialog entry={viewTarget} onOpenChange={(open) => !open && setViewTarget(null)} />

      {/* Portaled to <body> so it's a sibling of every other top-level element, which the print
          CSS below hides by selector -- same pattern as PurchasesListPage's own print target. */}
      {typeof document !== "undefined" && printTarget
        ? createPortal(
            <ReturnPrintDocument entry={printTarget} supplier={printSupplier} />,
            document.body
          )
        : null}
      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          body > *:not(#return-print-target) { display: none !important; }
        }
      `}</style>
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Download, Eye, Loader2, Plus, Printer } from "lucide-react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppButton,
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

import { useSuppliers, useSupplierVouchers } from "@/features/suppliers"

import { usePurchases, usePurchasesList, useReturns } from "../hooks"
import { exportPurchasesToCsv } from "../services"
import {
  derivePurchasePaymentStatus,
  type Purchase,
  purchaseGrandTotal,
  purchaseItemCount,
} from "../types"
import { PurchaseAvatar } from "./purchase-avatar"
import { FIELD_CLASS, HEADING, MUTED, PANEL, PurchasePagination } from "./purchase-field"
import { PurchasePaymentStatusBadge } from "./purchase-payment-status-badge"
import { PurchasePrintDocument } from "./purchase-print-document"
import { PurchaseViewDialog } from "./purchase-view-dialog"
import { PurchasesKpiCards } from "./purchases-kpi-cards"

const STATUS_OPTIONS = [
  { value: "all", label: "كل حالات الطلب" },
  { value: "received", label: "تم الاستلام" },
  { value: "pending", label: "قيد الانتظار" },
]

const PAYMENT_STATUS_OPTIONS = [
  { value: "all", label: "كل حالات الدفع" },
  { value: "paid", label: "مدفوع" },
  { value: "partial", label: "مدفوع جزئياً" },
  { value: "pending", label: "معلّق" },
  { value: "overdue", label: "متأخر" },
]

function formatCurrency(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2 }).format(value)} ${currency}`
  }
}

export function PurchasesListPage() {
  const router = useRouter()
  const { purchases, isLoading } = usePurchases()
  const { returns } = useReturns()
  const { vouchers } = useSupplierVouchers()
  const { suppliers } = useSuppliers()
  const list = usePurchasesList(purchases, vouchers)
  const [viewTarget, setViewTarget] = useState<Purchase | null>(null)
  const [printTarget, setPrintTarget] = useState<Purchase | null>(null)

  // Mounting the print-only node is a DOM write, so give it a tick to land before window.print()
  // reads it; afterprint tears the node back down so it never lingers for the next operation.
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

  const printSupplier = printTarget
    ? (suppliers.find((supplier) => supplier.id === printTarget.supplierId) ?? null)
    : null

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div>
        <h1 className={cn("text-2xl font-bold", HEADING)}>المشتريات</h1>
        <p className={cn("mt-1 text-sm", MUTED)}>
          عرض وإدارة جميع طلبات الشراء والموردين والمنتجات.
        </p>
      </div>

      <PurchasesKpiCards
        totalPurchases={list.kpis.totalPurchases}
        totalOrders={list.kpis.totalOrders}
        pendingOrders={list.kpis.pendingOrders}
        returns={returns}
      />

      <div className={cn(PANEL, "flex flex-wrap items-center justify-between gap-3 p-4")}>
        <div className="flex flex-wrap items-center gap-2">
          <AppSearchableSelect
            value={list.status}
            options={STATUS_OPTIONS}
            onChange={(value) => list.setStatus(value as typeof list.status)}
            placeholder="حالة الطلب"
            ariaLabel="حالة الطلب"
            triggerClassName="w-[170px]"
          />
          <AppSearchableSelect
            value={list.paymentStatus}
            options={PAYMENT_STATUS_OPTIONS}
            onChange={(value) => list.setPaymentStatus(value as typeof list.paymentStatus)}
            placeholder="حالة الدفع"
            ariaLabel="حالة الدفع"
            triggerClassName="w-[170px]"
          />
          <AppSearchInput
            placeholder="البحث عن أمر شراء..."
            value={list.search}
            onChange={(event) => list.setSearch(event.target.value)}
            wrapperClassName="w-full sm:w-64"
            className={FIELD_CLASS}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <AppButton
            variant="outline"
            icon={<Download className="size-4" />}
            className="h-11 gap-2 rounded-[12px] border-[#c4d5f0] bg-white px-4 text-[12.5px] font-semibold text-[#2878ff] hover:bg-[#eef4ff]"
            onClick={() => exportPurchasesToCsv(list.filteredPurchases, vouchers)}
          >
            تصدير
          </AppButton>
          <AppButton
            icon={
              <span className="flex size-5 items-center justify-center rounded-full bg-white/20">
                <Plus className="size-3.5" strokeWidth={2.5} />
              </span>
            }
            onClick={() => router.push(ROUTES.purchasesAdd)}
            className="h-11 gap-2 rounded-full bg-[#2878ff] px-5 text-[13.5px] font-semibold text-white shadow-[0_6px_16px_rgba(40,120,255,0.28)] transition-all hover:-translate-y-px hover:bg-[#1f63d6] hover:shadow-[0_8px_20px_rgba(40,120,255,0.34)] active:translate-y-0"
          >
            إضافة أمر شراء
          </AppButton>
        </div>
      </div>

      <div className={cn(PANEL, "overflow-hidden")}>
        <AppTable>
          <AppTableHeader>
            <AppTableRow>
              <AppTableHead>رقم الطلب</AppTableHead>
              <AppTableHead>المورد</AppTableHead>
              <AppTableHead>العناصر</AppTableHead>
              <AppTableHead>الإجمالي</AppTableHead>
              <AppTableHead>حالة الدفع</AppTableHead>
              <AppTableHead>التاريخ</AppTableHead>
              <AppTableHead className="w-20">الإجراءات</AppTableHead>
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {list.rows.map((purchase) => (
              <AppTableRow key={purchase.id}>
                <AppTableCell className={MUTED}>{purchase.code}</AppTableCell>
                <AppTableCell>
                  <div className="flex items-center gap-2.5">
                    <PurchaseAvatar
                      name={purchase.supplierName}
                      imageUrl={purchase.supplierImageUrl}
                      className="size-8"
                    />
                    <span className={cn("font-medium", HEADING)}>{purchase.supplierName}</span>
                  </div>
                </AppTableCell>
                <AppTableCell className={MUTED}>
                  {purchaseItemCount(purchase.items)} صنف
                </AppTableCell>
                <AppTableCell className={cn("font-medium", HEADING)}>
                  {formatCurrency(purchaseGrandTotal(purchase), purchase.currency)}
                </AppTableCell>
                <AppTableCell>
                  <PurchasePaymentStatusBadge
                    status={derivePurchasePaymentStatus(purchase, vouchers)}
                  />
                </AppTableCell>
                <AppTableCell className={MUTED}>{purchase.date}</AppTableCell>
                <AppTableCell>
                  <div className="flex items-center gap-1.5">
                    <AppButton
                      variant="ghost"
                      size="icon-sm"
                      aria-label="عرض"
                      className="rounded-[8px] border border-blue-100 bg-blue-50 text-blue-600 hover:bg-blue-100"
                      onClick={() => setViewTarget(purchase)}
                    >
                      <Eye className="size-4" />
                    </AppButton>
                    <AppButton
                      variant="ghost"
                      size="icon-sm"
                      aria-label="طباعة"
                      className="rounded-[8px] border border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200"
                      onClick={() => setPrintTarget(purchase)}
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
            title="لا توجد طلبات شراء مطابقة"
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

      <PurchaseViewDialog
        purchase={viewTarget}
        onOpenChange={(open) => !open && setViewTarget(null)}
      />

      {/* Portaled to <body> so it's a sibling of every other top-level element, which the print
          CSS below hides by selector -- same pattern as CustomerStatement's own print target. */}
      {typeof document !== "undefined" && printTarget
        ? createPortal(
            <PurchasePrintDocument purchase={printTarget} supplier={printSupplier} />,
            document.body
          )
        : null}
      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          body > *:not(#purchase-print-target) { display: none !important; }
        }
      `}</style>
    </div>
  )
}

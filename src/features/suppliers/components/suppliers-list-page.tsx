"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Ban,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppCheckbox,
  AppConfirmDialog,
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

import {
  crossFeaturePurchaseGrandTotal,
  useCrossFeaturePurchaseData,
  useSuppliers,
  useSuppliersList,
  useSupplierVouchers,
} from "../hooks"
import { computeSupplierBalance, exportSuppliersToCsv, supplierService } from "../services"
import type { Supplier } from "../types"
import { SupplierAvatar } from "./supplier-avatar"
import { SupplierDeleteDialog } from "./supplier-delete-dialog"
import {
  FIELD_CLASS,
  HEADING,
  MUTED,
  PANEL,
  SECONDARY_BUTTON_CLASS,
  SupplierPagination,
} from "./supplier-field"
import { SupplierStatusBadge } from "./supplier-status-badge"
import { SupplierViewDialog } from "./supplier-view-dialog"
import { SuppliersKpiCards } from "./suppliers-kpi-cards"

const STATUS_OPTIONS = [
  { value: "all", label: "جميع الحالات" },
  { value: "active", label: "نشط" },
  { value: "inactive", label: "غير نشط" },
]

const ACTION_ICON_CLASS = "rounded-[8px] border"

function formatCurrency(value: number) {
  return `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2 }).format(value)}`
}

function formatBalance(value: number) {
  const sign = value < 0 ? "-" : ""
  return `${sign}$${new Intl.NumberFormat("en-US").format(Math.abs(value))}`
}

export function SuppliersListPage() {
  const router = useRouter()
  const { suppliers, isLoading, refetch } = useSuppliers()
  const { purchases, returns } = useCrossFeaturePurchaseData()
  const { vouchers } = useSupplierVouchers()
  const list = useSuppliersList(suppliers)
  const [viewTarget, setViewTarget] = useState<Supplier | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const visibleIds = list.rows.map((supplier) => supplier.id)
  const selectedOnPage = visibleIds.filter((id) => selectedIds.has(id))
  const allOnPageSelected = visibleIds.length > 0 && selectedOnPage.length === visibleIds.length
  const someOnPageSelected = selectedOnPage.length > 0 && !allOnPageSelected

  // Real totals/balance, derived from the actual fetched purchases/returns/vouchers (see
  // supplier-ledger.service.ts) -- not a stored field on Supplier.
  const totalPurchasesBySupplier = new Map(
    suppliers.map((supplier) => [
      supplier.id,
      purchases
        .filter((purchase) => purchase.supplierId === supplier.id)
        .reduce((sum, purchase) => sum + crossFeaturePurchaseGrandTotal(purchase), 0),
    ])
  )
  const ledgerPurchases = purchases.map((purchase) => ({
    supplierId: purchase.supplierId,
    grandTotal: crossFeaturePurchaseGrandTotal(purchase),
  }))
  const balanceBySupplier = new Map(
    suppliers.map((supplier) => [
      supplier.id,
      computeSupplierBalance(supplier.id, ledgerPurchases, returns, vouchers),
    ])
  )
  const kpiTotalPurchases = list.filteredSuppliers.reduce(
    (sum, supplier) => sum + (totalPurchasesBySupplier.get(supplier.id) ?? 0),
    0
  )
  const kpiTotalBalance = list.filteredSuppliers.reduce(
    (sum, supplier) => sum + (balanceBySupplier.get(supplier.id) ?? 0),
    0
  )

  function toggleRow(id: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleAllOnPage(checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current)
      for (const id of visibleIds) {
        if (checked) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  async function handleToggleStatus(supplier: Supplier) {
    const next = supplier.status === "active" ? "inactive" : "active"
    try {
      await supplierService.setStatus([supplier.id], next)
      toast.success(
        next === "active" ? `تم تفعيل ${supplier.name}.` : `تم إلغاء تفعيل ${supplier.name}.`
      )
      void refetch()
    } catch {
      toast.error("تعذر تحديث حالة المورد.")
    }
  }

  async function handleBulkStatus(next: Supplier["status"]) {
    try {
      await supplierService.setStatus([...selectedIds], next)
      toast.success(
        next === "active"
          ? `تم تفعيل ${selectedIds.size} مورد.`
          : `تم إلغاء تفعيل ${selectedIds.size} مورد.`
      )
      setSelectedIds(new Set())
      void refetch()
    } catch {
      toast.error("تعذر تحديث حالة الموردين المحددين.")
    }
  }

  async function handleBulkDelete() {
    setBulkDeleting(true)
    try {
      await Promise.all([...selectedIds].map((id) => supplierService.remove(id)))
      toast.success(`تم حذف ${selectedIds.size} مورد.`)
      setSelectedIds(new Set())
      setBulkDeleteOpen(false)
      void refetch()
    } catch {
      toast.error("تعذر حذف بعض الموردين المحددين.")
    } finally {
      setBulkDeleting(false)
    }
  }

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={cn("text-2xl font-bold", HEADING)}>قائمة الموردين</h1>
          <p className={cn("mt-1 text-sm", MUTED)}>
            إدارة جميع موردي المشتريات وبياناتهم البنكية والتجارية.
          </p>
        </div>
      </div>

      <SuppliersKpiCards
        suppliers={list.filteredSuppliers}
        totalPurchases={kpiTotalPurchases}
        totalBalance={kpiTotalBalance}
      />

      <div className={cn(PANEL, "flex flex-wrap items-center justify-between gap-3 p-4")}>
        <AppSearchInput
          placeholder="البحث عن مورد..."
          value={list.search}
          onChange={(event) => list.setSearch(event.target.value)}
          wrapperClassName="w-full sm:w-72"
          className={FIELD_CLASS}
        />

        <div className="flex flex-wrap items-center gap-2">
          <AppSearchableSelect
            value={list.status}
            options={STATUS_OPTIONS}
            onChange={(value) => list.setStatus(value as typeof list.status)}
            placeholder="الحالة"
            ariaLabel="الحالة"
            triggerClassName="w-[160px]"
          />

          <AppButton
            variant="outline"
            icon={<Download className="size-4" />}
            className={SECONDARY_BUTTON_CLASS}
            onClick={() => exportSuppliersToCsv(list.filteredSuppliers, balanceBySupplier)}
          >
            تصدير
          </AppButton>

          <AppButton
            icon={
              <span className="flex size-5 items-center justify-center rounded-full bg-white/20">
                <Plus className="size-3.5" strokeWidth={2.5} />
              </span>
            }
            onClick={() => router.push(ROUTES.suppliersAdd)}
            className="h-11 gap-2 rounded-full bg-[#2878ff] px-5 text-[13.5px] font-semibold text-white shadow-[0_6px_16px_rgba(40,120,255,0.28)] transition-all hover:-translate-y-px hover:bg-[#1f63d6] hover:shadow-[0_8px_20px_rgba(40,120,255,0.34)] active:translate-y-0"
          >
            إضافة مورد
          </AppButton>
        </div>
      </div>

      {selectedIds.size > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[#c4d5f0] bg-[#eef4ff] px-4 py-3">
          <p className="text-[12.5px] font-semibold text-[#2878ff]">{selectedIds.size} مورد محدد</p>
          <div className="flex flex-wrap items-center gap-2">
            <AppButton
              variant="outline"
              className="h-9 rounded-[10px] border-emerald-200 bg-white px-3 text-[12px] font-semibold text-emerald-600 hover:bg-emerald-50"
              onClick={() => void handleBulkStatus("active")}
            >
              تفعيل
            </AppButton>
            <AppButton
              variant="outline"
              className="h-9 rounded-[10px] border-amber-200 bg-white px-3 text-[12px] font-semibold text-amber-600 hover:bg-amber-50"
              onClick={() => void handleBulkStatus("inactive")}
            >
              إلغاء التفعيل
            </AppButton>
            <AppButton
              variant="outline"
              className="h-9 rounded-[10px] border-rose-200 bg-white px-3 text-[12px] font-semibold text-rose-600 hover:bg-rose-50"
              onClick={() => setBulkDeleteOpen(true)}
            >
              حذف
            </AppButton>
            <AppButton
              variant="ghost"
              className="h-9 rounded-[10px] px-3 text-[12px] font-semibold text-[#6b7b96]"
              onClick={() => setSelectedIds(new Set())}
            >
              إلغاء التحديد
            </AppButton>
          </div>
        </div>
      ) : null}

      <div className={cn(PANEL, "overflow-hidden")}>
        <AppTable>
          <AppTableHeader>
            <AppTableRow>
              <AppTableHead className="w-10 px-3 text-center">
                <div className="flex items-center justify-center">
                  <AppCheckbox
                    checked={someOnPageSelected ? "indeterminate" : allOnPageSelected}
                    onCheckedChange={(checked) => toggleAllOnPage(checked === true)}
                    aria-label="تحديد الكل"
                    className="size-[18px] rounded-[5px] border-[#c4d5f0] bg-white data-checked:border-[#2878ff] data-checked:bg-[#2878ff]"
                  />
                </div>
              </AppTableHead>
              <AppTableHead>معرف المورد</AppTableHead>
              <AppTableHead>المورد</AppTableHead>
              <AppTableHead>اسم الشركة</AppTableHead>
              <AppTableHead>إجمالي المشتريات</AppTableHead>
              <AppTableHead>التواصل</AppTableHead>
              <AppTableHead>الحالة</AppTableHead>
              <AppTableHead>الرصيد</AppTableHead>
              <AppTableHead className="w-40">الإجراءات</AppTableHead>
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {list.rows.map((supplier) => {
              const balance = balanceBySupplier.get(supplier.id) ?? 0
              return (
                <AppTableRow key={supplier.id} data-selected={selectedIds.has(supplier.id)}>
                  <AppTableCell className="w-10 px-3 text-center">
                    <div className="flex items-center justify-center">
                      <AppCheckbox
                        checked={selectedIds.has(supplier.id)}
                        onCheckedChange={(checked) => toggleRow(supplier.id, checked === true)}
                        aria-label={`تحديد ${supplier.name}`}
                        className="size-[18px] rounded-[5px] border-[#c4d5f0] bg-white data-checked:border-[#2878ff] data-checked:bg-[#2878ff]"
                      />
                    </div>
                  </AppTableCell>
                  <AppTableCell className={MUTED}>{supplier.code}</AppTableCell>
                  <AppTableCell>
                    <div className="flex items-center gap-2.5">
                      <SupplierAvatar
                        name={supplier.name}
                        imageUrl={supplier.imageUrl}
                        className="size-8"
                      />
                      <span className={cn("font-medium", HEADING)}>{supplier.name}</span>
                    </div>
                  </AppTableCell>
                  <AppTableCell className={MUTED}>
                    {supplier.companyDetails.companyName}
                  </AppTableCell>
                  <AppTableCell className={cn("font-medium", HEADING)}>
                    {formatCurrency(totalPurchasesBySupplier.get(supplier.id) ?? 0)}
                  </AppTableCell>
                  <AppTableCell className={MUTED}>{supplier.phone}</AppTableCell>
                  <AppTableCell>
                    <SupplierStatusBadge status={supplier.status} />
                  </AppTableCell>
                  <AppTableCell
                    className={cn(
                      "font-bold",
                      balance === 0 ? HEADING : balance > 0 ? "text-[#16a34a]" : "text-[#dc2626]"
                    )}
                  >
                    {formatBalance(balance)}
                  </AppTableCell>
                  <AppTableCell>
                    <div className="flex items-center gap-1.5">
                      <AppButton
                        variant="ghost"
                        size="icon-sm"
                        aria-label={supplier.status === "active" ? "إلغاء التفعيل" : "تفعيل"}
                        className={cn(
                          ACTION_ICON_CLASS,
                          supplier.status === "active"
                            ? "border-amber-100 bg-amber-50 text-amber-600 hover:bg-amber-100 hover:text-amber-700"
                            : "border-emerald-100 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700"
                        )}
                        onClick={() => void handleToggleStatus(supplier)}
                      >
                        {supplier.status === "active" ? (
                          <Ban className="size-4" />
                        ) : (
                          <CheckCircle2 className="size-4" />
                        )}
                      </AppButton>
                      <AppButton
                        variant="ghost"
                        size="icon-sm"
                        aria-label="عرض"
                        className={cn(
                          ACTION_ICON_CLASS,
                          "border-blue-100 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700"
                        )}
                        onClick={() => setViewTarget(supplier)}
                      >
                        <Eye className="size-4" />
                      </AppButton>
                      <AppButton
                        variant="ghost"
                        size="icon-sm"
                        aria-label="كشف الحساب"
                        className={cn(
                          ACTION_ICON_CLASS,
                          "border-indigo-100 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-700"
                        )}
                        onClick={() => router.push(ROUTES.supplierStatement(supplier.id))}
                      >
                        <FileText className="size-4" />
                      </AppButton>
                      <AppButton
                        variant="ghost"
                        size="icon-sm"
                        aria-label="تعديل"
                        className={cn(
                          ACTION_ICON_CLASS,
                          "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-700"
                        )}
                        onClick={() => router.push(`${ROUTES.suppliersAdd}?id=${supplier.id}`)}
                      >
                        <Pencil className="size-4" />
                      </AppButton>
                      <AppButton
                        variant="ghost"
                        size="icon-sm"
                        aria-label="حذف"
                        className={cn(
                          ACTION_ICON_CLASS,
                          "border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700"
                        )}
                        onClick={() => setDeleteTarget(supplier)}
                      >
                        <Trash2 className="size-4" />
                      </AppButton>
                    </div>
                  </AppTableCell>
                </AppTableRow>
              )
            })}
          </AppTableBody>
        </AppTable>

        {isLoading ? (
          <div className={cn("flex items-center justify-center gap-2 py-16 text-[13px]", MUTED)}>
            <Loader2 className="size-4 animate-spin" />
            جارٍ التحميل...
          </div>
        ) : list.rows.length === 0 ? (
          <AppTableEmpty
            title="لا يوجد موردون مطابقون"
            description="جرّب تعديل الفلاتر أو البحث."
          />
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e1e7f0] px-4 py-3">
          <p className={cn("shrink-0 text-sm whitespace-nowrap", MUTED)}>
            عرض {list.rows.length} من {list.totalCount} نتيجة
          </p>
          <SupplierPagination
            page={list.page}
            totalPages={list.totalPages}
            onPageChange={list.setPage}
          />
        </div>
      </div>

      <SupplierViewDialog
        supplier={viewTarget}
        balance={viewTarget ? (balanceBySupplier.get(viewTarget.id) ?? 0) : 0}
        onOpenChange={(open) => !open && setViewTarget(null)}
      />
      <SupplierDeleteDialog
        target={deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onDeleted={() => void refetch()}
      />
      <AppConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={(open) => !bulkDeleting && setBulkDeleteOpen(open)}
        title={
          <span dir="rtl" className="text-[17px] font-extrabold text-[#0b1738]">
            حذف {selectedIds.size} مورد
          </span>
        }
        description={
          <span dir="rtl" className="text-[13px] text-[#6b7b96]">
            سيتم حذف الموردين المحددين نهائيًا. لا يمكن التراجع عن هذا الإجراء.
          </span>
        }
        confirmLabel="حذف"
        cancelLabel="إلغاء"
        confirmButtonClassName="rounded-[10px] bg-rose-600 font-bold text-white hover:bg-rose-700"
        cancelButtonClassName="rounded-[10px] border-[#e1e7f0] font-semibold text-[#0b1738] hover:bg-[#f7f9fd]"
        loading={bulkDeleting}
        onConfirm={() => void handleBulkDelete()}
        onCancel={() => setBulkDeleteOpen(false)}
        contentClassName="[direction:rtl] max-w-[26rem] gap-5 p-6"
      />
    </div>
  )
}

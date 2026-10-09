"use client"

import { useRouter } from "next/navigation"
import { Download, Loader2, Plus, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

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

import { useWorkspace } from "@/features/workspace"

import { useExpenseCategories, useExpenses, useExpensesList } from "../hooks"
import { exportExpensesToCsv } from "../services"
import { EXPENSE_PAYMENT_METHODS } from "../types"
import { ExpensePagination, FIELD_CLASS, HEADING, MUTED, PANEL } from "./expense-field"

const PAYMENT_METHOD_LABEL = Object.fromEntries(
  EXPENSE_PAYMENT_METHODS.map((method) => [method.value, method.label])
)

function formatCurrency(value: number) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value))} ر.س`
}

export function ExpensesListPage() {
  const router = useRouter()
  const { expenses, isLoading } = useExpenses()
  const { categories } = useExpenseCategories()
  const { availableWorkspaces } = useWorkspace()
  const list = useExpensesList(expenses)

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className={cn("text-2xl font-bold", HEADING)}>قائمة المصروفات</h1>
          <p className={cn("mt-1 text-sm", MUTED)}>عرض وفلترة جميع مصروفات المنشأة.</p>
        </div>
        <AppButton
          icon={
            <span className="flex size-5 items-center justify-center rounded-full bg-white/20">
              <Plus className="size-3.5" strokeWidth={2.5} />
            </span>
          }
          className="h-11 gap-2 rounded-full bg-[#2878ff] px-5 text-[13.5px] font-bold text-white shadow-[0_6px_16px_rgba(40,120,255,0.28)] transition-all hover:-translate-y-px hover:bg-[#1f63d6]"
          onClick={() => router.push(ROUTES.expensesAdd)}
        >
          إضافة مصروف
        </AppButton>
      </div>

      <div className={cn(PANEL, "flex flex-wrap items-center justify-between gap-3 p-4")}>
        <AppSearchInput
          placeholder="البحث في المصروفات..."
          value={list.search}
          onChange={(event) => list.setSearch(event.target.value)}
          wrapperClassName="w-full sm:w-64"
          className={FIELD_CLASS}
        />

        <div className="flex flex-wrap items-center gap-2">
          <AppSearchableSelect
            value={list.categoryId}
            options={[
              { value: "all", label: "كل الفئات" },
              ...categories.map((category) => ({ value: category.id, label: category.name })),
            ]}
            onChange={(value) => list.setCategoryId(value)}
            placeholder="الفئة"
            ariaLabel="الفئة"
            triggerClassName="w-[160px]"
          />
          <AppSearchableSelect
            value={list.workspaceId}
            options={[
              { value: "all", label: "كل الفروع" },
              ...availableWorkspaces.map((workspace) => ({
                value: workspace.id,
                label: workspace.name,
              })),
            ]}
            onChange={(value) => list.setWorkspaceId(value)}
            placeholder="الفرع"
            ariaLabel="الفرع"
            triggerClassName="w-[160px]"
          />
          <AppSearchableSelect
            value={list.paymentMethod}
            options={[{ value: "all", label: "كل طرق الدفع" }, ...EXPENSE_PAYMENT_METHODS]}
            onChange={(value) => list.setPaymentMethod(value as typeof list.paymentMethod)}
            placeholder="طريقة الدفع"
            ariaLabel="طريقة الدفع"
            triggerClassName="w-[160px]"
          />
          <AppDateRangeFilter value={list.dateRange} onChange={list.setDateRange} />
          {list.hasActiveFilters ? (
            <AppButton
              variant="outline"
              icon={<X className="size-3.5" />}
              className="h-11 shrink-0 gap-1.5 rounded-[12px] border-[#e8edf3] px-3 text-[12.5px] font-semibold text-[#5b6b85]"
              onClick={list.resetFilters}
            >
              مسح الفلاتر
            </AppButton>
          ) : null}
          <AppButton
            variant="outline"
            icon={<Download className="size-4" />}
            className="h-11 gap-2 rounded-[12px] border-[#c4d5f0] bg-white px-4 text-[12.5px] font-semibold text-[#2878ff] hover:bg-[#eef4ff]"
            onClick={() => exportExpensesToCsv(list.filteredExpenses)}
          >
            تصدير
          </AppButton>
        </div>
      </div>

      <div className={cn(PANEL, "overflow-hidden")}>
        <AppTable>
          <AppTableHeader>
            <AppTableRow>
              <AppTableHead>اسم المصروف</AppTableHead>
              <AppTableHead>الفئة</AppTableHead>
              <AppTableHead>الفرع</AppTableHead>
              <AppTableHead>المبلغ</AppTableHead>
              <AppTableHead>طريقة الدفع</AppTableHead>
              <AppTableHead>الضريبة</AppTableHead>
              <AppTableHead>التاريخ</AppTableHead>
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {list.rows.map((expense) => (
              <AppTableRow key={expense.id}>
                <AppTableCell className="font-medium text-black">{expense.name}</AppTableCell>
                <AppTableCell className="text-black">{expense.categoryName}</AppTableCell>
                <AppTableCell className="text-black">{expense.workspaceName}</AppTableCell>
                <AppTableCell className="font-medium text-black">
                  {formatCurrency(expense.amount)}
                </AppTableCell>
                <AppTableCell className="text-black">
                  {PAYMENT_METHOD_LABEL[expense.paymentMethod] ?? expense.paymentMethod}
                </AppTableCell>
                <AppTableCell className="text-black">
                  {expense.taxInclusive ? "شامل الضريبة" : "غير شامل الضريبة"}
                </AppTableCell>
                <AppTableCell className="text-black">{expense.expenseDate}</AppTableCell>
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
            title="لا توجد مصروفات مطابقة"
            description="جرّب تعديل الفلاتر أو البحث."
          />
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e1e7f0] px-4 py-3">
          <p className={cn("shrink-0 text-sm whitespace-nowrap", MUTED)}>
            عرض {list.rows.length} من {list.totalCount} نتيجة
          </p>
          <ExpensePagination
            page={list.page}
            totalPages={list.totalPages}
            onPageChange={list.setPage}
          />
        </div>
      </div>
    </div>
  )
}

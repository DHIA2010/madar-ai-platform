"use client"

import { useRouter } from "next/navigation"
import { Loader2, Plus, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppDateRangeFilter, AppSearchableSelect } from "@/components/app"

import { useWorkspace } from "@/features/workspace"

import { useExpenseCategories, useExpenses, useExpensesList, useExpensesOverview } from "../hooks"
import { EXPENSE_PAYMENT_METHODS } from "../types"
import { ExpenseCategoryDonutCard } from "./expense-category-donut-card"
import { ExpenseCategoryStackedBarCard } from "./expense-category-stacked-bar-card"
import { HEADING, MUTED, PANEL } from "./expense-field"
import { ExpenseInsightsCard } from "./expense-insights-card"
import { ExpenseTrendChartCard } from "./expense-trend-chart-card"
import { ExpensesByWorkspaceCard } from "./expenses-by-workspace-card"
import { ExpensesKpiCards } from "./expenses-kpi-cards"
import { RecentExpensesCard } from "./recent-expenses-card"

export function ExpensesOverviewPage() {
  const router = useRouter()
  const { expenses, isLoading } = useExpenses()
  const { categories } = useExpenseCategories()
  const { availableWorkspaces } = useWorkspace()
  // Same filter state/logic as the expenses list page (useExpensesList) -- the Overview's
  // KPIs/charts are derived from the filtered set, not the raw one.
  const list = useExpensesList(expenses)
  const overview = useExpensesOverview(list.filteredExpenses)

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className={cn("text-2xl font-bold", HEADING)}>المصروفات</h1>
          <p className={cn("mt-1 text-sm", MUTED)}>نظرة عامة على مصروفات المنشأة.</p>
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

      <div className={cn(PANEL, "flex flex-wrap items-center gap-3 p-4")}>
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
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 p-16 text-[13px] text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          جارٍ التحميل...
        </div>
      ) : (
        <>
          <ExpensesKpiCards
            totalAmount={overview.totalAmount}
            expenseCount={overview.expenseCount}
            monthOverMonthDelta={overview.monthOverMonthDelta}
            categoryCount={categories.length}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <ExpenseCategoryDonutCard data={overview.categoryBreakdown} />
            <ExpenseTrendChartCard data={overview.monthlyTrend} />
          </div>

          <ExpenseCategoryStackedBarCard
            data={overview.categoryByMonthStacked}
            seriesKeys={overview.stackedSeriesKeys}
          />

          <div className="grid gap-4 lg:grid-cols-3">
            <ExpensesByWorkspaceCard workspaces={overview.topWorkspaces} />
            <div className="lg:col-span-2">
              <RecentExpensesCard expenses={overview.recentExpenses} />
            </div>
          </div>

          <ExpenseInsightsCard insights={overview.insights} />
        </>
      )}
    </div>
  )
}

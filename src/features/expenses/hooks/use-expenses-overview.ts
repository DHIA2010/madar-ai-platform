"use client"

import { useMemo } from "react"

import type { Expense } from "../types"

// ar-SA formats both digits and dates against locale defaults (Eastern Arabic-Indic numerals,
// the Hijri calendar) in some ICU builds -- forcing Western digits + Gregorian here matches the
// same workaround kpi-widget-renderer.tsx already uses for the same reason.
const GREGORIAN_MONTH_LOCALE = "ar-SA-u-ca-gregory-nu-latn"
const MONTH_COUNT = 6
const TOP_WORKSPACE_COUNT = 5
const TOP_CATEGORY_SERIES_COUNT = 4
const RECENT_COUNT = 8

function monthKey(dateString: string): string {
  return dateString.slice(0, 7) // "YYYY-MM"
}

function monthLabel(key: string): string {
  const date = new Date(`${key}-01`)
  return new Intl.DateTimeFormat(GREGORIAN_MONTH_LOCALE, {
    month: "short",
    year: "2-digit",
  }).format(date)
}

function lastMonthKeys(count: number): string[] {
  const now = new Date()
  const keys: string[] = []
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    keys.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`)
  }
  return keys
}

// Everything here is organization-level, never tied to a supplier/vendor -- see the backend
// schema (expenses table has no supplier_id) and the frontend form (no vendor field).
export function useExpensesOverview(expenses: Expense[]) {
  return useMemo(() => {
    const totalAmount = expenses.reduce((sum, expense) => sum + expense.amount, 0)

    const months = lastMonthKeys(MONTH_COUNT)
    const totalsByMonth = new Map<string, number>()
    for (const month of months) totalsByMonth.set(month, 0)
    for (const expense of expenses) {
      const key = monthKey(expense.expenseDate)
      if (totalsByMonth.has(key)) {
        totalsByMonth.set(key, (totalsByMonth.get(key) ?? 0) + expense.amount)
      }
    }
    const monthlyTrend = months.map((month) => ({
      label: monthLabel(month),
      value: totalsByMonth.get(month) ?? 0,
    }))

    const currentMonthTotal = totalsByMonth.get(months[months.length - 1]) ?? 0
    const previousMonthTotal = totalsByMonth.get(months[months.length - 2]) ?? 0
    const monthOverMonthDelta =
      previousMonthTotal > 0
        ? ((currentMonthTotal - previousMonthTotal) / previousMonthTotal) * 100
        : null

    const totalsByCategory = new Map<string, number>()
    for (const expense of expenses) {
      totalsByCategory.set(
        expense.categoryName,
        (totalsByCategory.get(expense.categoryName) ?? 0) + expense.amount
      )
    }
    const categoryBreakdown = [...totalsByCategory.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((left, right) => right.value - left.value)

    // Stacked bar: one series per top category (the rest folded into "أخرى") across the same
    // months as the trend chart.
    const topCategoryNames = categoryBreakdown
      .slice(0, TOP_CATEGORY_SERIES_COUNT)
      .map((c) => c.label)
    const hasOtherBucket = categoryBreakdown.length > TOP_CATEGORY_SERIES_COUNT
    const stackedSeriesKeys = hasOtherBucket ? [...topCategoryNames, "أخرى"] : topCategoryNames
    const stackedTotals = new Map<string, Map<string, number>>()
    for (const month of months) stackedTotals.set(month, new Map())
    for (const expense of expenses) {
      const key = monthKey(expense.expenseDate)
      const bucket = stackedTotals.get(key)
      if (!bucket) continue
      const series = topCategoryNames.includes(expense.categoryName) ? expense.categoryName : "أخرى"
      bucket.set(series, (bucket.get(series) ?? 0) + expense.amount)
    }
    const categoryByMonthStacked = months.map((month) => {
      const bucket = stackedTotals.get(month) ?? new Map<string, number>()
      const row: Record<string, string | number> = { label: monthLabel(month) }
      for (const series of stackedSeriesKeys) row[series] = bucket.get(series) ?? 0
      return row
    })

    // Replaces a vendor/supplier breakdown with one by branch (workspace) -- the real
    // organization-level dimension this module actually has.
    const totalsByWorkspace = new Map<string, number>()
    for (const expense of expenses) {
      totalsByWorkspace.set(
        expense.workspaceName,
        (totalsByWorkspace.get(expense.workspaceName) ?? 0) + expense.amount
      )
    }
    const topWorkspaces = [...totalsByWorkspace.entries()]
      .map(([workspaceName, total]) => ({ workspaceName, total }))
      .sort((left, right) => right.total - left.total)
      .slice(0, TOP_WORKSPACE_COUNT)

    const recentExpenses = [...expenses]
      .sort((left, right) => right.expenseDate.localeCompare(left.expenseDate))
      .slice(0, RECENT_COUNT)

    const insights: string[] = []
    if (categoryBreakdown.length > 0) {
      const top = categoryBreakdown[0]
      const pct = totalAmount > 0 ? Math.round((top.value / totalAmount) * 100) : 0
      insights.push(`"${top.label}" هي الفئة الأعلى إنفاقًا بنسبة ${pct}% من الإجمالي.`)
    }
    if (monthOverMonthDelta !== null) {
      const direction = monthOverMonthDelta >= 0 ? "زاد" : "انخفض"
      insights.push(
        `إنفاق هذا الشهر ${direction} بنسبة ${Math.abs(Math.round(monthOverMonthDelta))}% عن الشهر الماضي.`
      )
    }
    if (topWorkspaces.length > 1) {
      insights.push(
        `${topWorkspaces[0].workspaceName} هو الفرع الأعلى إنفاقًا بإجمالي ${Math.round(topWorkspaces[0].total).toLocaleString("en-US")}.`
      )
    }

    return {
      totalAmount,
      expenseCount: expenses.length,
      monthOverMonthDelta,
      monthlyTrend,
      categoryBreakdown,
      categoryByMonthStacked,
      stackedSeriesKeys,
      topWorkspaces,
      recentExpenses,
      insights,
    }
  }, [expenses])
}

"use client"

import { useMemo, useState } from "react"
import type { DateRange } from "react-day-picker"

import type { Expense, ExpensePaymentMethod } from "../types"

const PAGE_SIZE = 10

// Search/category/branch/payment-method/date-range filter + pagination over an already-fetched
// list -- the real data source (useExpenses()) lives at the page level. No KPIs here by design;
// those belong to the Overview page only.
export function useExpensesList(expenses: Expense[]) {
  const [search, setSearchState] = useState("")
  const [categoryId, setCategoryIdState] = useState<string | "all">("all")
  const [workspaceId, setWorkspaceIdState] = useState<string | "all">("all")
  const [paymentMethod, setPaymentMethodState] = useState<ExpensePaymentMethod | "all">("all")
  const [dateRange, setDateRangeState] = useState<DateRange | undefined>(undefined)
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return expenses.filter((expense) => {
      if (categoryId !== "all" && expense.categoryId !== categoryId) return false
      if (workspaceId !== "all" && expense.workspaceId !== workspaceId) return false
      if (paymentMethod !== "all" && expense.paymentMethod !== paymentMethod) return false
      if (dateRange?.from || dateRange?.to) {
        const occurred = new Date(expense.expenseDate)
        if (dateRange.from && occurred < dateRange.from) return false
        if (dateRange.to && occurred > dateRange.to) return false
      }
      if (query.length === 0) return true
      return (
        expense.name.toLowerCase().includes(query) ||
        expense.categoryName.toLowerCase().includes(query) ||
        expense.workspaceName.toLowerCase().includes(query) ||
        expense.referenceNumber.toLowerCase().includes(query)
      )
    })
  }, [expenses, search, categoryId, workspaceId, paymentMethod, dateRange])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const rows = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage]
  )

  function setSearch(value: string) {
    setSearchState(value)
    setPage(1)
  }
  function setCategoryId(value: string | "all") {
    setCategoryIdState(value)
    setPage(1)
  }
  function setWorkspaceId(value: string | "all") {
    setWorkspaceIdState(value)
    setPage(1)
  }
  function setPaymentMethod(value: ExpensePaymentMethod | "all") {
    setPaymentMethodState(value)
    setPage(1)
  }
  function setDateRange(value: DateRange | undefined) {
    setDateRangeState(value)
    setPage(1)
  }

  const hasActiveFilters =
    search !== "" ||
    categoryId !== "all" ||
    workspaceId !== "all" ||
    paymentMethod !== "all" ||
    Boolean(dateRange?.from || dateRange?.to)

  function resetFilters() {
    setSearchState("")
    setCategoryIdState("all")
    setWorkspaceIdState("all")
    setPaymentMethodState("all")
    setDateRangeState(undefined)
    setPage(1)
  }

  return {
    search,
    setSearch,
    categoryId,
    setCategoryId,
    workspaceId,
    setWorkspaceId,
    paymentMethod,
    setPaymentMethod,
    dateRange,
    setDateRange,
    page: currentPage,
    setPage,
    totalPages,
    totalCount: filtered.length,
    filteredExpenses: filtered,
    rows,
    hasActiveFilters,
    resetFilters,
  }
}

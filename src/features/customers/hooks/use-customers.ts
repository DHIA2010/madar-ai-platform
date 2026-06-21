"use client"

import { useCallback, useMemo, useState } from "react"

import { customerListService } from "../services"
import type { CustomerFilterState, CustomerListViewModel } from "../types"

const DEFAULT_FILTERS: CustomerFilterState = {
  search: "",
  status: "all",
  segment: "",
  source: "",
  channel: "",
  sortBy: "lastActivity",
  sortDir: "desc",
  page: 1,
  pageSize: 10,
}

export function useCustomers() {
  const [filters, setFilters] = useState<CustomerFilterState>(DEFAULT_FILTERS)

  const listResult: CustomerListViewModel = useMemo(
    () => customerListService.listCustomers(filters),
    [filters]
  )

  const availableFilters = useMemo(() => customerListService.getAvailableFilters(), [])

  const updateFilters = useCallback((partial: Partial<CustomerFilterState>) => {
    setFilters((prev) => ({
      ...prev,
      ...partial,
      page: partial.page !== undefined ? partial.page : 1,
    }))
  }, [])

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
  }, [])

  return {
    records: listResult.records,
    total: listResult.total,
    page: listResult.page,
    pageSize: listResult.pageSize,
    hasNextPage: listResult.hasNextPage,
    hasPrevPage: listResult.hasPrevPage,
    filters,
    availableFilters,
    updateFilters,
    resetFilters,
  }
}

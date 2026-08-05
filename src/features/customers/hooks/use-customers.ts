"use client"

import { useCallback, useMemo, useState } from "react"

import { useWorkspace } from "@/features/workspace"

import { customerListService } from "../services"
import type { CustomerFilterState, CustomerListViewModel } from "../types"

const DEFAULT_FILTERS: Omit<CustomerFilterState, "workspaceId"> = {
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
  const { currentWorkspace } = useWorkspace()
  const [filters, setFilters] = useState<Omit<CustomerFilterState, "workspaceId">>(DEFAULT_FILTERS)

  const scopedFilters = useMemo<CustomerFilterState>(
    () => ({ ...filters, workspaceId: currentWorkspace?.id }),
    [filters, currentWorkspace?.id]
  )

  const listResult: CustomerListViewModel = useMemo(
    () => customerListService.listCustomers(scopedFilters),
    [scopedFilters]
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

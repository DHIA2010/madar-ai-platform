"use client"

import { useMemo, useState } from "react"

import type { PurchaseReturn } from "../types"

const PAGE_SIZE = 10

// Search/status/supplier/warehouse filter + pagination over an already-fetched list -- the real
// data source (useProcurementReturns()) lives at the page level.
export function useReturnsList(returns: PurchaseReturn[]) {
  const [search, setSearchState] = useState("")
  const [status, setStatusState] = useState<PurchaseReturn["status"] | "all">("all")
  const [supplierId, setSupplierIdState] = useState<string | "all">("all")
  const [warehouseId, setWarehouseIdState] = useState<string | "all">("all")
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return returns.filter((entry) => {
      if (status !== "all" && entry.status !== status) return false
      if (supplierId !== "all" && entry.supplierId !== supplierId) return false
      if (warehouseId !== "all" && entry.warehouseId !== warehouseId) return false
      if (query.length === 0) return true
      return (
        entry.code.toLowerCase().includes(query) ||
        entry.purchaseCode.toLowerCase().includes(query) ||
        entry.supplierName.toLowerCase().includes(query)
      )
    })
  }, [returns, search, status, supplierId, warehouseId])

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
  function setStatus(value: PurchaseReturn["status"] | "all") {
    setStatusState(value)
    setPage(1)
  }
  function setSupplierId(value: string | "all") {
    setSupplierIdState(value)
    setPage(1)
  }
  function setWarehouseId(value: string | "all") {
    setWarehouseIdState(value)
    setPage(1)
  }

  return {
    search,
    setSearch,
    status,
    setStatus,
    supplierId,
    setSupplierId,
    warehouseId,
    setWarehouseId,
    page: currentPage,
    setPage,
    totalPages,
    totalCount: filtered.length,
    filteredReturns: filtered,
    rows,
  }
}

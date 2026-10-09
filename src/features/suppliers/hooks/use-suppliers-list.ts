"use client"

import { useMemo, useState } from "react"

import type { Supplier } from "../types"

const PAGE_SIZE = 10

// Search/status filter/pagination over an already-fetched list -- the real data source
// (useSuppliers()) lives at the page level; this hook is unchanged from its Zustand-backed
// version except for taking that array as a parameter instead of reading a store.
export function useSuppliersList(suppliers: Supplier[]) {
  const [search, setSearchState] = useState("")
  const [status, setStatusState] = useState<Supplier["status"] | "all">("all")
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return suppliers.filter((supplier) => {
      if (status !== "all" && supplier.status !== status) return false
      if (query.length === 0) return true
      return (
        supplier.name.toLowerCase().includes(query) ||
        supplier.companyDetails.companyName.toLowerCase().includes(query) ||
        supplier.email.toLowerCase().includes(query) ||
        supplier.code.toLowerCase().includes(query)
      )
    })
  }, [suppliers, search, status])

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

  function setStatus(value: Supplier["status"] | "all") {
    setStatusState(value)
    setPage(1)
  }

  return {
    search,
    setSearch,
    status,
    setStatus,
    page: currentPage,
    setPage,
    totalPages,
    totalCount: filtered.length,
    filteredSuppliers: filtered,
    rows,
  }
}

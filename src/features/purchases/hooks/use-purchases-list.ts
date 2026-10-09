"use client"

import { useMemo, useState } from "react"

import { convertToOrgCurrency, type SupportedOrgCurrency } from "../services"
import type { Purchase, PurchasePaymentStatus, PurchasePaymentVoucher } from "../types"
import { derivePurchasePaymentStatus, purchaseGrandTotal } from "../types"

const PAGE_SIZE = 10

// Search/status/payment-status filter + pagination over an already-fetched list -- the real data
// sources (useProcurementPurchases(), the supplier vouchers fetch) live at the page level; this
// hook is otherwise unchanged from its Zustand-backed version.
export function usePurchasesList(
  purchases: Purchase[],
  vouchers: PurchasePaymentVoucher[],
  orgCurrency: SupportedOrgCurrency
) {
  const [search, setSearchState] = useState("")
  const [status, setStatusState] = useState<Purchase["status"] | "all">("all")
  const [paymentStatus, setPaymentStatusState] = useState<PurchasePaymentStatus | "all">("all")
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return purchases.filter((purchase) => {
      if (status !== "all" && purchase.status !== status) return false
      if (
        paymentStatus !== "all" &&
        derivePurchasePaymentStatus(purchase, vouchers) !== paymentStatus
      ) {
        return false
      }
      if (query.length === 0) return true
      return (
        purchase.code.toLowerCase().includes(query) ||
        purchase.supplierName.toLowerCase().includes(query) ||
        purchase.referenceNumber.toLowerCase().includes(query)
      )
    })
  }, [purchases, search, status, paymentStatus, vouchers])

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
  function setStatus(value: Purchase["status"] | "all") {
    setStatusState(value)
    setPage(1)
  }
  function setPaymentStatus(value: PurchasePaymentStatus | "all") {
    setPaymentStatusState(value)
    setPage(1)
  }

  const kpis = useMemo(() => {
    const totalPurchases = purchases.reduce((sum, p) => {
      const converted = convertToOrgCurrency(purchaseGrandTotal(p), p.currency, orgCurrency)
      return sum + (converted ?? 0)
    }, 0)
    const pendingOrders = purchases.filter((p) => p.status === "pending").length
    return {
      totalPurchases,
      totalOrders: purchases.length,
      pendingOrders,
    }
  }, [purchases, orgCurrency])

  return {
    search,
    setSearch,
    status,
    setStatus,
    paymentStatus,
    setPaymentStatus,
    page: currentPage,
    setPage,
    totalPages,
    totalCount: filtered.length,
    filteredPurchases: filtered,
    rows,
    kpis,
  }
}

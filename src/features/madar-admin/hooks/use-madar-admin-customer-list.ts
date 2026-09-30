"use client"

import { useMemo, useState } from "react"

import { listCustomers } from "../services"
import type { PlanTier, PlatformKey, SubscriptionStatus } from "../types"

const PAGE_SIZE = 10

// Shared by both the Customers and Subscriptions pages -- in this mock dataset a subscription IS
// a customer row (one active subscription per customer), so the two screens differ only in which
// columns they render, not in the underlying list/filter/paginate logic.
export function useMadarAdminCustomerList() {
  const [search, setSearch] = useState("")
  const [platform, setPlatform] = useState<PlatformKey | "all">("all")
  const [plan, setPlan] = useState<PlanTier | "all">("all")
  const [status, setStatus] = useState<SubscriptionStatus | "all">("all")
  const [page, setPage] = useState(1)

  const filtered = useMemo(
    () => listCustomers({ search, platform, plan, status }),
    [search, platform, plan, status]
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const rows = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage]
  )

  function updateFilter<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value)
      setPage(1)
    }
  }

  return {
    search,
    setSearch: updateFilter(setSearch),
    platform,
    setPlatform: updateFilter(setPlatform),
    plan,
    setPlan: updateFilter(setPlan),
    status,
    setStatus: updateFilter(setStatus),
    page: currentPage,
    setPage,
    totalPages,
    totalCount: filtered.length,
    rows,
  }
}

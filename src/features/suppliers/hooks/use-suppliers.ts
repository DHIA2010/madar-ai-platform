"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"

import { supplierService } from "../services"
import type { Supplier } from "../types"

// Fetch-on-mount, no client-side cache layer -- mirrors src/features/customers's own
// useCustomers() exactly (the one real precedent for a backend-connected feature in this
// codebase). Callers refetch() after a mutation rather than optimistically patching local state.
export function useSuppliers() {
  const t = useTranslations("suppliers.errors")
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setSuppliers(await supplierService.list())
    } catch {
      setError(t("loadSuppliers"))
    } finally {
      setIsLoading(false)
    }
  }, [t])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { suppliers, isLoading, error, refetch }
}

"use client"

import { useCallback, useEffect, useState } from "react"

import { voucherService } from "../services"
import type { SupplierVoucher } from "../types"

export function useSupplierVouchers() {
  const [vouchers, setVouchers] = useState<SupplierVoucher[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setVouchers(await voucherService.list())
    } catch {
      setError("تعذر تحميل السندات. حاول مرة أخرى.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { vouchers, isLoading, error, refetch }
}

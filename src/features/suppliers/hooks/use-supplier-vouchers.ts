"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"

import { voucherService } from "../services"
import type { SupplierVoucher } from "../types"

export function useSupplierVouchers() {
  const t = useTranslations("suppliers.errors")
  const [vouchers, setVouchers] = useState<SupplierVoucher[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setVouchers(await voucherService.list())
    } catch {
      setError(t("loadVouchers"))
    } finally {
      setIsLoading(false)
    }
  }, [t])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { vouchers, isLoading, error, refetch }
}

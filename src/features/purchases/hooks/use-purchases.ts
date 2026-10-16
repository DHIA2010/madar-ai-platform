"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"

import { purchaseService } from "../services"
import type { Purchase } from "../types"

export function usePurchases() {
  const t = useTranslations("purchases.errors")
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setPurchases(await purchaseService.list())
    } catch {
      setError(t("loadPurchases"))
    } finally {
      setIsLoading(false)
    }
  }, [t])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { purchases, isLoading, error, refetch }
}

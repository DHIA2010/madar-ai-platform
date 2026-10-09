"use client"

import { useCallback, useEffect, useState } from "react"

import { purchaseService } from "../services"
import type { Purchase } from "../types"

export function usePurchases() {
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setPurchases(await purchaseService.list())
    } catch {
      setError("تعذر تحميل أوامر الشراء. حاول مرة أخرى.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { purchases, isLoading, error, refetch }
}

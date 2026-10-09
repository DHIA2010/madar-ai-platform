"use client"

import { useCallback, useEffect, useState } from "react"

import { returnService } from "../services"
import type { PurchaseReturn } from "../types"

export function useReturns() {
  const [returns, setReturns] = useState<PurchaseReturn[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setReturns(await returnService.list())
    } catch {
      setError("تعذر تحميل المرتجعات. حاول مرة أخرى.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { returns, isLoading, error, refetch }
}

"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"

import { returnService } from "../services"
import type { PurchaseReturn } from "../types"

export function useReturns() {
  const t = useTranslations("purchases.errors")
  const [returns, setReturns] = useState<PurchaseReturn[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setReturns(await returnService.list())
    } catch {
      setError(t("loadReturns"))
    } finally {
      setIsLoading(false)
    }
  }, [t])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { returns, isLoading, error, refetch }
}

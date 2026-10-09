"use client"

import { useCallback, useEffect, useState } from "react"

import { expenseService } from "../services"
import type { Expense } from "../types"

export function useExpenses() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setExpenses(await expenseService.list())
    } catch {
      setError("تعذر تحميل المصروفات. حاول مرة أخرى.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { expenses, isLoading, error, refetch }
}

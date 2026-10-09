"use client"

import { useCallback, useEffect, useState } from "react"

import { expenseCategoryService } from "../services"
import type { ExpenseCategory } from "../types"

export function useExpenseCategories() {
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setCategories(await expenseCategoryService.list())
    } catch {
      setError("تعذر تحميل فئات المصروفات. حاول مرة أخرى.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { categories, isLoading, error, refetch }
}

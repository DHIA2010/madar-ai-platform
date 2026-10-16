"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"

import { expenseCategoryService } from "../services"
import type { ExpenseCategory } from "../types"

export function useExpenseCategories() {
  const t = useTranslations("expenses")
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setCategories(await expenseCategoryService.list())
    } catch {
      setError(t("categoriesLoadError"))
    } finally {
      setIsLoading(false)
    }
  }, [t])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { categories, isLoading, error, refetch }
}

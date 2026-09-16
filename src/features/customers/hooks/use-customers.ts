"use client"

import { useCallback, useEffect, useState } from "react"

import { customerListService } from "../services"
import type { CustomerRecord } from "../types"

export function useCustomers() {
  const [records, setRecords] = useState<CustomerRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const items = await customerListService.listCustomers()
      setRecords(items)
    } catch (loadError) {
      console.error("Failed to load customers", loadError)
      setError("Couldn't load customers from your connected stores. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { records, isLoading, error, refetch: load }
}

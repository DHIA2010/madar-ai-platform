"use client"

import { useCallback, useEffect, useState } from "react"

import { customerListService } from "../services"
import type { CustomerDetail } from "../types"

export function useCustomer(customerId: string) {
  const [customer, setCustomer] = useState<CustomerDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const record = await customerListService.getCustomer(customerId)
      setCustomer(record)
    } catch (loadError) {
      console.error("Failed to load customer", loadError)
      setError("Couldn't load this customer. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }, [customerId])

  useEffect(() => {
    void load()
  }, [load])

  return { customer, isLoading, error, refetch: load }
}

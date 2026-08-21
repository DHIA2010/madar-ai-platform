"use client"

import { useEffect, useState } from "react"

import { customerListService } from "../services"
import type { CustomerDetail } from "../types"

export function useCustomer(customerId: string) {
  const [customer, setCustomer] = useState<CustomerDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setError(null)

      try {
        const record = await customerListService.getCustomer(customerId)
        if (!cancelled) {
          setCustomer(record)
        }
      } catch (loadError) {
        console.error("Failed to load customer", loadError)
        if (!cancelled) {
          setError("Couldn't load this customer. Please try again.")
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [customerId])

  return { customer, isLoading, error }
}

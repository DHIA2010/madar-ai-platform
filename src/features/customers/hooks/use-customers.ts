"use client"

import { useEffect, useState } from "react"

import { customerListService } from "../services"
import type { CustomerRecord } from "../types"

export function useCustomers() {
  const [records, setRecords] = useState<CustomerRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setError(null)

      try {
        const items = await customerListService.listCustomers()
        if (!cancelled) {
          setRecords(items)
        }
      } catch (loadError) {
        console.error("Failed to load customers", loadError)
        if (!cancelled) {
          setError("Couldn't load customers from your connected stores. Please try again.")
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
  }, [])

  return { records, isLoading, error }
}

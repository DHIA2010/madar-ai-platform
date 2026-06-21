"use client"

import { useCallback, useState } from "react"

import { customerListService } from "../services"
import type { CustomerNote } from "../types"

export function useCustomerActions(customerId: string, onMutated?: () => void) {
  const [isPending, setIsPending] = useState(false)

  const addNote = useCallback(
    async (content: string): Promise<CustomerNote> => {
      setIsPending(true)
      try {
        const note = customerListService.addNote(customerId, content)
        onMutated?.()
        return note
      } finally {
        setIsPending(false)
      }
    },
    [customerId, onMutated]
  )

  const addTag = useCallback(
    async (tag: string): Promise<string[]> => {
      setIsPending(true)
      try {
        const tags = customerListService.addTag(customerId, tag)
        onMutated?.()
        return tags
      } finally {
        setIsPending(false)
      }
    },
    [customerId, onMutated]
  )

  const removeTag = useCallback(
    async (tag: string): Promise<string[]> => {
      setIsPending(true)
      try {
        const tags = customerListService.removeTag(customerId, tag)
        onMutated?.()
        return tags
      } finally {
        setIsPending(false)
      }
    },
    [customerId, onMutated]
  )

  const archiveCustomer = useCallback(async () => {
    setIsPending(true)
    try {
      const result = customerListService.archiveCustomer(customerId)
      onMutated?.()
      return result
    } finally {
      setIsPending(false)
    }
  }, [customerId, onMutated])

  return {
    isPending,
    addNote,
    addTag,
    removeTag,
    archiveCustomer,
  }
}

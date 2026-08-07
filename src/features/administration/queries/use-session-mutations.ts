"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { toAppError } from "@/lib/app-errors"

import { administrationQueryKeys } from "./administration-query-keys"

import { useApplicationServices } from "@/application"

export function useSessionMutations() {
  const queryClient = useQueryClient()
  const { administrationApplicationService } = useApplicationServices()

  const revokeSession = useMutation({
    mutationKey: ["administration", "sessions", "revoke"],
    mutationFn: async (sessionId: string) => {
      try {
        return await administrationApplicationService.revokeSession({ sessionId })
      } catch (error) {
        throw toAppError(error)
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: administrationQueryKeys.sessions() })
    },
  })

  return { revokeSession }
}

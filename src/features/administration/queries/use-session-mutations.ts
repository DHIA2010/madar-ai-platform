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
      // Covers both the caller's own sessions() key and the org-wide organizationSessions() key
      // -- both are nested under this same namespace.
      await queryClient.invalidateQueries({ queryKey: administrationQueryKeys.all })
    },
  })

  return { revokeSession }
}

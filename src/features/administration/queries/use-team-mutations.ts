"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { toAppError } from "@/lib/app-errors"

import { administrationQueryKeys } from "./administration-query-keys"

import { useApplicationServices } from "@/application"
import type { CreateTeamRequestDto } from "@/application/contracts"

export function useTeamMutations(organizationId: string | null | undefined) {
  const queryClient = useQueryClient()
  const { administrationApplicationService } = useApplicationServices()

  const createTeam = useMutation({
    mutationKey: ["administration", "teams", "create"],
    mutationFn: async (request: CreateTeamRequestDto) => {
      try {
        return await administrationApplicationService.createTeam(request)
      } catch (error) {
        throw toAppError(error)
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: administrationQueryKeys.teams(organizationId),
      })
    },
  })

  return { createTeam }
}

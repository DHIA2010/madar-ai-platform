"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { toAppError } from "@/lib/app-errors"

import { administrationQueryKeys } from "./administration-query-keys"

import { useApplicationServices } from "@/application"
import type { ReactivateMemberRequestDto, SuspendMemberRequestDto } from "@/application/contracts"

export function useUserMutations(organizationId: string | null | undefined) {
  const queryClient = useQueryClient()
  const { administrationApplicationService } = useApplicationServices()

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: administrationQueryKeys.users(organizationId) })

  const suspendUser = useMutation({
    mutationKey: ["administration", "users", "suspend"],
    mutationFn: async (request: SuspendMemberRequestDto) => {
      try {
        return await administrationApplicationService.suspendMember(request)
      } catch (error) {
        throw toAppError(error)
      }
    },
    onSuccess: invalidate,
  })

  const reactivateUser = useMutation({
    mutationKey: ["administration", "users", "reactivate"],
    mutationFn: async (request: ReactivateMemberRequestDto) => {
      try {
        return await administrationApplicationService.reactivateMember(request)
      } catch (error) {
        throw toAppError(error)
      }
    },
    onSuccess: invalidate,
  })

  return { suspendUser, reactivateUser }
}

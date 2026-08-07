"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { toAppError } from "@/lib/app-errors"

import { administrationQueryKeys } from "./administration-query-keys"

import { useApplicationServices } from "@/application"
import type { SendInvitationRequestDto } from "@/application/contracts"

export function useInvitationMutations(organizationId: string | null | undefined) {
  const queryClient = useQueryClient()
  const { administrationApplicationService } = useApplicationServices()

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: administrationQueryKeys.invitations(organizationId) })

  const sendInvitation = useMutation({
    mutationKey: ["administration", "invitations", "send"],
    mutationFn: async (request: SendInvitationRequestDto) => {
      try {
        return await administrationApplicationService.sendInvitation(request)
      } catch (error) {
        throw toAppError(error)
      }
    },
    onSuccess: invalidate,
  })

  const cancelInvitation = useMutation({
    mutationKey: ["administration", "invitations", "cancel"],
    mutationFn: async (invitationId: string) => {
      try {
        return await administrationApplicationService.cancelInvitation({ invitationId })
      } catch (error) {
        throw toAppError(error)
      }
    },
    onSuccess: invalidate,
  })

  const resendInvitation = useMutation({
    mutationKey: ["administration", "invitations", "resend"],
    mutationFn: async (invitationId: string) => {
      try {
        return await administrationApplicationService.resendInvitation({ invitationId })
      } catch (error) {
        throw toAppError(error)
      }
    },
    onSuccess: invalidate,
  })

  return { sendInvitation, cancelInvitation, resendInvitation }
}

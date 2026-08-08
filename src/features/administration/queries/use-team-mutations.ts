"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { toAppError } from "@/lib/app-errors"

import { administrationQueryKeys } from "./administration-query-keys"

import { useApplicationServices } from "@/application"
import type {
  AddTeamMemberRequestDto,
  CreateTeamRequestDto,
  DeleteTeamRequestDto,
  RemoveTeamMemberRequestDto,
  UpdateTeamRequestDto,
} from "@/application/contracts"

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

  const addTeamMember = useMutation({
    mutationKey: ["administration", "teams", "add-member"],
    mutationFn: async (request: AddTeamMemberRequestDto) => {
      try {
        return await administrationApplicationService.addTeamMember(request)
      } catch (error) {
        throw toAppError(error)
      }
    },
    onSuccess: async (_result, request) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: administrationQueryKeys.teamMembers(request.teamId),
        }),
        queryClient.invalidateQueries({
          queryKey: administrationQueryKeys.teams(organizationId),
        }),
      ])
    },
  })

  const removeTeamMember = useMutation({
    mutationKey: ["administration", "teams", "remove-member"],
    mutationFn: async (request: RemoveTeamMemberRequestDto) => {
      try {
        return await administrationApplicationService.removeTeamMember(request)
      } catch (error) {
        throw toAppError(error)
      }
    },
    onSuccess: async (_result, request) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: administrationQueryKeys.teamMembers(request.teamId),
        }),
        queryClient.invalidateQueries({
          queryKey: administrationQueryKeys.teams(organizationId),
        }),
      ])
    },
  })

  const updateTeam = useMutation({
    mutationKey: ["administration", "teams", "update"],
    mutationFn: async (request: UpdateTeamRequestDto) => {
      try {
        return await administrationApplicationService.updateTeam(request)
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

  const deleteTeam = useMutation({
    mutationKey: ["administration", "teams", "delete"],
    mutationFn: async (request: DeleteTeamRequestDto) => {
      try {
        return await administrationApplicationService.deleteTeam(request)
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

  return { createTeam, addTeamMember, removeTeamMember, updateTeam, deleteTeam }
}

"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { toAppError } from "@/lib/app-errors"

import { administrationQueryKeys } from "./administration-query-keys"

import { useApplicationServices } from "@/application"
import type {
  CreateCustomRoleRequestDto,
  DeleteCustomRoleRequestDto,
  UpdateCustomRoleRequestDto,
} from "@/application/contracts"

export function useRoleMutations(organizationId: string | null | undefined) {
  const queryClient = useQueryClient()
  const { administrationApplicationService } = useApplicationServices()

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: administrationQueryKeys.roles(organizationId) })

  const createRole = useMutation({
    mutationKey: ["administration", "roles", "create"],
    mutationFn: async (request: CreateCustomRoleRequestDto) => {
      try {
        return await administrationApplicationService.createCustomRole(request)
      } catch (error) {
        throw toAppError(error)
      }
    },
    onSuccess: invalidate,
  })

  const updateRole = useMutation({
    mutationKey: ["administration", "roles", "update"],
    mutationFn: async (request: UpdateCustomRoleRequestDto) => {
      try {
        return await administrationApplicationService.updateCustomRole(request)
      } catch (error) {
        throw toAppError(error)
      }
    },
    onSuccess: invalidate,
  })

  const deleteRole = useMutation({
    mutationKey: ["administration", "roles", "delete"],
    mutationFn: async (request: DeleteCustomRoleRequestDto) => {
      try {
        return await administrationApplicationService.deleteCustomRole(request)
      } catch (error) {
        throw toAppError(error)
      }
    },
    onSuccess: invalidate,
  })

  return { createRole, updateRole, deleteRole }
}

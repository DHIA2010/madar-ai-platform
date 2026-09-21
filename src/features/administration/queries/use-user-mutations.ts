"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { toAppError } from "@/lib/app-errors"

import { administrationQueryKeys } from "./administration-query-keys"

import { useApplicationServices } from "@/application"
import type {
  AssignMemberCustomRoleRequestDto,
  AssignMemberRoleRequestDto,
  AssignUserWorkspacesRequestDto,
  ReactivateMemberRequestDto,
  SendMemberPasswordResetRequestDto,
  SetMemberModuleAccessRequestDto,
  SuspendMemberRequestDto,
  UpdateMemberIdentityRequestDto,
  UpdateMemberProfileRequestDto,
  UploadMemberAvatarRequestDto,
} from "@/application/contracts"

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

  const assignRole = useMutation({
    mutationKey: ["administration", "users", "assign-role"],
    mutationFn: async (request: AssignMemberRoleRequestDto) => {
      try {
        return await administrationApplicationService.assignMemberRole(request)
      } catch (error) {
        throw toAppError(error)
      }
    },
    onSuccess: invalidate,
  })

  const assignCustomRole = useMutation({
    mutationKey: ["administration", "users", "assign-custom-role"],
    mutationFn: async (request: AssignMemberCustomRoleRequestDto) => {
      try {
        return await administrationApplicationService.assignMemberCustomRole(request)
      } catch (error) {
        throw toAppError(error)
      }
    },
    onSuccess: invalidate,
  })

  const setModuleAccess = useMutation({
    mutationKey: ["administration", "users", "set-module-access"],
    mutationFn: async (request: SetMemberModuleAccessRequestDto) => {
      try {
        return await administrationApplicationService.setMemberModuleAccess(request)
      } catch (error) {
        throw toAppError(error)
      }
    },
    onSuccess: invalidate,
  })

  const updateProfile = useMutation({
    mutationKey: ["administration", "users", "update-profile"],
    mutationFn: async (request: UpdateMemberProfileRequestDto) => {
      try {
        return await administrationApplicationService.updateMemberProfile(request)
      } catch (error) {
        throw toAppError(error)
      }
    },
    onSuccess: invalidate,
  })

  const updateIdentity = useMutation({
    mutationKey: ["administration", "users", "update-identity"],
    mutationFn: async (request: UpdateMemberIdentityRequestDto) => {
      try {
        return await administrationApplicationService.updateMemberIdentity(request)
      } catch (error) {
        throw toAppError(error)
      }
    },
    onSuccess: invalidate,
  })

  const uploadAvatar = useMutation({
    mutationKey: ["administration", "users", "upload-avatar"],
    mutationFn: async (request: UploadMemberAvatarRequestDto) => {
      try {
        return await administrationApplicationService.uploadMemberAvatar(request)
      } catch (error) {
        throw toAppError(error)
      }
    },
    onSuccess: invalidate,
  })

  const sendPasswordReset = useMutation({
    mutationKey: ["administration", "users", "send-password-reset"],
    mutationFn: async (request: SendMemberPasswordResetRequestDto) => {
      try {
        return await administrationApplicationService.sendMemberPasswordReset(request)
      } catch (error) {
        throw toAppError(error)
      }
    },
  })

  const assignWorkspaces = useMutation({
    mutationKey: ["administration", "users", "assign-workspaces"],
    mutationFn: async (request: AssignUserWorkspacesRequestDto) => {
      try {
        return await administrationApplicationService.assignUserWorkspaces(request)
      } catch (error) {
        throw toAppError(error)
      }
    },
    onSuccess: invalidate,
  })

  return {
    suspendUser,
    reactivateUser,
    assignRole,
    assignCustomRole,
    setModuleAccess,
    updateProfile,
    updateIdentity,
    uploadAvatar,
    sendPasswordReset,
    assignWorkspaces,
  }
}

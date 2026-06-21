"use client"

import { useMemo } from "react"

import { type AppError, toAppError } from "@/lib/app-errors"
import { failure, success } from "@/lib/result"

import type { ForgotPasswordRequest, ResetPasswordRequest, VerifyEmailRequest } from "../types"

import { useApplicationServices } from "@/application"

interface RecoveryCommands {
  forgotPassword: (
    payload: ForgotPasswordRequest
  ) => Promise<{ success: true; data: null } | { success: false; error: AppError }>
  resetPassword: (
    payload: ResetPasswordRequest
  ) => Promise<{ success: true; data: null } | { success: false; error: AppError }>
  verifyEmail: (
    payload: VerifyEmailRequest
  ) => Promise<{ success: true; data: null } | { success: false; error: AppError }>
}

export function useAuthRecovery() {
  const { authenticationApplicationService } = useApplicationServices()

  return useMemo<RecoveryCommands>(
    () => ({
      forgotPassword: async (payload) => {
        try {
          await authenticationApplicationService.forgotPassword(payload)
          return success(null)
        } catch (error) {
          return failure(toAppError(error))
        }
      },
      resetPassword: async (payload) => {
        try {
          await authenticationApplicationService.resetPassword(payload)
          return success(null)
        } catch (error) {
          return failure(toAppError(error))
        }
      },
      verifyEmail: async (payload) => {
        try {
          await authenticationApplicationService.verifyEmail(payload)
          return success(null)
        } catch (error) {
          return failure(toAppError(error))
        }
      },
    }),
    [authenticationApplicationService]
  )
}

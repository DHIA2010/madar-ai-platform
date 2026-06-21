import { type AppError, toAppError } from "@/lib/app-errors"
import { failure, type Result, success } from "@/lib/result"

import type {
  AuthenticationService,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  VerifyEmailRequest,
} from "../types"

interface RecoveryCommands {
  forgotPassword: (payload: ForgotPasswordRequest) => Promise<Result<null, AppError>>
  resetPassword: (payload: ResetPasswordRequest) => Promise<Result<null, AppError>>
  verifyEmail: (payload: VerifyEmailRequest) => Promise<Result<null, AppError>>
}

export function createRecoveryCommands(service: AuthenticationService): RecoveryCommands {
  return {
    forgotPassword: async (payload) => {
      try {
        await service.forgotPassword(payload)
        return success(null)
      } catch (error) {
        return failure(toAppError(error))
      }
    },

    resetPassword: async (payload) => {
      try {
        await service.resetPassword(payload)
        return success(null)
      } catch (error) {
        return failure(toAppError(error))
      }
    },

    verifyEmail: async (payload) => {
      try {
        await service.verifyEmail(payload)
        return success(null)
      } catch (error) {
        return failure(toAppError(error))
      }
    },
  }
}

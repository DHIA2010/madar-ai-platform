import { type AppError, toAppError } from "@/lib/app-errors"
import { failure, type Result, success } from "@/lib/result"

import type {
  AuthenticationService,
  AuthenticationSessionManager,
  CurrentUser,
  LoginRequest,
  LoginResponse,
  Session,
} from "../types"

interface AuthCommands {
  login: (payload: LoginRequest) => Promise<Result<LoginResponse, AppError>>
  logout: (session: Session | null) => Promise<Result<null, AppError>>
  currentUser: (session: Session | null) => Promise<Result<CurrentUser, AppError>>
}

export function createAuthCommands(
  service: AuthenticationService,
  sessionManager: AuthenticationSessionManager
): AuthCommands {
  return {
    login: async (payload) => {
      try {
        const response = await service.login(payload)
        sessionManager.persist(response.session)
        return success(response)
      } catch (error) {
        return failure(toAppError(error))
      }
    },

    logout: async (session) => {
      try {
        await service.logout(session)
        sessionManager.clear()
        return success(null)
      } catch (error) {
        return failure(toAppError(error))
      }
    },

    currentUser: async (session) => {
      try {
        const response = await service.currentUser(session)
        return success(response)
      } catch (error) {
        return failure(toAppError(error))
      }
    },
  }
}

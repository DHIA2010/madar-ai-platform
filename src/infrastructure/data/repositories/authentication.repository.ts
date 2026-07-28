import type { AuthenticationRepository } from "@/application/contracts/infrastructure.contracts"
import type {
  AuthSessionDto,
  CurrentUserDto,
  ForgotPasswordRequestDto,
  LoginRequestDto,
  LoginResponseDto,
  RefreshSessionRequestDto,
  ResetPasswordRequestDto,
  VerifyEmailRequestDto,
} from "@/application/contracts/authentication.contracts"

import { MockAuthenticationGateway } from "@/infrastructure/mock/mock-authentication.gateway"

import { createHttpDataClient } from "../api/http-data-client"
import { AuthenticationApiAdapter } from "../adapters/authentication-api.adapter"
import { mapAuthenticationRepositoryError } from "../errors"
import { resolveAuthenticationApiBaseUrl, resolveAuthenticationBackend } from "./repository-runtime"

export class DataAuthenticationRepository implements AuthenticationRepository {
  private readonly adapter: AuthenticationApiAdapter
  private readonly fallback = new MockAuthenticationGateway()

  constructor(options?: {
    getSession?: () => AuthSessionDto | null
    getWorkspaceId?: () => string | null
  }) {
    this.adapter = new AuthenticationApiAdapter(
      createHttpDataClient({
        ...options,
        baseUrl: resolveAuthenticationApiBaseUrl(),
      })
    )
  }

  async login(payload: LoginRequestDto): Promise<LoginResponseDto> {
    try {
      const backend = resolveAuthenticationBackend()
      if (backend === "mock") {
        return this.fallback.login(payload)
      }

      return await this.adapter.login(payload)
    } catch (error) {
      throw mapAuthenticationRepositoryError(error)
    }
  }

  async logout(session: AuthSessionDto | null): Promise<void> {
    try {
      const backend = resolveAuthenticationBackend()
      if (backend === "mock") {
        await this.fallback.logout(session)
        return
      }

      await this.adapter.logout(session)
    } catch (error) {
      throw mapAuthenticationRepositoryError(error)
    }
  }

  async currentUser(session: AuthSessionDto | null): Promise<CurrentUserDto> {
    try {
      const backend = resolveAuthenticationBackend()
      if (backend === "mock") {
        return this.fallback.currentUser(session)
      }

      return await this.adapter.currentUser(session)
    } catch (error) {
      throw mapAuthenticationRepositoryError(error)
    }
  }

  async refreshSession(payload: RefreshSessionRequestDto): Promise<AuthSessionDto> {
    try {
      const backend = resolveAuthenticationBackend()
      if (backend === "mock") {
        return this.fallback.refreshSession(payload)
      }

      return await this.adapter.refreshSession(payload)
    } catch (error) {
      throw mapAuthenticationRepositoryError(error)
    }
  }

  async forgotPassword(payload: ForgotPasswordRequestDto): Promise<void> {
    try {
      const backend = resolveAuthenticationBackend()
      if (backend === "mock") {
        await this.fallback.forgotPassword(payload)
        return
      }

      await this.adapter.forgotPassword(payload)
    } catch (error) {
      throw mapAuthenticationRepositoryError(error)
    }
  }

  async resetPassword(payload: ResetPasswordRequestDto): Promise<void> {
    try {
      const backend = resolveAuthenticationBackend()
      if (backend === "mock") {
        await this.fallback.resetPassword(payload)
        return
      }

      await this.adapter.resetPassword(payload)
    } catch (error) {
      throw mapAuthenticationRepositoryError(error)
    }
  }

  async verifyEmail(payload: VerifyEmailRequestDto): Promise<void> {
    try {
      const backend = resolveAuthenticationBackend()
      if (backend === "mock") {
        await this.fallback.verifyEmail(payload)
        return
      }

      await this.adapter.verifyEmail(payload)
    } catch (error) {
      throw mapAuthenticationRepositoryError(error)
    }
  }
}

export function createAuthenticationRepository(options?: {
  getSession?: () => AuthSessionDto | null
  getWorkspaceId?: () => string | null
}): AuthenticationRepository {
  return new DataAuthenticationRepository(options)
}

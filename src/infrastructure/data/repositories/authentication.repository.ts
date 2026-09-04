import type { AuthenticationRepository } from "@/application/contracts/infrastructure.contracts"
import type {
  AcceptInvitationResponseDto,
  AuthSessionDto,
  AuthUserDto,
  ChangePasswordRequestDto,
  ClaimZidMarketplaceInstallResponseDto,
  ZidMarketplaceInstallSummaryDto,
  CurrentUserDto,
  ForgotPasswordRequestDto,
  LoginRequestDto,
  LoginResponseDto,
  RefreshSessionRequestDto,
  RegisterRequestDto,
  ResetPasswordRequestDto,
  UpdateProfileRequestDto,
  UploadAvatarRequestDto,
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

  async register(payload: RegisterRequestDto): Promise<LoginResponseDto> {
    try {
      const backend = resolveAuthenticationBackend()
      if (backend === "mock") {
        return this.fallback.register(payload)
      }

      return await this.adapter.register(payload)
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

  async acceptInvitation(token: string): Promise<AcceptInvitationResponseDto> {
    try {
      const backend = resolveAuthenticationBackend()
      if (backend === "mock") {
        return this.fallback.acceptInvitation(token)
      }

      return await this.adapter.acceptInvitation(token)
    } catch (error) {
      throw mapAuthenticationRepositoryError(error)
    }
  }

  async claimZidMarketplaceInstall(
    claimToken: string
  ): Promise<ClaimZidMarketplaceInstallResponseDto> {
    try {
      const backend = resolveAuthenticationBackend()
      if (backend === "mock") {
        return this.fallback.claimZidMarketplaceInstall(claimToken)
      }

      return await this.adapter.claimZidMarketplaceInstall(claimToken)
    } catch (error) {
      throw mapAuthenticationRepositoryError(error)
    }
  }

  async getZidMarketplaceInstallSummary(
    claimToken: string
  ): Promise<ZidMarketplaceInstallSummaryDto> {
    try {
      const backend = resolveAuthenticationBackend()
      if (backend === "mock") {
        return this.fallback.getZidMarketplaceInstallSummary(claimToken)
      }

      return await this.adapter.getZidMarketplaceInstallSummary(claimToken)
    } catch (error) {
      throw mapAuthenticationRepositoryError(error)
    }
  }

  async updateProfile(payload: UpdateProfileRequestDto): Promise<AuthUserDto> {
    try {
      const backend = resolveAuthenticationBackend()
      if (backend === "mock") {
        return this.fallback.updateProfile(payload)
      }

      return await this.adapter.updateProfile(payload)
    } catch (error) {
      throw mapAuthenticationRepositoryError(error)
    }
  }

  async uploadAvatar(payload: UploadAvatarRequestDto): Promise<AuthUserDto> {
    try {
      const backend = resolveAuthenticationBackend()
      if (backend === "mock") {
        return this.fallback.uploadAvatar(payload)
      }

      return await this.adapter.uploadAvatar(payload)
    } catch (error) {
      throw mapAuthenticationRepositoryError(error)
    }
  }

  async removeAvatar(): Promise<AuthUserDto> {
    try {
      const backend = resolveAuthenticationBackend()
      if (backend === "mock") {
        return this.fallback.removeAvatar()
      }

      return await this.adapter.removeAvatar()
    } catch (error) {
      throw mapAuthenticationRepositoryError(error)
    }
  }

  async changePassword(payload: ChangePasswordRequestDto): Promise<void> {
    try {
      const backend = resolveAuthenticationBackend()
      if (backend === "mock") {
        return this.fallback.changePassword(payload)
      }

      return await this.adapter.changePassword(payload)
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

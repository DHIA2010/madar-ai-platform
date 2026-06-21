import { AuthorizationError, ValidationError } from "@/lib/app-errors"
import type {
  AuthSessionDto,
  AuthUserDto,
  CurrentUserDto,
  ForgotPasswordRequestDto,
  LoginRequestDto,
  LoginResponseDto,
  ResetPasswordRequestDto,
  VerifyEmailRequestDto,
} from "@/application/contracts/authentication.contracts"
import type { AuthenticationGateway } from "@/application/contracts/infrastructure.contracts"

const MOCK_USER: AuthUserDto = {
  id: "user_001",
  email: "demo@madar.ai",
  fullName: "MADAR Demo User",
  emailVerified: true,
  roles: [
    {
      id: "role_admin",
      name: "Admin",
      permissions: ["dashboard:view", "campaigns:manage", "customers:manage"],
    },
  ],
  permissions: ["dashboard:view", "campaigns:manage", "customers:manage"],
}

function createSession(rememberMe?: boolean): AuthSessionDto {
  const now = Date.now()

  return {
    issuedAt: new Date(now).toISOString(),
    rememberMe,
    strategy: "storage",
    accessToken: {
      token: `mock-access-${now}`,
      tokenType: "Bearer",
      expiresAt: new Date(now + 1000 * 60 * 15).toISOString(),
    },
    refreshToken: {
      token: `mock-refresh-${now}`,
      expiresAt: new Date(now + 1000 * 60 * 60 * 24 * 30).toISOString(),
    },
  }
}

export class MockAuthenticationGateway implements AuthenticationGateway {
  async login(payload: LoginRequestDto): Promise<LoginResponseDto> {
    if (!payload.email || !payload.password) {
      throw new ValidationError({
        code: "auth_invalid_request",
        message: "Email and password are required.",
      })
    }

    if (payload.password.length < 8) {
      throw new ValidationError({
        code: "auth_weak_password",
        message: "Password must be at least 8 characters long.",
      })
    }

    return {
      user: MOCK_USER,
      session: createSession(payload.rememberMe),
    }
  }

  async logout(_session: AuthSessionDto | null): Promise<void> {
    return
  }

  async currentUser(session: AuthSessionDto | null): Promise<CurrentUserDto> {
    if (!session?.accessToken.token) {
      throw new AuthorizationError({
        code: "auth_session_missing",
        message: "No active session found.",
      })
    }

    return { user: MOCK_USER }
  }

  async forgotPassword(payload: ForgotPasswordRequestDto): Promise<void> {
    if (!payload.email) {
      throw new ValidationError({
        code: "auth_email_required",
        message: "Email is required.",
      })
    }
  }

  async resetPassword(payload: ResetPasswordRequestDto): Promise<void> {
    if (!payload.token || !payload.password || !payload.confirmPassword) {
      throw new ValidationError({
        code: "auth_reset_invalid_request",
        message: "Reset password request is invalid.",
      })
    }
  }

  async verifyEmail(payload: VerifyEmailRequestDto): Promise<void> {
    if (!payload.token) {
      throw new ValidationError({
        code: "auth_verify_token_required",
        message: "Verification token is required.",
      })
    }
  }
}

export function createMockAuthenticationGateway(): AuthenticationGateway {
  return new MockAuthenticationGateway()
}

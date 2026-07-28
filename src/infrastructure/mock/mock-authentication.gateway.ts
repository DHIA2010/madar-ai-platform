import { AuthorizationError, ValidationError } from "@/lib/app-errors"
import type {
  AuthSessionDto,
  AuthUserDto,
  CurrentUserDto,
  ForgotPasswordRequestDto,
  LoginRequestDto,
  LoginResponseDto,
  RefreshSessionRequestDto,
  ResetPasswordRequestDto,
  VerifyEmailRequestDto,
} from "@/application/contracts/authentication.contracts"
import type { AuthenticationGateway } from "@/application/contracts/infrastructure.contracts"

function createMockUser(email: string): AuthUserDto {
  const normalizedEmail = email.trim().toLowerCase()
  const inferredName = normalizedEmail
    .split("@")[0]
    ?.replace(/[._-]+/g, " ")
    .trim()

  return {
    id: `mock_user_${normalizedEmail || "anonymous"}`,
    email: normalizedEmail,
    fullName: inferredName
      ? inferredName.replace(/\b\w/g, (char) => char.toUpperCase())
      : "MADAR User",
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
}

function encodeTokenValue(value: string) {
  if (typeof btoa !== "function") {
    return ""
  }

  return btoa(value)
}

function decodeTokenValue(value: string) {
  try {
    if (typeof atob !== "function") {
      return ""
    }

    return atob(value)
  } catch {
    return ""
  }
}

function createSession(user: AuthUserDto, rememberMe?: boolean): AuthSessionDto {
  const now = Date.now()
  const encodedEmail = encodeTokenValue(user.email)

  return {
    issuedAt: new Date(now).toISOString(),
    rememberMe,
    strategy: "storage",
    accessToken: {
      token: `mock-access-${user.id}-${encodedEmail}-${now}`,
      tokenType: "Bearer",
      expiresAt: new Date(now + 1000 * 60 * 15).toISOString(),
    },
    refreshToken: {
      token: `mock-refresh-${user.id}-${encodedEmail}-${now}`,
      expiresAt: new Date(now + 1000 * 60 * 60 * 24 * 30).toISOString(),
    },
  }
}

function createUserFromToken(token: string): AuthUserDto | null {
  const [, , userId, encodedEmail] = token.split("-")
  if (!userId || !encodedEmail) {
    return null
  }

  const email = decodeTokenValue(encodedEmail)
  if (!email) {
    return null
  }

  return createMockUser(email)
}

export class MockAuthenticationGateway implements AuthenticationGateway {
  private readonly sessionsByRefreshToken = new Map<
    string,
    { session: AuthSessionDto; user: AuthUserDto }
  >()

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

    const user = createMockUser(payload.email)
    const session = createSession(user, payload.rememberMe)
    this.sessionsByRefreshToken.set(session.refreshToken.token, { session, user })

    return {
      user,
      session,
    }
  }

  async logout(session: AuthSessionDto | null): Promise<void> {
    if (session?.refreshToken?.token) {
      this.sessionsByRefreshToken.delete(session.refreshToken.token)
    }

    return
  }

  async currentUser(session: AuthSessionDto | null): Promise<CurrentUserDto> {
    if (!session?.accessToken.token) {
      throw new AuthorizationError({
        code: "auth_session_missing",
        message: "No active session found.",
      })
    }

    const active = this.sessionsByRefreshToken.get(session.refreshToken.token)
    if (active) {
      return { user: active.user }
    }

    const userFromToken = createUserFromToken(session.refreshToken.token)
    if (!userFromToken) {
      throw new AuthorizationError({
        code: "auth_session_expired",
        message: "Session is no longer active.",
      })
    }

    this.sessionsByRefreshToken.set(session.refreshToken.token, {
      session,
      user: userFromToken,
    })

    return { user: userFromToken }
  }

  async refreshSession(payload: RefreshSessionRequestDto): Promise<AuthSessionDto> {
    const active = this.sessionsByRefreshToken.get(payload.refreshToken)
    if (!active) {
      throw new AuthorizationError({
        code: "auth_refresh_invalid",
        message: "Refresh token is invalid or expired.",
      })
    }

    this.sessionsByRefreshToken.delete(payload.refreshToken)
    const refreshed = createSession(active.user, active.session.rememberMe)
    this.sessionsByRefreshToken.set(refreshed.refreshToken.token, {
      session: refreshed,
      user: active.user,
    })

    return refreshed
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

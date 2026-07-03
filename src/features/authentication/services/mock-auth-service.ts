import { AuthorizationError } from "@/lib/app-errors"

import type {
  AuthenticationService,
  CurrentUser,
  ForgotPasswordRequest,
  LoginRequest,
  LoginResponse,
  RefreshToken,
  ResetPasswordRequest,
  Session,
  VerifyEmailRequest,
} from "../types"

function createMockUser(email: string) {
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

function createSession(user: ReturnType<typeof createMockUser>, rememberMe?: boolean): Session {
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

function createUserFromToken(token: string) {
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

export class MockAuthService implements AuthenticationService {
  private readonly sessionsByRefreshToken = new Map<
    string,
    { session: Session; user: ReturnType<typeof createMockUser> }
  >()

  async login(payload: LoginRequest): Promise<LoginResponse> {
    if (!payload.email || !payload.password) {
      throw new AuthorizationError({
        code: "auth_invalid_request",
        message: "Email and password are required.",
      })
    }

    const user = createMockUser(payload.email)
    const session = createSession(user, payload.rememberMe)
    this.sessionsByRefreshToken.set(session.refreshToken.token, { session, user })
    return { user, session }
  }

  async logout(session: Session | null): Promise<void> {
    if (session?.refreshToken?.token) {
      this.sessionsByRefreshToken.delete(session.refreshToken.token)
    }
  }

  async refresh(refreshToken: RefreshToken): Promise<Session> {
    if (!refreshToken.token) {
      throw new AuthorizationError({
        code: "auth_refresh_token_missing",
        message: "Refresh token is required.",
      })
    }

    const active = this.sessionsByRefreshToken.get(refreshToken.token)
    if (!active) {
      throw new AuthorizationError({
        code: "auth_refresh_invalid",
        message: "Refresh token is invalid or expired.",
      })
    }

    this.sessionsByRefreshToken.delete(refreshToken.token)
    const refreshed = createSession(active.user, active.session.rememberMe)
    this.sessionsByRefreshToken.set(refreshed.refreshToken.token, {
      session: refreshed,
      user: active.user,
    })

    return refreshed
  }

  async currentUser(session: Session | null): Promise<CurrentUser> {
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

  async forgotPassword(payload: ForgotPasswordRequest): Promise<void> {
    if (!payload.email) {
      throw new AuthorizationError({
        code: "auth_email_required",
        message: "Email is required.",
      })
    }
  }

  async resetPassword(payload: ResetPasswordRequest): Promise<void> {
    if (!payload.token || !payload.password || !payload.confirmPassword) {
      throw new AuthorizationError({
        code: "auth_reset_invalid_request",
        message: "Reset password request is invalid.",
      })
    }
  }

  async verifyEmail(payload: VerifyEmailRequest): Promise<void> {
    if (!payload.token) {
      throw new AuthorizationError({
        code: "auth_verify_token_required",
        message: "Verification token is required.",
      })
    }
  }
}

export function createMockAuthService(): AuthenticationService {
  return new MockAuthService()
}

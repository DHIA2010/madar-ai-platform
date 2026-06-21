import { AuthorizationError } from "@/lib/app-errors"

import type { AuthenticationService, RefreshToken, Session } from "../types"

import { MockAuthenticationGateway } from "@/infrastructure"

function createSession(rememberMe?: boolean): Session {
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

export class MockAuthService extends MockAuthenticationGateway implements AuthenticationService {
  async refresh(refreshToken: RefreshToken): Promise<Session> {
    if (!refreshToken.token) {
      throw new AuthorizationError({
        code: "auth_refresh_token_missing",
        message: "Refresh token is required.",
      })
    }

    return createSession(true)
  }
}

export function createMockAuthService(): AuthenticationService {
  return new MockAuthService()
}

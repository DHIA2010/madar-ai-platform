import type { AuthSessionDto } from "@/application/contracts/authentication.contracts"
import type { SessionStorageGateway } from "@/application/contracts/infrastructure.contracts"
import { AuthenticationApiAdapter } from "@/infrastructure/data/adapters/authentication-api.adapter"
import { createApiClient } from "@/infrastructure/http"

import { createStorageAdapter, type KeyValueStorage } from "../storage"

const SESSION_STORAGE_KEY = "madar.auth.session"

// Module-level (not per-instance) so every SessionManager -- and every feature service creates
// its own -- shares one in-flight refresh. Without this, several requests hitting a stale
// access token at once (e.g. the Promise.all in campaign-dashboard-screen.tsx) would each kick
// off their own POST /v1/auth/refresh, racing to rotate the same refresh token.
let sharedRefreshInFlight: Promise<AuthSessionDto | null> | null = null

function isTimestampExpired(value: string | undefined): boolean {
  if (!value) {
    return true
  }

  const expiresAt = Date.parse(value)
  if (Number.isNaN(expiresAt)) {
    return true
  }

  return expiresAt <= Date.now()
}

export class SessionManager implements SessionStorageGateway {
  constructor(
    private readonly storageKey = SESSION_STORAGE_KEY,
    private readonly storage: KeyValueStorage = createStorageAdapter("local")
  ) {}

  persist(session: AuthSessionDto): void {
    this.storage.setItem(this.storageKey, JSON.stringify(session))
  }

  restore(): AuthSessionDto | null {
    const raw = this.storage.getItem(this.storageKey)
    if (!raw) {
      return null
    }

    try {
      const parsed = JSON.parse(raw) as AuthSessionDto
      if (this.isRefreshTokenExpired(parsed)) {
        this.clear()
        return null
      }

      return parsed
    } catch {
      this.clear()
      return null
    }
  }

  clear(): void {
    this.storage.removeItem(this.storageKey)
  }

  isExpired(session: AuthSessionDto | null): boolean {
    return this.isAccessTokenExpired(session) || this.isRefreshTokenExpired(session)
  }

  isAccessTokenExpired(session: AuthSessionDto | null): boolean {
    if (!session) {
      return true
    }

    return isTimestampExpired(session.accessToken.expiresAt)
  }

  isRefreshTokenExpired(session: AuthSessionDto | null): boolean {
    if (!session) {
      return true
    }

    return isTimestampExpired(session.refreshToken.expiresAt)
  }

  // Called reactively when a request comes back 401 with a stale access token (see
  // http-data-client.ts's onUnauthorized wiring) -- exchanges the refresh token for a new
  // session and persists it. Returns null (and clears storage) when there's no session to
  // refresh or the refresh token itself is no longer accepted, which the caller treats as "give
  // up, surface the original 401" rather than retrying forever.
  async refreshAccessToken(): Promise<AuthSessionDto | null> {
    if (sharedRefreshInFlight) {
      return sharedRefreshInFlight
    }

    sharedRefreshInFlight = this.performRefresh().finally(() => {
      sharedRefreshInFlight = null
    })

    return sharedRefreshInFlight
  }

  private async performRefresh(): Promise<AuthSessionDto | null> {
    const session = this.restore()
    if (!session) {
      return null
    }

    try {
      const adapter = new AuthenticationApiAdapter(createApiClient())
      const refreshed = await adapter.refreshSession({ refreshToken: session.refreshToken.token })
      this.persist(refreshed)
      return refreshed
    } catch {
      this.clear()
      return null
    }
  }
}

export function createSessionManager(): SessionManager {
  return new SessionManager()
}

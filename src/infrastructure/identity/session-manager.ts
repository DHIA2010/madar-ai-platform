import type { AuthSessionDto, AuthUserDto } from "@/application/contracts/authentication.contracts"
import type { SessionStorageGateway } from "@/application/contracts/infrastructure.contracts"
import { AuthenticationApiAdapter } from "@/infrastructure/data/adapters/authentication-api.adapter"
import { createApiClient } from "@/infrastructure/http"

import { createStorageAdapter, type KeyValueStorage } from "../storage"

const SESSION_STORAGE_KEY = "madar.auth.session"
const USER_STORAGE_KEY = "madar.auth.user"

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
    // An explicit logout/expired-refresh-token clear must never leave a stale offline-fallback
    // profile behind for restoreUser() to hand back after someone else signs in on this device.
    this.storage.removeItem(USER_STORAGE_KEY)
  }

  persistUser(user: AuthUserDto): void {
    this.storage.setItem(USER_STORAGE_KEY, JSON.stringify(user))
  }

  restoreUser(): AuthUserDto | null {
    const raw = this.storage.getItem(USER_STORAGE_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as AuthUserDto
    } catch {
      return null
    }
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
    const started = this.restore()
    if (!started) {
      // Nothing left to renew (signed out elsewhere, or the session ran out): the app must not
      // go on believing it is signed in.
      notifySessionEnded()
      return null
    }

    // One tab refreshes at a time. Each refresh replaces the refresh token, so two tabs doing it
    // together (both poll in the background) meant the slower one sent a token that had just been
    // replaced, was refused, and then wiped the session the faster one had saved -- signing every
    // tab out. Where the browser has no lock API the checks inside still cover it.
    const locks = typeof navigator === "undefined" ? undefined : navigator.locks
    if (locks?.request) {
      return locks.request(REFRESH_LOCK_NAME, () => this.refreshOnce(started))
    }
    return this.refreshOnce(started)
  }

  private async refreshOnce(started: AuthSessionDto): Promise<AuthSessionDto | null> {
    // Another tab refreshed while this one waited: use what it saved.
    const current = this.restore()
    if (!current) return null
    if (current.refreshToken.token !== started.refreshToken.token) return current

    try {
      const adapter = new AuthenticationApiAdapter(createApiClient())
      const refreshed = await adapter.refreshSession({ refreshToken: current.refreshToken.token })
      this.persist(refreshed)
      return refreshed
    } catch (error) {
      // Another tab got there first after all: its session is the valid one.
      const latest = this.restore()
      if (latest && latest.refreshToken.token !== current.refreshToken.token) return latest

      // Only the server saying "this session is over" ends it. A dropped connection, a timeout
      // or a server error at the moment the token expired is no reason to sign a cashier out
      // mid-shift: keep the session and let the next request try again.
      const status = (error as { status?: number } | null)?.status
      if (status === 400 || status === 401 || status === 403) {
        this.clear()
        notifySessionEnded()
      }
      return null
    }
  }
}

const REFRESH_LOCK_NAME = "madar-auth-refresh"

// Raised when the server refuses to renew the session, so the app can send the person to sign in
// again instead of leaving them on pages where every request now fails.
export const SESSION_ENDED_EVENT = "madar:session-ended"

function notifySessionEnded() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_ENDED_EVENT))
}

// The key the session is stored under, for noticing a sign-out made in another tab.
export const AUTH_SESSION_STORAGE_KEY = SESSION_STORAGE_KEY

export function createSessionManager(): SessionManager {
  return new SessionManager()
}

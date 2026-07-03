import type { AuthSessionDto } from "@/application/contracts/authentication.contracts"
import type { SessionStorageGateway } from "@/application/contracts/infrastructure.contracts"

import { createStorageAdapter, type KeyValueStorage } from "../storage"

const SESSION_STORAGE_KEY = "madar.auth.session"

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
}

export function createSessionManager(): SessionManager {
  return new SessionManager()
}

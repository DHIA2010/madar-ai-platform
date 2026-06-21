import type { ResolvedTrackingSdkConfiguration } from "./configuration"
import type { StorageAdapter } from "./storage"

export interface SessionState {
  sessionId: string
  startedAt: string
  lastSeenAt: string
  landingPage: string
}

function createSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export class SessionManager {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly config: ResolvedTrackingSdkConfiguration
  ) {}

  getSession(): SessionState | null {
    const raw = this.storage.getItem(this.config.sessionStorageKey)
    if (!raw) {
      return null
    }

    try {
      return JSON.parse(raw) as SessionState
    } catch {
      return null
    }
  }

  ensureSession(landingPage: string): SessionState {
    const existing = this.getSession()
    if (existing) {
      return existing
    }

    const now = new Date().toISOString()
    const session: SessionState = {
      sessionId: createSessionId(),
      startedAt: now,
      lastSeenAt: now,
      landingPage,
    }

    this.storage.setItem(this.config.sessionStorageKey, JSON.stringify(session))
    return session
  }

  touch(): void {
    const session = this.getSession()
    if (!session) {
      return
    }

    const next = {
      ...session,
      lastSeenAt: new Date().toISOString(),
    }

    this.storage.setItem(this.config.sessionStorageKey, JSON.stringify(next))
  }

  clearSession(): void {
    this.storage.removeItem(this.config.sessionStorageKey)
  }
}

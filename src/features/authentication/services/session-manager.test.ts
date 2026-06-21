import { describe, expect, it } from "vitest"

import type { Session } from "../types"
import { SessionManager } from "./session-manager"

function createSession(overrides?: Partial<Session>): Session {
  const now = Date.now()

  return {
    issuedAt: new Date(now).toISOString(),
    strategy: "storage",
    accessToken: {
      token: "access-token",
      tokenType: "Bearer",
      expiresAt: new Date(now + 60_000).toISOString(),
    },
    refreshToken: {
      token: "refresh-token",
      expiresAt: new Date(now + 120_000).toISOString(),
    },
    ...overrides,
  }
}

describe("SessionManager", () => {
  it("persists and restores a valid session", () => {
    const manager = new SessionManager("test.session")
    const session = createSession()

    manager.persist(session)

    expect(manager.restore()).toEqual(session)
  })

  it("clears session data", () => {
    const manager = new SessionManager("test.session.clear")
    manager.persist(createSession())

    manager.clear()

    expect(manager.restore()).toBeNull()
  })

  it("invalidates expired sessions", () => {
    const manager = new SessionManager("test.session.expired")
    const expiredSession = createSession({
      accessToken: {
        token: "expired-access",
        tokenType: "Bearer",
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
      },
    })

    manager.persist(expiredSession)

    expect(manager.isExpired(expiredSession)).toBe(true)
    expect(manager.restore()).toBeNull()
  })
})

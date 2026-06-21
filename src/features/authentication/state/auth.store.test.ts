import { beforeEach, describe, expect, it } from "vitest"

import type { Session, User } from "../types"
import { useAuthStore } from "./auth.store"

const mockUser: User = {
  id: "user-1",
  email: "demo@madar.ai",
  fullName: "Demo User",
  emailVerified: true,
  roles: [{ id: "role-1", name: "Admin", permissions: ["dashboard:view"] }],
  permissions: ["dashboard:view"],
}

const mockSession: Session = {
  issuedAt: new Date().toISOString(),
  strategy: "storage",
  accessToken: {
    token: "access-token",
    tokenType: "Bearer",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  },
  refreshToken: {
    token: "refresh-token",
    expiresAt: new Date(Date.now() + 120_000).toISOString(),
  },
}

describe("useAuthStore", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      session: null,
      status: "idle",
    })
  })

  it("authenticates user and session", () => {
    useAuthStore.getState().authenticate(mockUser, mockSession)

    const state = useAuthStore.getState()
    expect(state.user).toEqual(mockUser)
    expect(state.session).toEqual(mockSession)
    expect(state.status).toBe("authenticated")
  })

  it("clears auth state", () => {
    useAuthStore.getState().authenticate(mockUser, mockSession)
    useAuthStore.getState().clear()

    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.session).toBeNull()
    expect(state.status).toBe("unauthenticated")
  })
})

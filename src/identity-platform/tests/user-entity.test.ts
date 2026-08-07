import { describe, expect, it } from "vitest"

import { UserEntity, type UserState } from "../domain/entities"

function buildUserState(overrides: Partial<UserState> = {}): UserState {
  return {
    id: "user-1",
    email: "locked-user@madar.test",
    passwordHash: "hash",
    fullName: "Locked User",
    avatarUrl: null,
    timezone: "UTC",
    language: "en",
    status: "active",
    emailVerifiedAt: "2026-01-01T00:00:00.000Z",
    preferences: {},
    failedLoginAttempts: 0,
    lockoutUntil: null,
    activeWorkspaceId: null,
    primaryOrganizationId: null,
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

describe("UserEntity.ensureCanLogin", () => {
  it("blocks login while the lockout window is still in the future", () => {
    const nowMs = Date.parse("2026-01-01T00:00:00.000Z")
    const user = UserEntity.rehydrate(
      buildUserState({
        status: "locked",
        lockoutUntil: new Date(nowMs + 60_000).toISOString(),
      })
    )

    expect(user.ensureCanLogin(nowMs)).toEqual({
      allowed: false,
      reason: "locked",
      lockedUntil: new Date(nowMs + 60_000).toISOString(),
    })
  })

  it("allows login again once a stale lockout window has expired, even though status is still 'locked'", () => {
    const nowMs = Date.parse("2026-01-01T01:00:00.000Z")
    const user = UserEntity.rehydrate(
      buildUserState({
        status: "locked",
        lockoutUntil: new Date(nowMs - 60_000).toISOString(),
      })
    )

    expect(user.ensureCanLogin(nowMs)).toEqual({ allowed: true })
  })

  it("still blocks disabled accounts regardless of lockout window", () => {
    const nowMs = Date.parse("2026-01-01T00:00:00.000Z")
    const user = UserEntity.rehydrate(buildUserState({ status: "disabled", lockoutUntil: null }))

    expect(user.ensureCanLogin(nowMs)).toEqual({ allowed: false, reason: "forbidden" })
  })
})

describe("UserEntity.changePassword", () => {
  it("clears the lockout state so a password reset always restores access", () => {
    const user = UserEntity.rehydrate(
      buildUserState({
        status: "locked",
        failedLoginAttempts: 5,
        lockoutUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      })
    )

    user.changePassword("new-hash", "2026-01-01T02:00:00.000Z")
    const state = user.toState()

    expect(state.status).toBe("active")
    expect(state.failedLoginAttempts).toBe(0)
    expect(state.lockoutUntil).toBeNull()
  })
})

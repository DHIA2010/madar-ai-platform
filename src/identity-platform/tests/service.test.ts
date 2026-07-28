import { describe, expect, it } from "vitest"

import { IdentityPlatformService } from "../service"
import type { RequestContext } from "../types"

const context: RequestContext = {
  requestId: "request-1",
  correlationId: "correlation-1",
  ipAddress: "127.0.0.1",
  userAgent: "vitest",
  headers: {},
}

describe("IdentityPlatformService", () => {
  it("supports register, verify, login, refresh, profile update, and logout", async () => {
    const service = new IdentityPlatformService({
      jwtSecret: "test-secret-test-secret",
      tokenHashSecret: "test-token-secret-secret",
      postgresUrl: "postgresql://unused",
      redisUrl: "redis://unused",
      storagePath: ".tmp-identity-tests",
      emailFrom: "identity@test.local",
    })

    const registration = await service.register(
      {
        email: "owner@madar.test",
        password: "VeryStrongPassword123!",
        fullName: "Owner User",
        organizationName: "Madar Org",
        rememberMe: true,
        timezone: "Asia/Riyadh",
        language: "ar",
      },
      context
    )

    await service.verifyEmail({ token: registration.verificationToken }, context)

    const login = await service.login(
      {
        email: "owner@madar.test",
        password: "VeryStrongPassword123!",
        rememberMe: true,
      },
      context
    )

    expect(login.user.email).toBe("owner@madar.test")
    expect(login.session.accessToken).toBeTruthy()

    const refreshed = await service.refresh({ refreshToken: login.session.refreshToken }, context)
    expect(refreshed.refreshToken).toBeTruthy()

    const resolved = await service.resolveAccessToken(refreshed.accessToken)
    const updatedProfile = await service.updateProfile(
      resolved.user.id,
      {
        fullName: "Owner User Updated",
        language: "en",
        preferences: { rtl: true },
      },
      context
    )

    expect(updatedProfile.fullName).toBe("Owner User Updated")
    expect(updatedProfile.preferences.rtl).toBe(true)

    await service.logout({ sessionId: resolved.session.id }, context, resolved.user.id)

    await expect(service.resolveAccessToken(refreshed.accessToken)).rejects.toThrowError()
  })

  it("locks account after repeated failed attempts", async () => {
    const service = new IdentityPlatformService({
      jwtSecret: "test-secret-test-secret",
      tokenHashSecret: "test-token-secret-secret",
      postgresUrl: "postgresql://unused",
      redisUrl: "redis://unused",
      storagePath: ".tmp-identity-tests",
      emailFrom: "identity@test.local",
    })

    const registration = await service.register(
      {
        email: "locked@madar.test",
        password: "VeryStrongPassword123!",
        fullName: "Locked User",
        organizationName: "Madar Org",
        timezone: "UTC",
        language: "en",
      },
      context
    )
    await service.verifyEmail({ token: registration.verificationToken }, context)

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await service.login({ email: "locked@madar.test", password: "wrong" }, context)
      } catch {
        // expected
      }
    }

    await expect(
      service.login({ email: "locked@madar.test", password: "VeryStrongPassword123!" }, context)
    ).rejects.toThrowError()
  })
})

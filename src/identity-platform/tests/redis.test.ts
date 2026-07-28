import { describe, expect, it } from "vitest"

import { loadIdentityPlatformConfig } from "../configuration"
import { RedisCacheProvider } from "../infrastructure/redis/redis-cache-provider"
import { RedisRateLimiter } from "../infrastructure/redis/redis-rate-limiter"
import { RedisSessionRepository } from "../infrastructure/redis/redis-session-repository"
import { FakeRedisClient } from "./helpers/fake-redis-client"

describe("redis foundation", () => {
  const config = loadIdentityPlatformConfig({
    jwtSecret: "test-secret-test-secret",
    tokenHashSecret: "test-token-secret-secret",
    postgresUrl: "postgresql://unused",
    redisUrl: "redis://unused",
    storagePath: ".tmp-identity-tests",
    emailFrom: "identity@test.local",
  })

  it("persists sessions and resolves by refresh token hash", async () => {
    const client = new FakeRedisClient()
    const sessions = new RedisSessionRepository(client, config)

    await sessions.save({
      id: "session-1",
      userId: "user-1",
      organizationId: "org-1",
      workspaceId: "ws-1",
      refreshTokenHash: "refresh-hash",
      refreshTokenFamily: "family-1",
      revokedAt: null,
      rememberMe: false,
      userAgent: "vitest",
      ipAddress: "127.0.0.1",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    expect((await sessions.findById("session-1"))?.id).toBe("session-1")
    expect((await sessions.findByRefreshTokenHash("refresh-hash"))?.id).toBe("session-1")
  })

  it("supports distributed rate limiting and cache health", async () => {
    const client = new FakeRedisClient()
    const limiter = new RedisRateLimiter(client, config)
    const cache = new RedisCacheProvider(client, config)

    expect((await limiter.check("login:1", 2, 60_000)).allowed).toBe(true)
    expect((await limiter.check("login:1", 2, 60_000)).allowed).toBe(true)
    expect((await limiter.check("login:1", 2, 60_000)).allowed).toBe(false)

    await cache.set("foo", "bar", 60)
    expect(await cache.get("foo")).toBe("bar")
    expect((await cache.healthCheck()).ok).toBe(true)
  })
})

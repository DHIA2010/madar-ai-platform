import { newDb } from "pg-mem"
import { describe, expect, it } from "vitest"

import { HmacTokenService } from "../infrastructure/jwt/token-service"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { createPostgresRepositories } from "../infrastructure/postgres/repositories"
import { RedisSessionRepository } from "../infrastructure/redis/redis-session-repository"
import { FakeRedisClient } from "./helpers/fake-redis-client"
import { loadIdentityPlatformConfig } from "../configuration"

function createTestDatabase() {
  const mem = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = mem.adapters.createPg()
  const pool = new adapter.Pool()
  return { mem, database: new PostgresDatabase(pool) }
}

describe("postgres foundation", () => {
  it("validates migrations and persists user and audit records", async () => {
    const { database } = createTestDatabase()
    await runIdentityMigrations(database, process.cwd())

    const config = loadIdentityPlatformConfig({
      jwtSecret: "test-secret-test-secret",
      tokenHashSecret: "test-token-secret-secret",
      postgresUrl: "postgresql://unused",
      redisUrl: "redis://unused",
      storagePath: ".tmp-identity-tests",
      emailFrom: "identity@test.local",
    })
    const tokenService = new HmacTokenService(config.jwtSecret, config.tokenHashSecret)
    const sessions = new RedisSessionRepository(new FakeRedisClient(), config)
    const repositories = createPostgresRepositories({ db: database, tokenService, sessions })

    const userId = "00000000-0000-0000-0000-000000000001"

    await repositories.users.save({
      id: userId,
      email: "owner@test.local",
      passwordHash: "hash",
      fullName: "Owner",
      avatarUrl: null,
      timezone: "UTC",
      language: "en",
      status: "active",
      emailVerifiedAt: null,
      preferences: {},
      failedLoginAttempts: 0,
      lockoutUntil: null,
      activeWorkspaceId: null,
      primaryOrganizationId: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    const user = await repositories.users.findByEmail("owner@test.local")
    expect(user?.email).toBe("owner@test.local")

    await repositories.auditLogs.append({
      id: "00000000-0000-0000-0000-000000000002",
      actorUserId: userId,
      organizationId: null,
      workspaceId: null,
      action: "auth.login",
      targetType: "session",
      targetId: "00000000-0000-0000-0000-000000000003",
      details: { state: "ok" },
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
      createdAt: new Date().toISOString(),
    })

    expect(await repositories.auditLogs.count()).toBe(1)
  })
})

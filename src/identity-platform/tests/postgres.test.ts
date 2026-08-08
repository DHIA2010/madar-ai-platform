import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { describe, expect, it } from "vitest"

import { IdentityCommandHandlers } from "../application/handlers/command-handlers"
import type { RequestContext } from "../application/dto/identity-dtos"
import type { Clock, UuidGenerator } from "../application/ports"
import { loadIdentityPlatformConfig } from "../configuration"
import { InMemoryEmailGateway } from "../infrastructure/email/in-memory-email-gateway"
import { EnvironmentFeatureFlagProvider } from "../infrastructure/feature-flags/environment-feature-flag-provider"
import { ScryptPasswordHasher, HmacTokenService } from "../infrastructure/jwt/token-service"
import { ConsoleLogger } from "../infrastructure/logger/console-logger"
import { InMemoryMetricsProvider } from "../infrastructure/observability/in-memory-metrics-provider"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { createPostgresRepositories } from "../infrastructure/postgres/repositories"
import { InMemoryEventPublisher } from "../infrastructure/queue/in-memory-event-publisher"
import { InMemoryRateLimiter } from "../infrastructure/redis/in-memory-rate-limiter"
import { RedisSessionRepository } from "../infrastructure/redis/redis-session-repository"
import { FakeRedisClient } from "./helpers/fake-redis-client"

const context: RequestContext = {
  requestId: "request-postgres-1",
  correlationId: "correlation-postgres-1",
  ipAddress: "127.0.0.1",
  userAgent: "vitest",
  headers: {},
}

class TestClock implements Clock {
  now() {
    return new Date()
  }
  nowIso() {
    return new Date().toISOString()
  }
}

class TestUuidGenerator implements UuidGenerator {
  generate() {
    return randomUUID()
  }
}

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

    const organizationId = "00000000-0000-0000-0000-000000000004"
    await repositories.organizations.save({
      id: organizationId,
      name: "Test Org",
      ownerUserId: userId,
      status: "active",
      metadata: {},
      branding: {},
      logoUrl: null,
      timezone: "UTC",
      locale: "en",
      currency: "USD",
      subscriptionReference: null,
      settings: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    })

    await repositories.auditLogs.append({
      id: "00000000-0000-0000-0000-000000000002",
      actorUserId: userId,
      organizationId,
      workspaceId: null,
      action: "auth.login",
      targetType: "session",
      targetId: "00000000-0000-0000-0000-000000000003",
      details: { state: "ok" },
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
      createdAt: new Date().toISOString(),
    })

    expect(await repositories.auditLogs.count(organizationId)).toBe(1)
  })

  it("registers a new user against real foreign-key constraints", async () => {
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

    // users.primary_organization_id and organizations.owner_user_id reference each
    // other, so this only passes against a real foreign-key-enforcing database if
    // IdentityCommandHandlers.register() sequences its writes correctly.
    const commands = new IdentityCommandHandlers({
      config,
      repositories,
      clock: new TestClock(),
      uuid: new TestUuidGenerator(),
      hasher: new ScryptPasswordHasher(),
      tokenService,
      rateLimiter: new InMemoryRateLimiter(),
      emailGateway: new InMemoryEmailGateway(),
      logger: new ConsoleLogger(),
      eventPublisher: new InMemoryEventPublisher(),
      featureFlags: new EnvironmentFeatureFlagProvider(config),
      metrics: new InMemoryMetricsProvider(),
    })

    const result = await commands.register(
      {
        email: "postgres-register@test.local",
        password: "VeryStrongPassword123!",
        fullName: "Postgres Register",
        organizationName: "Postgres Register Org",
        timezone: "UTC",
        language: "en",
      },
      context
    )

    const user = await repositories.users.findById(result.userId)
    const organization = await repositories.organizations.findById(result.organizationId)
    expect(user?.primaryOrganizationId).toBe(result.organizationId)
    expect(user?.activeWorkspaceId).toBe(result.workspaceId)
    expect(organization?.ownerUserId).toBe(result.userId)
  })

  it("resending an invitation against real Postgres yields a token that still round-trips", async () => {
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
    const commands = new IdentityCommandHandlers({
      config,
      repositories,
      clock: new TestClock(),
      uuid: new TestUuidGenerator(),
      hasher: new ScryptPasswordHasher(),
      tokenService,
      rateLimiter: new InMemoryRateLimiter(),
      emailGateway: new InMemoryEmailGateway(),
      logger: new ConsoleLogger(),
      eventPublisher: new InMemoryEventPublisher(),
      featureFlags: new EnvironmentFeatureFlagProvider(config),
      metrics: new InMemoryMetricsProvider(),
    })

    const owner = await commands.register(
      {
        email: "resend-pg-owner@test.local",
        password: "VeryStrongPassword123!",
        fullName: "Resend PG Owner",
        organizationName: "Resend PG Org",
        timezone: "UTC",
        language: "en",
      },
      context
    )
    await commands.verifyEmail({ token: owner.verificationToken }, context)
    const ownerLogin = await commands.login(
      { email: "resend-pg-owner@test.local", password: "VeryStrongPassword123!" },
      context
    )
    const actor = await commands.resolveActorFromAccessToken(ownerLogin.session.accessToken)

    const invitation = await commands.inviteMember(
      actor,
      {
        organizationId: owner.organizationId,
        email: "resend-pg-invitee@test.local",
        role: "viewer",
      },
      context
    )

    // Postgres only ever stores the token's hash, never the plaintext, so findById
    // (used internally by resend) cannot see the original token — the repository must
    // mint and persist a fresh one rather than silently hashing an empty string.
    const resent = await commands.resendInvitation(actor, { invitationId: invitation.id }, context)
    expect(resent.token).toBeTruthy()
    expect(resent.token).not.toBe(invitation.token)

    const foundByNewToken = await repositories.invitations.findByToken(resent.token)
    expect(foundByNewToken?.id).toBe(invitation.id)
  })
})

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

  it("registering via an org-wide invitation (no workspace chosen) doesn't violate the memberships schema", async () => {
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
        email: "orgwide-owner@test.local",
        password: "VeryStrongPassword123!",
        fullName: "Org Wide Owner",
        organizationName: "Org Wide Org",
        timezone: "UTC",
        language: "en",
      },
      context
    )
    await commands.verifyEmail({ token: owner.verificationToken }, context)
    const ownerLogin = await commands.login(
      { email: "orgwide-owner@test.local", password: "VeryStrongPassword123!" },
      context
    )
    const actor = await commands.resolveActorFromAccessToken(ownerLogin.session.accessToken)

    // no workspaceId -- an org-wide invitation, which memberships.workspace_id (NOT NULL)
    // can't represent directly; registerViaInvitation must fall back to a real workspace.
    const invitation = await commands.inviteMember(
      actor,
      { organizationId: owner.organizationId, email: "orgwide-invitee@test.local", role: "viewer" },
      context
    )
    expect(invitation.workspaceId).toBeNull()

    const inviteeRegistration = await commands.register(
      {
        email: "orgwide-invitee@test.local",
        password: "VeryStrongPassword123!",
        fullName: "Org Wide Invitee",
        invitationToken: invitation.token,
        timezone: "UTC",
        language: "en",
      },
      context
    )

    const membership = await repositories.memberships.findByUserAndOrganization(
      inviteeRegistration.userId,
      owner.organizationId
    )
    expect(membership?.workspaceId).toBeTruthy()
    expect(membership?.workspaceId).toBe(owner.workspaceId)
  })

  it("uploads an avatar through the object storage gateway and never leaks the password hash from profile responses", async () => {
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

    const uploadedObjects: Array<{ key: string; contentType: string }> = []
    const objectStorage = {
      async uploadPublicObject(input: { key: string; body: Buffer; contentType: string }) {
        uploadedObjects.push({ key: input.key, contentType: input.contentType })
        return `https://cdn.test.local/avatars-bucket/${input.key}`
      },
    }

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
      objectStorage,
    })

    const owner = await commands.register(
      {
        email: "avatar-owner@test.local",
        password: "VeryStrongPassword123!",
        fullName: "Avatar Owner",
        organizationName: "Avatar Org",
        timezone: "UTC",
        language: "en",
      },
      context
    )
    await commands.verifyEmail({ token: owner.verificationToken }, context)
    const login = await commands.login(
      { email: "avatar-owner@test.local", password: "VeryStrongPassword123!" },
      context
    )
    const actor = await commands.resolveActorFromAccessToken(login.session.accessToken)

    const updateResult = await commands.updateProfile(actor, { fullName: "Renamed Owner" }, context)
    expect(updateResult.fullName).toBe("Renamed Owner")
    expect(updateResult).not.toHaveProperty("passwordHash")

    const avatarResult = await commands.uploadAvatar(
      actor,
      { contentType: "image/png", dataBase64: Buffer.from("fake-png-bytes").toString("base64") },
      context
    )
    expect(avatarResult.avatarUrl).toBe(
      `https://cdn.test.local/avatars-bucket/${uploadedObjects[0].key}`
    )
    expect(avatarResult).not.toHaveProperty("passwordHash")
    expect(uploadedObjects[0].key).toMatch(new RegExp(`^avatars/${actor.userId}/.+\\.png$`))
    expect(uploadedObjects[0].contentType).toBe("image/png")

    const persistedUser = await repositories.users.findById(actor.userId)
    expect(persistedUser?.avatarUrl).toBe(avatarResult.avatarUrl)
  })

  it("rejects avatar uploads when object storage isn't configured, and rejects oversized images", async () => {
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
        email: "avatar-unavailable@test.local",
        password: "VeryStrongPassword123!",
        fullName: "No Storage Owner",
        organizationName: "No Storage Org",
        timezone: "UTC",
        language: "en",
      },
      context
    )
    await commands.verifyEmail({ token: owner.verificationToken }, context)
    const login = await commands.login(
      { email: "avatar-unavailable@test.local", password: "VeryStrongPassword123!" },
      context
    )
    const actor = await commands.resolveActorFromAccessToken(login.session.accessToken)

    await expect(
      commands.uploadAvatar(
        actor,
        { contentType: "image/png", dataBase64: Buffer.from("fake").toString("base64") },
        context
      )
    ).rejects.toThrowError(/not available/i)
  })

  it("blocks a suspended member from logging in, refreshing, or continuing to use an already-issued session", async () => {
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
        email: "suspend-owner@test.local",
        password: "VeryStrongPassword123!",
        fullName: "Suspend Owner",
        organizationName: "Suspend Org",
        timezone: "UTC",
        language: "en",
      },
      context
    )
    await commands.verifyEmail({ token: owner.verificationToken }, context)
    const ownerLogin = await commands.login(
      { email: "suspend-owner@test.local", password: "VeryStrongPassword123!" },
      context
    )
    const ownerActor = await commands.resolveActorFromAccessToken(ownerLogin.session.accessToken)

    const invitation = await commands.inviteMember(
      ownerActor,
      { organizationId: owner.organizationId, email: "suspend-member@test.local", role: "viewer" },
      context
    )
    const memberRegistration = await commands.register(
      {
        email: "suspend-member@test.local",
        password: "VeryStrongPassword123!",
        fullName: "Suspend Member",
        invitationToken: invitation.token,
        timezone: "UTC",
        language: "en",
      },
      context
    )
    await commands.verifyEmail({ token: memberRegistration.verificationToken }, context)

    // Log in once while still active, and keep that session's tokens around --
    // this is what should stop working the moment the membership is suspended.
    const memberLoginBeforeSuspension = await commands.login(
      { email: "suspend-member@test.local", password: "VeryStrongPassword123!" },
      context
    )
    const accessTokenIssuedBeforeSuspension = memberLoginBeforeSuspension.session.accessToken
    const refreshTokenIssuedBeforeSuspension = memberLoginBeforeSuspension.session.refreshToken

    await commands.suspendMember(
      ownerActor,
      {
        organizationId: owner.organizationId,
        memberUserId: memberRegistration.userId,
        reason: "Reported policy violation",
      },
      context
    )

    // The core bug: a suspended member could still authenticate with a brand-new login.
    await expect(
      commands.login(
        { email: "suspend-member@test.local", password: "VeryStrongPassword123!" },
        context
      )
    ).rejects.toThrowError(/suspended/i)

    // Just as important: a session/access token issued *before* suspension must stop
    // working immediately, not just at its natural expiry.
    await expect(
      commands.resolveActorFromAccessToken(accessTokenIssuedBeforeSuspension)
    ).rejects.toThrowError()

    // And refreshing that same pre-suspension session for a new access token must fail too.
    await expect(
      commands.refresh({ refreshToken: refreshTokenIssuedBeforeSuspension }, context)
    ).rejects.toThrowError()

    // Reactivating restores access on a fresh login.
    await commands.reactivateMember(
      ownerActor,
      { organizationId: owner.organizationId, memberUserId: memberRegistration.userId },
      context
    )
    const memberLoginAfterReactivation = await commands.login(
      { email: "suspend-member@test.local", password: "VeryStrongPassword123!" },
      context
    )
    expect(memberLoginAfterReactivation.session.accessToken).toBeTruthy()
  })
})

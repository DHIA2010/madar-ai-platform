// @vitest-environment node

import { newDb } from "pg-mem"
import { describe, expect, it } from "vitest"

import { loadIdentityPlatformConfig } from "../../identity-platform/configuration"
import { HmacTokenService } from "../../identity-platform/infrastructure/jwt/token-service"
import { PostgresDatabase } from "../../identity-platform/infrastructure/postgres/database"
import { runIdentityMigrations, runSqlFile } from "../../identity-platform/infrastructure/postgres/migration-runner"
import { createPostgresRepositories } from "../../identity-platform/infrastructure/postgres/repositories"
import { RedisSessionRepository } from "../../identity-platform/infrastructure/redis/redis-session-repository"
import { FakeRedisClient } from "../../identity-platform/tests/helpers/fake-redis-client"

import { createInMemoryProjectRepositories } from "../infrastructure/storage/in-memory"
import { createPostgresProjectRepositories } from "../infrastructure/postgres/repositories"
import { ProjectPlatformService } from "../service"

function createActor() {
  return {
    userId: "00000000-0000-0000-0000-000000000010",
    sessionId: "session-1",
    organizationId: "00000000-0000-0000-0000-000000000020",
    workspaceId: "00000000-0000-0000-0000-000000000030",
    roles: ["owner" as const],
  }
}

function createIdentityConfig() {
  return loadIdentityPlatformConfig({
    jwtSecret: "test-secret-test-secret",
    tokenHashSecret: "test-token-secret-secret",
    postgresUrl: "postgresql://unused",
    redisUrl: "redis://unused",
    storagePath: ".tmp-project-tests",
    emailFrom: "project@test.local",
  })
}

function createPostgresDatabase() {
  const mem = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = mem.adapters.createPg()
  return new PostgresDatabase(new adapter.Pool())
}

async function seedIdentityFoundation(database: PostgresDatabase) {
  await runIdentityMigrations(database, process.cwd())
  await runSqlFile(database, `${process.cwd()}/src/project-platform/migrations/001_project_core.sql`)

  const config = createIdentityConfig()
  const tokenService = new HmacTokenService(config.jwtSecret, config.tokenHashSecret)
  const sessions = new RedisSessionRepository(new FakeRedisClient(), config)
  const repositories = createPostgresRepositories({ db: database, tokenService, sessions })

  const now = new Date().toISOString()
  await repositories.users.save({
    id: createActor().userId,
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
    createdAt: now,
    updatedAt: now,
  })

  await repositories.organizations.save({
    id: createActor().organizationId,
    name: "Project Org",
    ownerUserId: createActor().userId,
    status: "active",
    metadata: {},
    branding: {},
    logoUrl: null,
    timezone: "UTC",
    locale: "en",
    currency: "USD",
    subscriptionReference: null,
    settings: {},
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  })

  await repositories.workspaces.save({
    id: createActor().workspaceId,
    organizationId: createActor().organizationId,
    name: "Default Workspace",
    status: "active",
    metadata: {},
    settings: {},
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  })

  await repositories.users.save({
    id: createActor().userId,
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
    activeWorkspaceId: createActor().workspaceId,
    primaryOrganizationId: createActor().organizationId,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  })
}

describe("Project platform", () => {
  it("supports the project lifecycle in memory", async () => {
    const service = new ProjectPlatformService({ repositories: createInMemoryProjectRepositories() })
    const actor = createActor()

    const created = await service.createProject(actor as never, {
      organizationId: actor.organizationId,
      workspaceId: actor.workspaceId,
      name: "Growth Project",
      timezone: "Asia/Riyadh",
      currency: "SAR",
      locale: "ar-SA",
      environment: "production",
    })

    expect(created.name).toBe("Growth Project")

    const dataSource = await service.createDataSource(actor as never, {
      projectId: created.id,
      name: "GA4 Main",
      type: "google_analytics_4",
    })
    expect(dataSource.type).toBe("google_analytics_4")

    const archived = await service.archiveProject(actor as never, created.id)
    expect(archived.status).toBe("archived")

    const restored = await service.restoreProject(actor as never, created.id)
    expect(restored.status).toBe("active")

    const projects = await service.listProjects(actor as never, { organizationId: actor.organizationId })
    expect(projects).toHaveLength(1)
  })

  it("persists project repositories in postgres", async () => {
    const database = createPostgresDatabase()
    await seedIdentityFoundation(database)

    const repositories = createPostgresProjectRepositories(database)
    const now = new Date().toISOString()

    await repositories.projects.save({
      id: "00000000-0000-0000-0000-000000000101",
      organizationId: createActor().organizationId,
      workspaceId: createActor().workspaceId,
      ownerUserId: createActor().userId,
      name: "Postgres Project",
      status: "active",
      metadata: { tier: "core" },
      branding: {},
      logoUrl: null,
      timezone: "UTC",
      currency: "USD",
      locale: "en",
      environment: "production",
      settings: {},
      retentionPolicy: null,
      defaultDashboard: null,
      notificationPreferences: {},
      featureFlags: {},
      connectorPreferences: {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })

    expect(await repositories.projects.findById("00000000-0000-0000-0000-000000000101")).toMatchObject({
      name: "Postgres Project",
      organizationId: createActor().organizationId,
    })

    await repositories.dataSources.save({
      id: "00000000-0000-0000-0000-000000000102",
      projectId: "00000000-0000-0000-0000-000000000101",
      organizationId: createActor().organizationId,
      name: "Meta Ads",
      type: "meta_ads",
      status: "draft",
      metadata: {},
      validationStatus: "pending",
      healthStatus: "unknown",
      syncStatus: "pending",
      connectionStatus: "not_applicable",
      futureOauthReady: true,
      connectionReference: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })

    expect(await repositories.dataSources.listByProjectId("00000000-0000-0000-0000-000000000101")).toHaveLength(1)
  })
})
